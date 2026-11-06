import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState } from "../lib/ui-state.js";

test("old worker response requests extension reload instead of reading missing sites.length", () => {
  const legacy = {
    config: { version: 1, mode: "off", domains: ["example.com"], schedules: [] },
    active: false,
    warnings: [],
    error: null,
  };
  const state = normalizeState(legacy);
  assert.equal(state.config, null);
  assert.equal(state.reloadRequired, true);
  assert.match(state.error, /reload.*extension/i);
  assert.deepEqual(legacy.config.domains, ["example.com"]);
});
test("incomplete new worker response becomes a reload message without unsafe config", () => {
  for (const config of [{ version: 2 }, { version: 2, sites: null }, { version: 2, sites: [{}] }]) {
    const state = normalizeState({ config });
    assert.equal(state.config, null);
    assert.equal(state.reloadRequired, true);
  }
});
test("missing warnings and counters are normalized for valid current settings", () => {
  const state = normalizeState({
    config: { version: 2, sites: [{ domain: "example.com", mode: "block" }], schedule: null },
    active: true,
  });
  assert.deepEqual(state.warnings, []);
  assert.equal(state.blockedCount, 1);
  assert.equal(state.reloadRequired, false);
  assert.equal(state.error, null);
});
test("background load failures remain retryable and do not expose editable settings", () => {
  const state = normalizeState({ config: null, error: "Could not load settings." });
  assert.equal(state.config, null);
  assert.equal(state.reloadRequired, false);
  assert.deepEqual(state.warnings, []);
  assert.equal(state.error, "Could not load settings.");
  assert.throws(() => normalizeState(undefined), /response/i);
});
