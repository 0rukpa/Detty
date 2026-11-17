/**
 * Remove the demo data created by `npm run db:seed`: the mock events (with their
 * tiers, flyers, stories and co-signs), the mock host accounts, and the files
 * under `seed/` in Storage. Gbedu packs are kept: they are real product config.
 *
 *   npm run db:remove-demo            (dry run: only reports what would go)
 *   npm run db:remove-demo -- --yes   (actually deletes)
 *
 * Real accounts and the events they created are never touched.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { parseDatabaseUrl } from "../src/db/url";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const p = parseDatabaseUrl(url);
const sql = postgres({ host: p.host, port: p.port, database: p.database, username: p.user, password: p.password, ssl: "require", prepare: false, max: 1 });

const apply = process.argv.includes("--yes");
const hostIds = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);

const count = async (q: Promise<{ n: number }[]>) => (await q)[0].n;

try {
  const eventIds = (await sql<{ id: string }[]>`select id from events where owner_id in ${sql(hostIds)}`).map((r) => r.id);
  const ev = eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"];

  const report = {
    "mock events": eventIds.length,
    "mock host accounts": await count(sql`select count(*)::int n from users where id in ${sql(hostIds)}`),
    "orders on mock events": await count(sql`select count(*)::int n from orders where event_id in ${sql(ev)}`),
    "paid orders on mock events": await count(sql`select count(*)::int n from orders where event_id in ${sql(ev)} and status = 'paid'`),
    "tickets on mock events": await count(sql`select count(*)::int n from tickets where event_id in ${sql(ev)}`),
    "earnings rows on mock events": await count(sql`select count(*)::int n from organiser_earnings where event_id in ${sql(ev)}`),
    "withdrawals tied to mock events/hosts": await count(sql`select count(*)::int n from withdrawals where event_id in ${sql(ev)} or user_id in ${sql(hostIds)}`),
    "ratings on mock events": await count(sql`select count(*)::int n from ratings where event_id in ${sql(ev)}`),
    "real accounts (kept)": await count(sql`select count(*)::int n from users where id not in ${sql(hostIds)}`),
    "real events (kept)": await count(sql`select count(*)::int n from events where owner_id not in ${sql(hostIds)}`),
  };
  console.table(report);

  if (!apply) {
    console.log("Dry run. Nothing deleted. Re-run with --yes to delete.");
  } else {
    await sql.begin(async (tx) => {
      // Rows that do not cascade from events, children first.
      await tx`delete from ratings where event_id in ${tx(ev)} or organiser_id in ${tx(hostIds)} or user_id in ${tx(hostIds)}`;
      await tx`delete from tickets where event_id in ${tx(ev)}`;
      await tx`delete from withdrawals where event_id in ${tx(ev)} or user_id in ${tx(hostIds)}`;
      await tx`delete from organiser_earnings where event_id in ${tx(ev)} or user_id in ${tx(hostIds)}`;
      await tx`delete from orders where event_id in ${tx(ev)}`;
      await tx`delete from events where id in ${tx(ev)}`; // tiers, media, links, co-signs, saves, lounges cascade
      await tx`delete from users where id in ${tx(hostIds)}`;
    });
    console.log(`Deleted ${eventIds.length} mock events and the mock host accounts.`);

    const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (storageUrl && serviceKey) {
      const bucket = createClient(storageUrl, serviceKey, { auth: { persistSession: false } }).storage.from("event-media");
      const { data: folders, error } = await bucket.list("seed", { limit: 1000 });
      if (error) throw new Error(`Storage list failed: ${error.message}`);
      const paths: string[] = [];
      for (const folder of folders ?? []) {
        const { data: files } = await bucket.list(`seed/${folder.name}`, { limit: 1000 });
        for (const f of files ?? []) paths.push(`seed/${folder.name}/${f.name}`);
      }
      if (paths.length) {
        const { error: rmError } = await bucket.remove(paths);
        if (rmError) throw new Error(`Storage remove failed: ${rmError.message}`);
      }
      console.log(`Removed ${paths.length} demo images from Storage.`);
    }
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
