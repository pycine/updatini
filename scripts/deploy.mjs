#!/usr/bin/env node
/**
 * Deploy the Worker and its static assets to Cloudflare.
 *
 * This wraps `wrangler deploy` with a couple of guard rails:
 *   - checks that wrangler.toml exists
 *   - checks that you are logged in (unless --dry-run)
 *   - warns when the ADMIN_TOKEN secret has not been set
 *
 * Extra arguments are forwarded to Wrangler, so:
 *   npm run deploy -- --dry-run
 *   npm run deploy -- --env staging
 * both work.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWrangler } from "./wrangler.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const help = args.includes("--help") || args.includes("-h");
const dryRun = args.includes("--dry-run");

const USAGE = `Deploy Updatini to Cloudflare.

Usage:
  npm run deploy                 Deploy the Worker and static assets
  npm run deploy -- --dry-run    Compile and bundle without deploying

Extra arguments are forwarded to \`wrangler deploy\`.
The ADMIN_TOKEN secret must be set with \`npm run token\` before the console can log in.`;

if (help) {
  console.log(USAGE);
  process.exit(0);
}

if (!existsSync(join(ROOT, "wrangler.toml"))) {
  console.error("✖ wrangler.toml not found. Run this script from a Updatini checkout.");
  process.exit(1);
}

if (!dryRun) {
  const whoami = runWrangler(ROOT, ["whoami"], { stdio: "pipe" });

  if (whoami.status !== 0) {
    console.error("✖ Not logged in to Cloudflare.");
    console.error("  Run: npx wrangler login");
    console.error("  Then retry: npm run deploy");
    process.exit(1);
  }

  const secrets = runWrangler(ROOT, ["secret", "list"], { stdio: "pipe" });
  const hasAdminToken = secrets.status === 0 && /"name"\s*:\s*"ADMIN_TOKEN"/.test(secrets.stdout);

  if (!hasAdminToken) {
    console.warn("⚠ ADMIN_TOKEN is not set on this Worker.");
    console.warn("  The deployed console will reject every login until you run: npm run token");
    console.warn("");
  }
}

console.log(dryRun ? "Bundling a dry-run build (nothing will be deployed)…" : "Deploying Updatini to Cloudflare…");
console.log("");

const result = runWrangler(ROOT, ["deploy", ...args], { stdio: "inherit" });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("");
console.log("✓ Deploy finished.");
console.log("  If this was your first deploy, run `npm run token` and then open the URL above.");
