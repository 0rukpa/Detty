import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAuthUser, getCurrentProfile } from "@/features/auth/session";
import { OnboardingForm } from "@/features/profiles/components/OnboardingForm";

export const metadata: Metadata = { title: "Set up your profile" };

/** Reads the session, so it streams behind the Suspense boundary below. */
async function Gate() {
  if (!(await getAuthUser())) redirect("/login");
  if (await getCurrentProfile()) redirect("/"); // already onboarded
  return <OnboardingForm />;
}

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Who are you outside?</h1>
      <p className="mb-8 mt-2 text-muted">Pick your handle and tell us where you party.</p>
      <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
        <Gate />
      </Suspense>
    </main>
  );
}
