import { ChevronRight, MessageCircle, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHeader } from "@/components/EmptyState";
import { BRAND } from "@/config/brand";
import { requireProfile } from "@/features/auth/session";
import { eventDateFmt } from "@/features/events/components/EventCard";
import { listMyLounges } from "@/features/payments/queries";

export const metadata: Metadata = { title: "Chats" };

async function Inbox() {
  const profile = await requireProfile();
  const lounges = await listMyLounges(profile.id);
  if (lounges.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="No chats yet"
        body={`Buy a ticket and you land straight in ${BRAND.eventChat} with everyone else going.`}
      />
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {lounges.map((l) => (
        <li key={l.eventId}>
          <Link href={`/lounge/${l.eventId}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{l.title}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                <span className="truncate">{eventDateFmt.format(l.startsAt)}</span>
                <span className="inline-flex shrink-0 items-center gap-1">
                  <Users className="size-3.5" /> {l.members}
                </span>
                {l.role === "host" ? <span className="shrink-0 rounded-full bg-purple/20 px-2 py-0.5 text-[11px] font-bold text-foreground">Host</span> : null}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ChatsPage() {
  return (
    <>
      <PageHeader title="Chats" subtitle={`${BRAND.eventChat} for every event you have a ticket to.`} />
      <Suspense fallback={<div className="skeleton h-72 rounded-card" />}>
        <Inbox />
      </Suspense>
    </>
  );
}
