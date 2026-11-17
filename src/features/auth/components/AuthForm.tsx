"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { submitKeepingValues } from "@/lib/forms";
import { cn } from "@/lib/utils";
import {
  sendPhoneOtp,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  verifyPhoneOtp,
  type AuthState,
} from "../actions";

const initial: AuthState = {};

/**
 * Google sign-in is hidden until the Google provider is set up in Supabase
 * (see DEPLOY.md). Flip this to true to bring the button back.
 */
const GOOGLE_SIGN_IN_ENABLED: boolean = false;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [emailState, emailAction, emailPending] = useActionState(
    mode === "signup" ? signUpWithEmail : signInWithEmail,
    initial,
  );
  const [otpState, sendOtp, otpSending] = useActionState(sendPhoneOtp, initial);
  const [verifyState, verifyOtp, verifying] = useActionState(verifyPhoneOtp, initial);
  const otpPhone = verifyState.phone ?? otpState.phone;

  return (
    <div className="space-y-5">
      {GOOGLE_SIGN_IN_ENABLED ? (
        <>
          <form action={signInWithGoogle}>
            <Button type="submit" variant="outline" size="lg" className="w-full">
              Continue with Google
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 rounded-full bg-surface p-1">
        {(["email", "phone"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={method === m}
            onClick={() => setMethod(m)}
            className={cn(
              "h-9 rounded-full text-sm font-semibold capitalize transition",
              method === m ? "bg-surface-2 text-foreground" : "text-muted",
            )}
          >
            {m === "email" ? "Email" : "Phone"}
          </button>
        ))}
      </div>

      {method === "email" ? (
        <form action={emailAction} onSubmit={submitKeepingValues(emailAction)} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>
          <FieldError message={emailState.error} />
          {emailState.notice ? <p className="text-sm text-lime">{emailState.notice}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={emailPending}>
            {emailPending ? "One sec…" : mode === "signup" ? "Create account" : "Log in"}
          </Button>
        </form>
      ) : otpPhone ? (
        <form action={verifyOtp} onSubmit={submitKeepingValues(verifyOtp)} className="space-y-4">
          <input type="hidden" name="phone" value={otpPhone} />
          <div>
            <Label htmlFor="token">Code sent to {otpPhone}</Label>
            <Input
              id="token"
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              placeholder="6-digit code"
            />
          </div>
          <FieldError message={verifyState.error} />
          <Button type="submit" size="lg" className="w-full" disabled={verifying}>
            {verifying ? "Checking…" : "Verify"}
          </Button>
        </form>
      ) : (
        <form action={sendOtp} onSubmit={submitKeepingValues(sendOtp)} className="space-y-4">
          <div>
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" required placeholder="0803 123 4567" />
          </div>
          <FieldError message={otpState.error} />
          <Button type="submit" size="lg" className="w-full" disabled={otpSending}>
            {otpSending ? "Sending…" : "Send code"}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted">
        {mode === "signup" ? "Already on Detty? " : "New here? "}
        <Link href={mode === "signup" ? "/login" : "/signup"} className="font-semibold text-foreground underline">
          {mode === "signup" ? "Log in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
