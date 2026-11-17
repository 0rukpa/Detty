/**
 * DEV TOOL (until Phase 4 builds real verification): mark an account as a
 * verified Plug so it can publish PAID events and exercise the money flow.
 *
 *   npm run dev:verify-plug -- yourhandle
 *   npm run dev:verify-plug -- yourhandle --certified   (also grants Certified Plug: 50% early access)
 *
 * Refuses to run against live Stripe keys.
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../src/db/schema";
import { parseDatabaseUrl } from "../src/db/url";

config({ path: ".env.local", quiet: true });

const [handleArg, ...flags] = process.argv.slice(2);
const handle = (handleArg ?? "").replace(/^@/, "");
if (!handle) {
  console.error("Usage: npm run dev:verify-plug -- <handle> [--certified]");
  process.exit(1);
}
if (/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")) {
  console.error("Refusing to run with live Stripe keys.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const p = parseDatabaseUrl(process.env.DATABASE_URL);
const client = postgres({ host: p.host, port: p.port, database: p.database, username: p.user, password: p.password, ssl: "require", prepare: false, max: 1 });
const db = drizzle(client);
const certified = flags.includes("--certified");

const updated = await db
  .update(users)
  .set({ isPlug: true, plugStatus: "verified", ...(certified ? { certifiedPlug: true, ratingAvg: 4.6, ratingCount: 120 } : {}) })
  .where(sql`lower(${users.handle}) = ${handle.toLowerCase()}`)
  .returning({ handle: users.handle });

console.log(updated.length ? `@${updated[0].handle} is now a verified${certified ? ", Certified" : ""} Plug (dev shortcut).` : `No user with the handle @${handle}.`);
await client.end();
