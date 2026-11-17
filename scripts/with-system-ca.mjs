/**
 * Runs a command with Node told to trust the operating system's certificate store.
 *
 *   node scripts/with-system-ca.mjs next dev
 *
 * Why: antivirus "web shields" (Avast, AVG, Kaspersky...) and some office networks
 * re-sign HTTPS traffic with their own root certificate. Browsers trust it because
 * it is installed in Windows, but Node ships its own certificate list and rejects
 * it, so server-side calls to Supabase / Stripe / Anthropic fail with "fetch failed"
 * (UNABLE_TO_VERIFY_LEAF_SIGNATURE). This keeps TLS verification ON; it only adds
 * the certificates the OS already trusts. It is a no-op on machines without interception.
 */
import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-system-ca.mjs <command> [...args]");
  process.exit(1);
}

const flag = "--use-system-ca";
const current = process.env.NODE_OPTIONS ?? "";
const env = {
  ...process.env,
  NODE_OPTIONS: current.includes(flag) ? current : `${current} ${flag}`.trim(),
};

// shell: true so the local node_modules/.bin commands (next, tsx, drizzle-kit) resolve on Windows too.
const child = spawn([command, ...args].join(" "), { stdio: "inherit", shell: true, env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
