import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDomain, validateConfig, readConfig, defaults } from "../lib/config.js";
import { isBlocking, isScheduleActive, nextTransition } from "../lib/schedule.js";
import { compileRules } from "../lib/rules.js";
const window = (days, start, end) => ({ days, start, end });
const config = (schedule = null, mode = "schedule") => ({
  version: 2,
  sites: [{ domain: "example.com", mode }],
  schedule,
});
const date = (s) => new Date(s);

test("normalizes pasted URLs, IDNs, www, ports, and trailing dots", () => {
  assert.equal(normalizeDomain(" HTTPS://WWW.Example.COM.:8443/path?q=x#x "), "example.com");
  assert.equal(normalizeDomain("bücher.de"), "xn--bcher-kva.de");
  assert.equal(normalizeDomain("news.example.com/thing"), "news.example.com");
});
test("rejects malformed input, credentials, wildcards, IPs and unsupported schemes", () => {
  for (const input of [
    "",
    "localhost",
    "*.example.com",
    "https://a:b@example.com",
    "ftp://example.com",
    "chrome://settings",
    "127.0.0.1",
    "[::1]",
    "-a.com",
    "a_.com",
    "example..com",
    "foo .com",
    "https:///example.com",
    "https://example.com\\evil",
  ])
    assert.throws(() => normalizeDomain(input), undefined, input);
});
test("validates each site mode and exactly one shared schedule", () => {
  assert.deepEqual(
    validateConfig({
      ...config(window([1, 1, 2], "09:00", "17:00")),
      sites: [{ domain: "WWW.EXAMPLE.COM", mode: "block" }],
    }).sites,
    [{ domain: "example.com", mode: "block" }],
  );
  assert.deepEqual(
    validateConfig(config(window([1, 1, 2], "09:00", "17:00"))).schedule.days,
    [1, 2],
  );
  for (const schedule of [
    window([], "09:00", "17:00"),
    window([7], "09:00", "17:00"),
    window([1], "09:00", "09:00"),
    window([1], "25:00", "17:00"),
  ])
    assert.throws(() => validateConfig(config(schedule)));
  assert.throws(() => validateConfig(config(null, "oops")));
  assert.throws(() =>
    validateConfig({
      ...config(),
      sites: Array.from({ length: 1001 }, (_, i) => ({ domain: `a${i}.com`, mode: "block" })),
    }),
  );
});
test("migrates legacy global mode to per-site modes and preserves a shared schedule", () => {
  const schedule = { id: "work", ...window([1], "09:00", "17:00") };
  for (const [old, mode] of [
    ["off", "unblocked"],
    ["always", "block"],
    ["schedule", "schedule"],
  ]) {
    const result = readConfig({
      version: 1,
      mode: old,
      domains: ["example.com"],
      schedules: [schedule],
    });
    assert.deepEqual(result.config, {
      version: 2,
      sites: [{ domain: "example.com", mode }],
      schedule: window([1], "09:00", "17:00"),
    });
    assert.equal(result.migrated, true);
  }
  assert.ok(
    readConfig({ version: 1, domains: [], schedules: [schedule, { ...schedule, id: "two" }] })
      .warnings.length,
  );
});
test("defaults, warns on corrupt entries and rejects future schemas", () => {
  assert.deepEqual(readConfig(undefined).config, defaults());
  const result = readConfig({
    version: 2,
    sites: [
      { domain: "example.com", mode: "block" },
      { domain: "bad", mode: "block" },
    ],
    schedule: null,
  });
  assert.deepEqual(result.config.sites, [{ domain: "example.com", mode: "block" }]);
  assert.ok(result.warnings.length);
  assert.throws(() => readConfig({ version: 99 }));
});
test("block, scheduled and unblocked sites act independently", () => {
  const c = {
    version: 2,
    sites: [
      { domain: "block.com", mode: "block" },
      { domain: "scheduled.com", mode: "schedule" },
      { domain: "free.com", mode: "unblocked" },
    ],
    schedule: window([1], "09:00", "17:00"),
  };
  const active = compileRules(c, date("2026-10-12T10:00:00"));
  assert.deepEqual(
    active.map((r) => r.action.type),
    ["block", "block", "allow"],
  );
  assert.deepEqual(
    compileRules(c, date("2026-10-12T18:00:00")).map((r) => r.action.type),
    ["block", "allow", "allow"],
  );
  assert.equal(isBlocking(config(null, "block"), new Date()), true);
  assert.equal(isBlocking(config(null, "unblocked"), new Date()), false);
  assert.equal(isBlocking(config(), new Date()), false);
  assert.equal(isBlocking(defaults(), new Date()), false);
});
test("schedule boundaries are inclusive/exclusive, transitions run even with always-blocked sites", () => {
  const c = config(window([1], "09:00", "17:00"));
  assert.equal(isBlocking(c, date("2026-10-12T08:59:59")), false);
  assert.equal(isBlocking(c, date("2026-10-12T09:00:00")), true);
  assert.equal(isBlocking(c, date("2026-10-12T17:00:00")), false);
  c.sites.push({ domain: "always.com", mode: "block" });
  assert.equal(
    nextTransition(c, date("2026-10-12T16:59:30")).getTime(),
    date("2026-10-12T17:00:00").getTime(),
  );
});
test("overnight windows start on selected day and roll across week boundaries", () => {
  const c = config(window([0], "22:00", "02:00"));
  assert.equal(isBlocking(c, date("2026-10-11T23:00:00")), true);
  assert.equal(isBlocking(c, date("2026-10-12T01:59:59")), true);
  assert.equal(isBlocking(c, date("2026-10-12T02:00:00")), false);
  assert.equal(isBlocking(c, date("2026-10-12T23:00:00")), false);
  assert.equal(
    nextTransition(c, date("2026-10-12T02:00:00")).getTime(),
    date("2026-10-18T22:00:00").getTime(),
  );
});
test("DST gaps and folds follow actual local clock", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Chicago";
  try {
    assert.equal(
      nextTransition(
        config(window([0], "02:15", "03:30")),
        date("2026-03-08T01:59:00-06:00"),
      ).toISOString(),
      "2026-03-08T08:00:00.000Z",
    );
    const c = config(window([0], "01:30", "02:30"));
    assert.equal(
      nextTransition(c, date("2026-11-01T01:45:00-05:00")).toISOString(),
      "2026-11-01T07:00:00.000Z",
    );
    assert.equal(isScheduleActive(c.schedule, date("2026-11-01T01:15:00-06:00")), false);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("rules match only HTTP(S) top-level exact hostnames and descendants", () => {
  const [rule] = compileRules(config(null, "block"), new Date());
  assert.deepEqual(rule.condition.resourceTypes, ["main_frame"]);
  const re = new RegExp(rule.condition.regexFilter);
  for (const url of [
    "https://example.com/",
    "http://a.example.com:8080/a",
    "https://a.b.example.com/",
    "https://example.com./",
  ])
    assert.ok(re.test(url), url);
  for (const url of [
    "https://example.company/",
    "https://unrelatedexample.com/",
    "https://other.com/?example.com",
    "ftp://example.com/",
  ])
    assert.equal(re.test(url), false, url);
});
test("most-specific site wins, including unblocked and inactive-schedule child overrides", () => {
  const c = {
    version: 2,
    sites: [
      { domain: "example.com", mode: "block" },
      { domain: "sub.example.com", mode: "unblocked" },
      { domain: "deep.sub.example.com", mode: "block" },
    ],
    schedule: null,
  };
  const rules = compileRules(c, new Date());
  const action = (url) =>
    rules
      .filter((r) => new RegExp(r.condition.regexFilter).test(url))
      .sort((a, b) => b.priority - a.priority)[0]?.action.type;
  assert.equal(action("https://example.com/"), "block");
  assert.equal(action("https://sub.example.com/"), "allow");
  assert.equal(action("https://deep.sub.example.com/"), "block");
  c.sites[1].mode = "schedule";
  assert.equal(compileRules(c, new Date())[1].action.type, "allow");
});
