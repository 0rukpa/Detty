import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { parseDatabaseUrl } from "./url";

export type Db = PostgresJsDatabase<typeof schema>;

// Reuse one client across hot reloads in dev.
const globalForDb = globalThis as unknown as { __dettyDb?: { url: string; db: Db; close: () => Promise<void> } };

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Lazy so the app still boots (with setup notices) before env vars are set. */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const cached = globalForDb.__dettyDb;
  if (cached?.url === url) return cached.db;
  // DATABASE_URL changed (for example a reset password): drop the old pool and reconnect.
  void cached?.close().catch(() => undefined);
  // prepare: false is required for Supabase's transaction pooler.
  const p = parseDatabaseUrl(url);
  const client = postgres({
    host: p.host,
    port: p.port,
    database: p.database,
    username: p.user,
    password: p.password,
    ssl: "require",
    prepare: false,
    max: 5,
    // Idle connections get dropped silently by NATs, antivirus and the Supabase pooler. A query sent
    // down a dead socket then hangs for minutes, so close idle connections ourselves and reconnect fresh.
    idle_timeout: 90, // seconds (kept open by keep_alive below, so most requests reuse a warm connection)
    max_lifetime: 60 * 5,
    connect_timeout: 15,
    keep_alive: 30,
  });
  const db = drizzle(client, { schema });
  globalForDb.__dettyDb = { url, db, close: () => client.end({ timeout: 5 }) };
  return db;
}

export { schema };
