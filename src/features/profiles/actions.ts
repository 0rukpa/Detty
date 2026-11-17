"use server";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/features/auth/session";
import { getDb, isDbConfigured } from "@/db";
import { avatars, users } from "@/db/schema";
import { APP_CONFIG } from "@/config/app";
import { ageOn, handleSchema, isMinor, onboardingSchema } from "./validation";

export type OnboardingState = { error?: string; fieldErrors?: Record<string, string> };

/** Live availability check for the handle field. */
export async function checkHandle(raw: string): Promise<{ ok: boolean; message: string }> {
  const parsed = handleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (!(await getAuthUser())) return { ok: false, message: "Sign in first" };
  if (!isDbConfigured()) return { ok: true, message: "Looks good" };
  const [taken] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.handle}) = ${parsed.data.toLowerCase()}`)
    .limit(1);
  return taken
    ? { ok: false, message: "That handle is taken" }
    : { ok: true, message: `@${parsed.data} is available` };
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");
  if (!isDbConfigured()) return { error: "Database is not connected yet. Set DATABASE_URL in .env.local." };

  const parsed = onboardingSchema.safeParse({
    ...Object.fromEntries(formData),
    vibeTags: formData.getAll("vibeTags"),
    pronouns: formData.get("pronouns") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const input = parsed.data;
  const minor = isMinor(input.dob);

  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(users).values({
        id: authUser.id,
        handle: input.handle,
        displayName: input.displayName,
        dob: input.dob,
        homeState: input.homeState,
        homeCity: input.homeCity,
        bio: input.bio,
        pronouns: input.pronouns,
        vibeTags: input.vibeTags,
        // Under-18 safeguards (spec 4.1): private profile and friends-only DMs by default.
        isPrivate: minor,
        dmPrivacy: minor ? "friends" : "everyone",
      });
      await tx.insert(avatars).values({ userId: authUser.id });
    });
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.code ?? e.cause?.code) === "23505") {
      return { fieldErrors: { handle: "That handle is taken" } };
    }
    console.error("completeOnboarding failed", err);
    return { error: "Something went wrong saving your profile. Try again." };
  }
  redirect("/");
}

/**
 * Upgrade the SAME account to an organiser (spec 4.2). This only starts the
 * journey: plug_status stays "pending" until verification (Phase 4), so the
 * Plug can publish free events (labelled "Unverified host") but not paid ones.
 */
export async function becomePlug(): Promise<void> {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");
  const db = getDb();
  const [me] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!me) redirect("/onboarding");
  // Typed DOB check for now; the ID check in Phase 4 is the real gate.
  if (ageOn(me.dob) < APP_CONFIG.PLUG_MIN_AGE || me.suspended) redirect("/profile");
  if (!me.isPlug) {
    await db.update(users).set({ isPlug: true, plugStatus: "pending" }).where(eq(users.id, me.id));
  }
  redirect("/plug");
}
