import test from "node:test";
import assert from "node:assert/strict";
import { createController } from "../extension/lib/controller.js";
import { defaults } from "../extension/lib/config.js";

function mockChrome(initial) {
  const db = initial === undefined ? {} : { config: structuredClone(initial) };
  const alarms = new Map();
  const api = {
    db,
    alarmsMap: alarms,
    rules: [],
    updates: 0,
    failSave: false,
    failRules: false,
    storage: {
      local: {
        async get() {
          return structuredClone(db);
        },
        async set(value) {
          if (api.failSave) throw new Error("disk full");
          await Promise.resolve();
          Object.assign(db, structuredClone(value));
        },
        async setAccessLevel() {},
      },
    },
    alarms: {
      async get(name) {
        return alarms.get(name);
      },
      async create(name, info) {
        alarms.set(name, { ...info, name });
      },
      async clear(name) {
        return alarms.delete(name);
      },
    },
    declarativeNetRequest: {
      async getDynamicRules() {
        return structuredClone(api.rules);
      },
      async updateDynamicRules({ removeRuleIds, addRules }) {
        if (api.failRules) throw new Error("rule update failed");
        api.updates++;
        api.rules = [
          ...api.rules.filter((r) => !removeRuleIds.includes(r.id)),
          ...structuredClone(addRules),
        ];
      },
    },
  };
  return api;
}
const monday = () => new Date("2026-10-12T10:00:00");

