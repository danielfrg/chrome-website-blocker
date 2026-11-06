// Optional integration check. Uses an existing Playwright installation; it is not a runtime dependency.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright"
);
const extension = fileURLToPath(new URL("../extension/", import.meta.url));
const screenshots = fileURLToPath(new URL("../dist/screenshots/", import.meta.url));
await mkdir(screenshots, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "siteblocker-"));
const received = [];
const server = createServer((req, res) => {
  received.push(`${req.headers.host}${req.url}`);
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><title>Local fixture</title><h1>Allowed test website</h1>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const target = (host) => `http://${host}:${port}`;
const errors = [],
  outgoing = [];
let context;
const launch = () =>
  chromium.launchPersistentContext(profile, {
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
    channel: "chromium",
    headless: true,
    viewport: { width: 1100, height: 950 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--host-resolver-rules=MAP *.blocker.test 127.0.0.1",
      "--no-proxy-server",
    ],
  });
const observe = (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    if (/^https?:/.test(req.url())) outgoing.push(req.url());
  });
};
async function workerFor(ctx) {
  return ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 10000 }));
}
async function blocked(page, url) {
  const probe = await page.context().newPage();
  try {
    await assert.rejects(probe.goto(url), /ERR_BLOCKED_BY_CLIENT/);
    assert.equal(
      received.some((r) => r.endsWith(new URL(url).pathname)),
      false,
      "blocked navigation reached fixture server",
    );
  } finally {
    await probe.close();
  }
}
try {
  context = await launch();
  let worker = await workerFor(context);
  const origin = worker.url().replace(/\/background\.js$/, "");
  // Reproduce an old background worker responding to freshly refreshed extension pages.
  for (const file of ["options.html", "popup.html"]) {
    const stale = await context.newPage();
    observe(stale);
    await stale.addInitScript(() => {
      chrome.runtime.sendMessage = async () => ({
        config: { version: 1, mode: "off", domains: ["example.com"], schedules: [] },
        warnings: [],
        active: false,
        error: null,
      });
      chrome.runtime.reload = () => {
        globalThis.reloadRequested = true;
      };
    });
    await stale.goto(`${origin}/${file}`);
    await stale.locator("#feedback").filter({ hasText: "Reload the extension" }).waitFor();
    assert.doesNotMatch(await stale.locator("#feedback").textContent(), /Cannot read properties/);
    assert.equal(
      await stale
        .locator("fieldset[data-controls]")
        .first()
        .evaluate((element) => element.disabled),
      true,
    );
    assert.equal(
      await stale
        .locator("fieldset[data-controls] input, fieldset[data-controls] select")
        .first()
        .isDisabled(),
      true,
    );
    assert.equal(await stale.locator("#retry").isVisible(), false);
    await stale.getByRole("button", { name: "Reload extension", exact: true }).click();
    assert.equal(await stale.evaluate(() => globalThis.reloadRequested), true);
    await stale.close();
  }
  console.log(
    "PASS stale-worker response on settings and popup: safe reload action, no TypeErrors",
  );
  const site = await context.newPage();
  await site.goto(`${target("site.blocker.test")}/baseline`);
  const options = await context.newPage();
  observe(options);
  await options.goto(`${origin}/options.html`);
  await options.getByText("No sites added yet", { exact: true }).waitFor({ state: "attached" });
  assert.equal(
    await options.locator("#status").evaluate((el) => getComputedStyle(el).clipPath),
    "inset(50%)",
  );
  assert.equal(
    await options.locator("#sites .empty").evaluate((el) => getComputedStyle(el).textAlign),
    "left",
  );
  for (const id of ["domain", "new-mode", "start"]) {
    await options.locator(`#${id}`).focus();
    const style = await options.locator(`#${id}`).evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineColor, border: s.borderTopColor, offset: s.outlineOffset };
    });
    assert.equal(style.outline, style.border);
    assert.equal(style.offset, "-2px");
  }
  const add = async (domain, mode = "block") => {
    await options.getByLabel("Domain or website URL").fill(domain);
    await options.getByLabel("Blocking for new site", { exact: true }).selectOption(mode);
    await options.getByRole("button", { name: "Add", exact: true }).click();
    await options.getByLabel(`Blocking for ${domain}`, { exact: true }).waitFor();
    await options
      .locator("#header-feedback")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    assert.equal(await options.locator("#feedback").isVisible(), false);
    assert.equal(
      await options
        .locator("#header-feedback")
        .evaluate((el) => el.parentElement.classList.contains("brand")),
      true,
    );
  };
  await options.getByLabel("Domain or website URL").fill("*.bad");
  await options.getByRole("button", { name: "Add", exact: true }).click();
  await options.locator("#feedback").filter({ hasText: "without wildcards" }).waitFor();
  assert.equal(await options.getByLabel("Domain or website URL").inputValue(), "*.bad");
  await add("site.blocker.test");
  await blocked(site, `${target("site.blocker.test")}/blocked-exact`);
  await blocked(site, `${target("sub.site.blocker.test")}/blocked-subdomain`);
  await site.goto(`${target("unrelatedsite.blocker.test")}/lookalike-allowed`);
  await add("sub.site.blocker.test", "unblocked");
  await site.goto(`${target("sub.site.blocker.test")}/explicit-exception-allowed`);
  await blocked(site, `${target("site.blocker.test")}/parent-still-blocked`);
  console.log("PASS independent Block/Unblocked modes and most-specific hostname exception");

  await add("scheduled.blocker.test", "schedule");
  await site.goto(`${target("scheduled.blocker.test")}/no-schedule-allowed`);
  await options.getByLabel("Start time", { exact: true }).fill("09:00");
  await options.getByLabel("End time", { exact: true }).fill("09:00");
  await options.getByRole("button", { name: "Save schedule", exact: true }).click();
  await options
    .locator("#feedback")
    .filter({ hasText: "different valid start and end times" })
    .waitFor();
  const clock = await options.evaluate(() => {
    const now = new Date(),
      start = new Date(now.getTime() - 120000),
      end = new Date(now.getTime() + 120000);
    const fmt = (d) =>
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { day: start.getDay(), start: fmt(start), end: fmt(end) };
  });
  for (const input of await options.locator("#days input").all())
    await input.setChecked(Number(await input.getAttribute("value")) === clock.day);
  await options.getByLabel("Start time", { exact: true }).fill(clock.start);
  await options.getByLabel("End time", { exact: true }).fill(clock.end);
  await options.getByRole("button", { name: "Save schedule", exact: true }).click();
  await options
    .getByText("2 of 3 sites blocked now", { exact: true })
    .waitFor({ state: "attached" });
  await blocked(site, `${target("scheduled.blocker.test")}/blocked-by-shared-schedule`);
  await options
    .getByLabel("Blocking for scheduled.blocker.test", { exact: true })
    .selectOption("unblocked");
  await options
    .getByText("1 of 3 sites blocked now", { exact: true })
    .waitFor({ state: "attached" });
  await site.goto(`${target("scheduled.blocker.test")}/unblocked-individually`);
  await blocked(site, `${target("site.blocker.test")}/other-site-unaffected`);
  await options
    .getByLabel("Blocking for scheduled.blocker.test", { exact: true })
    .selectOption("schedule");
  await options
    .getByText("2 of 3 sites blocked now", { exact: true })
    .waitFor({ state: "attached" });
  console.log("PASS one shared schedule, invalid time recovery and per-site mode changes");

  const other = await context.newPage();
  observe(other);
  await other.goto(`${origin}/options.html`);
  await other.getByText("2 of 3 sites blocked now", { exact: true }).waitFor({ state: "attached" });
  assert.equal(
    await other.getByRole("heading", { name: "Schedule", exact: true }).isVisible(),
    true,
  );
  assert.equal(await other.getByLabel("Start time", { exact: true }).isVisible(), true);
  await options.getByLabel("Start time", { exact: true }).fill("08:00");
  await other.getByLabel("Start time", { exact: true }).fill("07:00");
  await other.getByRole("button", { name: "Save schedule", exact: true }).click();
  await other
    .locator("#schedule-feedback")
    .filter({ hasText: /^Saved$/ })
    .waitFor();
  assert.equal(await other.locator("#feedback").isVisible(), false);
  await options.getByRole("button", { name: "Save schedule", exact: true }).click();
  await options.locator("#feedback").filter({ hasText: "changed in another tab" }).waitFor();
  assert.equal(await options.getByLabel("Start time", { exact: true }).inputValue(), "08:00");
  await options.getByRole("button", { name: "Reload schedule", exact: true }).click();
  await options.waitForFunction(() => document.getElementById("start").value === "07:00");
  assert.equal(await options.getByLabel("Start time", { exact: true }).inputValue(), "07:00");
  console.log("PASS shared-schedule stale edits rejected and reload recovers");

  await worker.evaluate(() => {
    globalThis.originalRuleUpdate = chrome.declarativeNetRequest.updateDynamicRules;
    chrome.declarativeNetRequest.updateDynamicRules = async () => {
      throw new Error("simulated Chrome failure");
    };
  });
  await options
    .getByLabel("Blocking for site.blocker.test", { exact: true })
    .selectOption("unblocked");
  await options.locator("#feedback").filter({ hasText: "Settings saved, but blocking" }).waitFor();
  assert.equal(
    await options.getByLabel("Blocking for site.blocker.test", { exact: true }).inputValue(),
    "unblocked",
  );
  await worker.evaluate(() => {
    chrome.declarativeNetRequest.updateDynamicRules = globalThis.originalRuleUpdate;
  });
  await options.getByRole("button", { name: "Retry", exact: true }).click();
  await options
    .getByText("1 of 3 sites blocked now", { exact: true })
    .waitFor({ state: "attached" });
  await site.goto(`${target("site.blocker.test")}/unblocked-after-retry`);
  await options.getByLabel("Blocking for site.blocker.test", { exact: true }).selectOption("block");
  await options
    .getByText("2 of 3 sites blocked now", { exact: true })
    .waitFor({ state: "attached" });
  console.log("PASS saved per-site selection survives a Chrome rule failure and Retry");

  assert.equal(await options.getByLabel("Start time", { exact: true }).isVisible(), true);
  await options.screenshot({ path: join(screenshots, "settings-desktop.png"), fullPage: true });
  await options.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await options.screenshot({ path: join(screenshots, "settings-narrow.png"), fullPage: true });
  const popup = await context.newPage();
  observe(popup);
  await popup.setViewportSize({ width: 360, height: 450 });
  await popup.goto(`${origin}/popup.html`);
  await popup.getByText("2 of 3 sites blocked now", { exact: true }).waitFor({ state: "attached" });
  assert.equal(
    await popup.locator("#status").evaluate((el) => getComputedStyle(el).clipPath),
    "inset(50%)",
  );
  assert.equal(
    await popup.getByRole("heading", { name: "SiteBlocker", exact: true }).isVisible(),
    true,
  );
  await popup.getByText("Open a regular website to add it here.", { exact: true }).waitFor();
  assert.equal(await popup.locator("#add-current").isDisabled(), true);
  await popup.screenshot({ path: join(screenshots, "popup.png"), fullPage: true });
  assert.deepEqual(outgoing, []);
  assert.deepEqual(errors, []);
  await context.close();
  context = null;
  context = await launch();
  worker = await workerFor(context);
  const config = await worker.evaluate(
    async () => (await chrome.storage.local.get("config")).config,
  );
  assert.equal(config.version, 2);
  assert.equal(config.sites.length, 3);
  assert.equal(config.sites.find((s) => s.domain === "site.blocker.test").mode, "block");
  const afterRestart = await context.newPage();
  await blocked(afterRestart, `${target("site.blocker.test")}/blocked-after-restart`);
  console.log(
    "PASS restart persistence, compact responsive table, popup, zero UI network requests/errors",
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
