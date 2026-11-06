import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
const root = new URL("../extension/", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const manifest = JSON.parse(await read("manifest.json"));

test("manifest requests only four required permissions and local entry points", async () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ["activeTab", "alarms", "declarativeNetRequest", "storage"].sort(),
  );
  for (const key of [
    "host_permissions",
    "content_scripts",
    "externally_connectable",
    "web_accessible_resources",
  ])
    assert.equal(manifest[key], undefined);
  const paths = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
  ];
  for (const path of paths) await access(new URL(path, root));
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
});
test("every HTML asset is bundled, inline scripts and event handlers are absent", async () => {
  for (const file of ["popup.html", "options.html"]) {
    const html = await read(file);
    assert.ok(html.includes("aria-live="));
    assert.doesNotMatch(html, /\son\w+=|<script(?![^>]*src=)/i);
    for (const [, path] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.doesNotMatch(path, /^(?:https?:|\/\/)/);
      if (!path.startsWith("#")) await access(new URL(path, root));
    }
  }
});
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) result.push(...(await files(url)));
    else result.push(url);
  }
  return result;
}
test("extension code contains no network clients, sync or history collection", async () => {
  for (const file of await files(root)) {
    if (!/\.(js|html|css)$/.test(file.pathname)) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|storage\.sync|chrome\.history|https?:\/\/[a-z0-9]/i,
      file.pathname,
    );
  }
});