const site = (domain, mode = "block") => ({ domain, mode });
const schedule = { days: [1], start: "09:00", end: "17:00" };
test("empty install and missing alarms recover without blocking", async () => {
  const api = mockChrome();
  const controller = createController(api, monday);
  const state = await controller.reconcile();
  assert.deepEqual(state.config, defaults());
  assert.equal(state.active, false);
  assert.equal(api.alarmsMap.get("health-check").periodInMinutes, 1);
  api.alarmsMap.clear();
  await controller.reconcile();
  assert.ok(api.alarmsMap.has("health-check"));
});
test("simultaneous changes preserve independent site modes and duplicate adds never overwrite modes", async () => {
  const api = mockChrome();
  const c = createController(api, monday);
  await Promise.all([
    c.handle({ type: "addDomain", domain: "a.com", mode: "block" }),
    c.handle({ type: "addDomain", domain: "b.com", mode: "unblocked" }),
  ]);
  assert.deepEqual(api.db.config.sites, [site("a.com"), site("b.com", "unblocked")]);
  await c.handle({ type: "addDomain", domain: "b.com", mode: "block" });
  assert.equal(api.db.config.sites[1].mode, "unblocked");
  await c.handle({ type: "setSiteMode", domain: "a.com", mode: "unblocked" });
  assert.equal((await c.reconcile()).active, false);
  assert.deepEqual(
    api.rules.map((r) => r.action.type),
    ["allow", "allow"],
  );
  await c.handle({ type: "removeDomain", domain: "a.com" });
  assert.deepEqual(api.db.config.sites, [site("b.com", "unblocked")]);
  assert.ok((await c.handle({ type: "setSiteMode", domain: "a.com", mode: "block" })).error);
});
test("scheduled site transitions even when another site stays blocked", async () => {
  const api = mockChrome({
    ...defaults(),
    sites: [site("a.com"), site("b.com", "schedule")],
    schedule,
  });
  let now = monday();
  const c = createController(api, () => now);
  assert.equal((await c.reconcile()).blockedCount, 2);
  assert.equal(
    api.alarmsMap.get("schedule-transition").when,
    new Date("2026-10-12T17:00:00").getTime(),
  );
  now = new Date("2026-10-12T17:00:00");
  assert.equal((await c.reconcile()).blockedCount, 1);
  assert.deepEqual(
    api.rules.map((r) => r.action.type),
    ["block", "allow"],
  );
});
test("shared schedule saves reject stale changes and clearing needs no site edits", async () => {
  const api = mockChrome({ ...defaults(), sites: [site("a.com", "schedule")] });
  const c = createController(api, monday);
  assert.equal(
    (await c.handle({ type: "saveSchedule", schedule, expectedSchedule: null })).error,
    null,
  );
  const stale = await c.handle({
    type: "saveSchedule",
    schedule: { ...schedule, start: "10:00" },
    expectedSchedule: null,
  });
  assert.match(stale.error, /changed/i);
  assert.deepEqual(api.db.config.schedule, schedule);
  await c.handle({ type: "saveSchedule", schedule: null, expectedSchedule: schedule });
  assert.equal(api.db.config.schedule, null);
  assert.equal(api.alarmsMap.has("schedule-transition"), false);
  assert.equal(api.db.config.sites[0].mode, "schedule");
});
test("invalid site modes, domains, schedules and actions never change storage", async () => {
  const api = mockChrome(defaults());
  const c = createController(api, monday);
  for (const message of [
    { type: "addDomain", domain: "a.com", mode: "invalid" },
    { type: "addDomain", domain: "*.com" },
    { type: "saveSchedule", schedule: {} },
    { type: "unexpected" },
  ]) {
    assert.ok((await c.handle(message)).error);
    assert.deepEqual(api.db.config, defaults());
  }
});
test("future schemas survive reads and writes, deliberate reset recovers", async () => {
  const api = mockChrome({ version: 99, secret: "preserve" });
  const c = createController(api, monday);
  assert.ok((await c.reconcile()).error);
  assert.ok((await c.handle({ type: "addDomain", domain: "a.com" })).error);
  assert.equal(api.db.config.version, 99);
  assert.equal((await c.handle({ type: "reset" })).error, null);
  assert.deepEqual(api.db.config, defaults());
});
test("legacy config modes and first schedule migrate on next edit", async () => {
  const api = mockChrome({
    version: 1,
    mode: "schedule",
    domains: ["a.com", "b.com"],
    schedules: [{ id: "old", ...schedule }],
  });
  const c = createController(api, monday);
  assert.deepEqual((await c.reconcile()).config.sites, [
    site("a.com", "schedule"),
    site("b.com", "schedule"),
  ]);
  await c.handle({ type: "setSiteMode", domain: "a.com", mode: "block" });
  assert.equal(api.db.config.version, 2);
  assert.deepEqual(api.db.config.schedule, schedule);
  assert.deepEqual(api.db.config.sites, [site("a.com"), site("b.com", "schedule")]);
});
test("storage failure retains previous rules and configuration", async () => {
  const api = mockChrome({ ...defaults(), sites: [site("a.com")] });
  const c = createController(api, monday);
  await c.reconcile();
  api.failSave = true;
  assert.match(
    (await c.handle({ type: "setSiteMode", domain: "a.com", mode: "unblocked" })).error,
    /save/i,
  );
  assert.equal(api.db.config.sites[0].mode, "block");
  assert.equal(api.rules[0].action.type, "block");
  api.failSave = false;
  assert.equal(
    (await c.handle({ type: "setSiteMode", domain: "a.com", mode: "unblocked" })).error,
    null,
  );
});
test("rule failures report saved state and getState retries without duplicating data", async () => {
  const api = mockChrome();
  const c = createController(api, monday);
  api.failRules = true;
  const state = await c.handle({ type: "addDomain", domain: "a.com" });
  assert.equal(state.saved, true);
  assert.equal(state.active, null);
  assert.match(state.error, /saved.*blocking/i);
  api.failRules = false;
  assert.equal((await c.handle({ type: "getState" })).active, true);
  assert.equal(api.db.config.sites.length, 1);
});
test("corrupt saved sites warn without silently overwriting storage", async () => {
  const raw = { ...defaults(), sites: [site("a.com"), site("bad")] };
  const api = mockChrome(raw);
  const state = await createController(api, monday).reconcile();
  assert.ok(state.warnings.length);
  assert.deepEqual(state.config.sites, [site("a.com")]);
  assert.deepEqual(api.db.config, raw);
});
