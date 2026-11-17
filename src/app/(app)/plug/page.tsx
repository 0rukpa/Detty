import { CalendarPlus, Landmark, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardSkeletons, EmptyState, PageHeader } from "@/components/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { requireProfile } from "@/features/auth/session";
import { StatusPill } from "@/features/events/components/EventAdmin";
import { eventDateFmt } from "@/features/events/components/EventCard";
import { listMyEvents } from "@/features/events/queries";

export const metadata: Metadata = { title: `${BRAND.organiser.singular} Dashboard` };

const ROLE = { owner: "Lead", co_host: "Co-host", promoter: "Promoter", vendor: "Vendor" } as const;

async function Dashboard() {
  const profile = await requireProfile();
  const events = await listMyEvents(profile.id);
  if (!profile.isPlug && events.length === 0) redirect("/profile");

  return (
    <>
      {profile.isPlug && profile.plugStatus !== "verified" ? (
        <p className="mb-5 rounded-card border border-amber/40 bg-amber/10 p-4 text-sm">
          <span className="font-bold text-amber">Verification pending.</span> You can publish free events now (they show an
          &quot;Unverified host&quot; label). Selling tickets unlocks after ID, bank and trust checks.
        </p>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Your first event starts here"
          body="Add the details, drop your flyers and publish when you are ready."
          action={
            <Link href="/plug/events/new" className={buttonVariants({ variant: "lime" })}>
              <Plus className="size-4" /> Create event
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={e.role === "vendor" ? `/e/${e.slug}` : `/plug/events/${e.id}`}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-lg font-extrabold">{e.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {eventDateFmt.format(e.startsAt)} · {e.city} · {ROLE[e.role]}
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {e.sold.toLocaleString("en-NG")} / {e.capacity.toLocaleString("en-NG")} tickets
                  </span>
                </span>
                <StatusPill status={e.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function PlugPage() {
  return (
    <>
      <PageHeader
        title={`${BRAND.organiser.singular} Dashboard`}
        subtitle="Your events, ticket sales and earnings."
        right={
          <div className="flex gap-2">
            <Link href="/plug/payouts" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Landmark className="size-4" /> Earnings
            </Link>
            <Link href="/plug/events/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4" /> New
            </Link>
          </div>
        }
      />
      <Suspense fallback={<CardSkeletons />}>
        <Dashboard />
      </Suspense>
    </>
  );
}
