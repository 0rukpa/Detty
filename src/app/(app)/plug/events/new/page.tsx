import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/EmptyState";
import { getState } from "@/config/nigeria";
import { requireProfile } from "@/features/auth/session";
import type { EventFormValues } from "@/features/events/components/EventForm";
import { NewEventForm } from "@/features/events/components/NewEventForm";

export const metadata: Metadata = { title: "Create event" };

async function NewEvent() {
  const profile = await requireProfile();
  if (!profile.isPlug) redirect("/profile");
  const home = getState(profile.homeState);

  const initial: EventFormValues = {
    title: "",
    description: "",
    category: "party",
    theme: "",
    themeTags: "",
    vibeTags: [],
    ageMin: 18,
    timeOfDay: "night",
    startsAt: "",
    endsAt: "",
    doorsAt: "",
    venueName: "",
    address: "",
    hideAddress: false,
    state: home?.name ?? "Lagos",
    city: profile.homeCity,
    lat: home?.lat ?? 6.5244,
    lng: home?.lng ?? 3.3792,
    links: [],
    tiers: [{ name: "Regular", priceNaira: "0", quantity: "100", perUserLimit: "6" }],
  };
  return <NewEventForm initial={initial} />;
}

export default function NewEventPage() {
  return (
    <>
      <PageHeader title="Create event" subtitle="Save a draft first. Flyers, stories and collaborators come next." />
      <Suspense fallback={<div className="skeleton h-[32rem] rounded-card" />}>
        <NewEvent />
      </Suspense>
    </>
  );
}
