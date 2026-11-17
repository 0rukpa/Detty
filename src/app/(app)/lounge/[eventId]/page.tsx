import { Lock, MapPin, MessageCircle, PartyPopper, Ticket, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { Confetti } from "@/components/Confetti";
import { EmptyState } from "@/components/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { getDb } from "@/db";
import { events } from "@/db/schema";
import { requireProfile } from "@/features/auth/session";
import { eventDateFmt } from "@/features/events/components/EventCard";
import { countMyTickets, getLounge } from "@/features/payments/queries";

export const metadata: Metadata = { title: BRAND.eventChat };

async function Lounge({ params, searchParams }: Pick<PageProps<"/lounge/[eventId]">, "params" | "searchParams">) {
  const [{ eventId }, query, profile] = await Promise.all([params, searchParams, requireProfile()]);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const [event] = await getDb().select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) notFound();

  // Only paid ticket holders, the Lead Plug and collaborators get in (spec 8.1).
  const lounge = await getLounge(eventId, profile.id);
  if (!lounge) {
    return (
      <EmptyState
        icon={Lock}
        title={`${BRAND.eventChat} is for ticket holders`}
        body="Get a ticket and you land straight in the chat with everyone else going."
        action={
          <Link href={`/e/${event.slug}`} className={buttonVariants({ variant: "lime" })}>
            See tickets
          </Link>
        }
      />
    );
  }
  const myTickets = await countMyTickets(profile.id, eventId);
  const welcome = query.welcome === "1";

  return (
    <div className="space-y-5">
      {welcome ? <Confetti /> : null}

      {welcome ? (
        <section role="status" className="rounded-card bg-gradient-to-br from-purple to-pink p-6 text-center">
          <PartyPopper className="mx-auto size-10" />
          <h2 className="mt-2 font-display text-3xl font-extrabold">You&apos;re in!</h2>
          <p className="mt-1 text-sm text-white/90">
            {myTickets > 1 ? `${myTickets} tickets` : "Your ticket"} for {event.title} {myTickets > 1 ? "are" : "is"} in your wallet.
          </p>
        </section>
      ) : null}

      <header className="rounded-card border border-border bg-surface p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-pink">{BRAND.eventChat}</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight">{event.title}</h1>
        <p className="mt-2 text-sm text-muted">{eventDateFmt.format(event.startsAt)}</p>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          {/* The exact address unlocks here for people who hold a ticket. */}
          <span>
            {event.venueName}, {event.city}
            {event.address ? ` · ${event.address}` : ""}
          </span>
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold">
          <Users className="size-4 text-lime" /> {lounge.members} {lounge.members === 1 ? "person" : "people"} in here
        </p>
      </header>

      <EmptyState
        icon={MessageCircle}
        title="The chat opens soon"
        body="You are on the list. Live messages, reactions and host announcements arrive in the next update (Phase 5)."
      />

      <div className="flex gap-3">
        <Link href="/tickets" className={`${buttonVariants({ variant: "lime" })} flex-1`}>
          <Ticket className="size-4" /> My tickets
        </Link>
        <Link href={`/e/${event.slug}`} className={`${buttonVariants({ variant: "outline" })} flex-1`}>
          Event page
        </Link>
      </div>
    </div>
  );
}

export default function LoungePage({ params, searchParams }: PageProps<"/lounge/[eventId]">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
      <Lounge params={params} searchParams={searchParams} />
    </Suspense>
  );
}
