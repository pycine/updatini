/**
 * Small helper shared by the maintenance scripts.
 *
 * Prefers the locally installed Wrangler (npm install) and falls back to
 * `npx --yes wrangler@4` so the scripts also work in a fresh checkout.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const WINDOWS = process.platform === "win32";
const NPX = WINDOWS ? "npx.cmd" : "npx";

/**
 * Run a Wrangler command from the repository root.
 *
 * @param {string} root Repository root.
 * @param {string[]} args Arguments passed to Wrangler.
 * @param {import("node:child_process").SpawnSyncOptions} options spawnSync options.
 */
export function runWrangler(root, args, options = {}) {
  const local = join(root, "node_modules", ".bin", WINDOWS ? "wrangler.cmd" : "wrangler");
  const useLocal = existsSync(local);
  const command = useLocal ? local : NPX;
  const finalArgs = useLocal ? args : ["--yes", "wrangler@4", ...args];

  return spawnSync(command, finalArgs, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    // .cmd shims need a shell on Windows.
    shell: WINDOWS,
    ...options,
  });
}
