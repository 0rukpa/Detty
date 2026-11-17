"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { credentialsSchema, normaliseNgPhone } from "@/features/profiles/validation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string; phone?: string };

const NOT_CONFIGURED = "Supabase is not connected yet. Add your keys to .env.local (see .env.example).";

/** Turn a Supabase auth error into something a person can act on, and log the real cause. */
function authError(error: { message: string; status?: number; cause?: unknown }): string {
  if (/fetch failed|network|timeout/i.test(error.message)) {
    console.error("Supabase auth request failed", error.cause ?? error);
    return "We could not reach the sign-in service. Check your internet connection and try again.";
  }
  return error.message;
}

async function origin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signUpWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: authError(error) };
  // If email confirmation is on, there is no session yet.
  if (!data.session) {
    return { notice: "Check your email to confirm your account, then come back and log in." };
  }
  redirect("/onboarding");
}

export async function signInWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: /fetch failed/i.test(error.message) ? authError(error) : "Wrong email or password." };
  redirect("/");
}

export async function signInWithGoogle(): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=/` },
  });
  if (error || !data.url) redirect("/login");
  redirect(data.url);
}

export async function sendPhoneOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };
  const phone = normaliseNgPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Enter a valid Nigerian mobile number, e.g. 0803 123 4567." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) return { error: authError(error) };
  return { phone, notice: "We sent you a 6-digit code." };
}

const otpSchema = z.object({
  phone: z.string().regex(/^\+234\d{10}$/),
  token: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export async function verifyPhoneOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };
  const phone = String(formData.get("phone") ?? "");
  const parsed = otpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, phone };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ ...parsed.data, type: "sms" });
  if (error) return { error: "That code did not work. Try again.", phone };
  redirect("/");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
