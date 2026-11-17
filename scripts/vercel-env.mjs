/**
 * Copy the settings in .env.local to the linked Vercel project (Production),
 * without ever printing a value.
 *
 *   npm run deploy:env -- https://your-app.vercel.app
 *
 * The address you pass becomes NEXT_PUBLIC_APP_URL. STRIPE_WEBHOOK_SECRET is
 * skipped on purpose: the local one (from `stripe listen`) does not work on the
 * live site. Create a webhook in the Stripe Dashboard and add its secret in
 * Vercel by hand (see DEPLOY.md).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const appUrl = process.argv[2];
if (!appUrl || !/^https:\/\/[^\s/]+$/.test(appUrl.replace(/\/$/, ""))) {
  console.error("Pass the live address, e.g.  npm run deploy:env -- https://detty.vercel.app");
  process.exit(1);
}

const env = parse(readFileSync(".env.local"));
env.NEXT_PUBLIC_APP_URL = appUrl.replace(/\/$/, "");
const SKIP = new Set(["STRIPE_WEBHOOK_SECRET"]);

let failed = 0;
for (const [name, value] of Object.entries(env)) {
  if (SKIP.has(name)) {
    console.log(`skip  ${name} (set this one in Vercel by hand)`);
    continue;
  }
  if (!value) {
    console.log(`skip  ${name} (empty)`);
    continue;
  }
  // The value goes in on stdin, so it never appears in the command line or the output.
  const res = spawnSync(`npx vercel@latest env add ${name} production --force`, {
    input: value,
    shell: true,
    encoding: "utf8",
  });
  if (res.status === 0) console.log(`set   ${name}`);
  else {
    failed += 1;
    console.log(`FAIL  ${name}: ${(res.stderr || "").split("\n").filter(Boolean).pop() ?? "unknown error"}`);
  }
}
process.exit(failed ? 1 : 0);
