import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb, isDbConfigured } from "@/db";
import { users, type User } from "@/db/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer for the session. These read request cookies, so under
 * Cache Components they must be called inside a <Suspense> boundary.
 */
export const getAuthUser = cache(async () => {
  // Session checks must run per request, never be prerendered at build time.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  // getUser() validates the JWT with Supabase; never trust getSession() on the server.
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export const getCurrentProfile = cache(async (): Promise<User | null> => {
  const authUser = await getAuthUser();
  if (!authUser || !isDbConfigured()) return null;
  const [row] = await getDb().select().from(users).where(eq(users.id, authUser.id)).limit(1);
  return row ?? null;
});

/** Signed in AND onboarded, otherwise redirect to the right step. */
export async function requireProfile(): Promise<User> {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/onboarding");
  if (profile.suspended) redirect("/login");
  return profile;
}
