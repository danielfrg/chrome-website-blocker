import { mkdir, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const extension = fileURLToPath(new URL("../extension/", import.meta.url));
const output = `${root}dist/siteblocker.zip`;
await mkdir(`${root}dist`, { recursive: true });
await rm(output, { force: true });
const files = [];
async function list(dir = "") {
  for (const entry of await readdir(`${extension}${dir}`, { withFileTypes: true })) {
    if (entry.isDirectory()) await list(`${dir}${entry.name}/`);
    else files.push(`${dir}${entry.name}`);
  }
}
await list();
const result = spawnSync("zip", ["-q", "-X", output, ...files.sort()], {
  cwd: extension,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Created ${output}`);
