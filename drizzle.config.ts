import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { parseDatabaseUrl } from "./src/db/url";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is empty. Set it in .env.local (see .env.example).");
}
// Parsed by hand so passwords with "@" or "#" work without URL-encoding.
const db = parseDatabaseUrl(process.env.DATABASE_URL);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { ...db, ssl: "require" },
});
