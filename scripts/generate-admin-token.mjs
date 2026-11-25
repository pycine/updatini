#!/usr/bin/env node
/**
 * Generate a strong admin token and store it where it is needed.
 *
 *   npm run token        → writes ADMIN_TOKEN as a Worker secret (production)
 *   npm run token:local  → writes ADMIN_TOKEN to .dev.vars (local dev only)
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runWrangler } from "./wrangler.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const local = args.includes("--local");
const help = args.includes("--help") || args.includes("-h");
const unknown = args.filter((arg) => !["--local", "--help", "-h"].includes(arg));

const USAGE = `Generate an ADMIN_TOKEN for Updatini.

Usage:
  npm run token                 Update the ADMIN_TOKEN Worker secret (production)
  npm run token:local           Write ADMIN_TOKEN to .dev.vars (local development)

Options:
  --local       Write to .dev.vars instead of the deployed Worker
  -h, --help    Show this help

The token is generated locally with 32 random bytes (64 hex characters).
Cloudflare cannot show the value again, so store it in a password manager.`;

if (help) {
  console.log(USAGE);
  process.exit(0);
}

if (unknown.length) {
  console.error(`Unknown option: ${unknown[0]}\n`);
  console.error(USAGE);
  process.exit(1);
}

if (!local && !existsSync(join(ROOT, "wrangler.toml"))) {
  console.error("✖ wrangler.toml not found. Run this script from a Updatini checkout.");
  process.exit(1);
}

const token = randomBytes(32).toString("hex");

if (local) {
  const file = join(ROOT, ".dev.vars");
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  const kept = lines.filter((line) => !/^\s*ADMIN_TOKEN\s*=/.test(line));

  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();

  const content = `${kept.length ? `${kept.join("\n")}\n` : ""}ADMIN_TOKEN="${token}"\n`;
  writeFileSync(file, content, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* chmod is not available on every platform */
  }

  console.log(`✓ Wrote a fresh ADMIN_TOKEN to ${relative(ROOT, file)} (local development only).`);
} else {
  const whoami = runWrangler(ROOT, ["whoami"], { stdio: "pipe" });

  if (whoami.status !== 0) {
    console.error("✖ Not logged in to Cloudflare.");
    console.error("  Run: npx wrangler login");
    console.error("  Then retry: npm run token");
    process.exit(1);
  }

  const result = runWrangler(ROOT, ["secret", "bulk"], {
    input: JSON.stringify({ ADMIN_TOKEN: token }),
  });

  if (result.status !== 0) {
    console.error("✖ Could not update the ADMIN_TOKEN secret.");
    const detail = (result.stderr || result.stdout || "").trim();
    if (detail) console.error(`\n${detail}`);
    process.exit(1);
  }

  console.log("✓ ADMIN_TOKEN updated on the deployed Worker.");
}

console.log("");
console.log("================================================================");
console.log("  New admin token — copy it now. It is not stored anywhere.");
console.log("================================================================");
console.log("");
console.log(`  ${token}`);
console.log("");

if (local) {
  console.log("  Use it with `npm run dev` — the token is already in .dev.vars.");
} else {
  console.log("  Open your Worker URL, paste it into “Admin token”, and connect.");
}

console.log("  Rotate at any time with `npm run token` or `npm run token:local`.");
