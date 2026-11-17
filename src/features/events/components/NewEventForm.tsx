"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { clearEventDraft, NEW_EVENT_DRAFT_KEY } from "../draft";
import type { EventFormValues } from "./EventForm";

// Client-only on purpose: the form reads its autosaved draft from localStorage
// before the first render, which the server can't do.
const EventForm = dynamic(() => import("./EventForm").then((m) => m.EventForm), {
  ssr: false,
  loading: () => <div className="skeleton h-[32rem] rounded-card" aria-busy="true" />,
});

/** "Create event" form with autosave: progress survives errors, refreshes and closed tabs. */
export function NewEventForm({ initial }: { initial: EventFormValues }) {
  const [version, setVersion] = useState(0);
  return (
    <EventForm
      key={version}
      initial={initial}
      draftKey={NEW_EVENT_DRAFT_KEY}
      onDiscardDraft={() => {
        clearEventDraft(NEW_EVENT_DRAFT_KEY);
        setVersion((v) => v + 1);
      }}
    />
  );
}

/** Rendered once the event exists on the server, so the next "Create event" starts blank. */
export function ClearNewEventDraft() {
  useEffect(() => clearEventDraft(NEW_EVENT_DRAFT_KEY), []);
  return null;
}
