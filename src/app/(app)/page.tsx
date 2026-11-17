import { CalendarX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardSkeletons, EmptyState, PageHeader } from "@/components/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { DbNotice } from "@/features/events/components/DbNotice";
import { EventCard } from "@/features/events/components/EventCard";
import { FilterBar } from "@/features/events/components/FilterBar";
import { loadDiscovery, type SearchParams } from "@/features/events/discovery";
import { activeFilterCount } from "@/features/events/filters";

const PAGE_SIZE = 12;

async function Feed({ searchParams }: { searchParams: SearchParams }) {
  const [data, params] = await Promise.all([loadDiscovery(searchParams), searchParams]);
  if (data.status !== "ok") return <DbNotice status={data.status} />;
  if (data.needsOnboarding) redirect("/onboarding");
  const { events, filters, signedIn, hasGeo, origin } = data;

  // Render the feed a page at a time: a dozen media-heavy cards load fast, the rest are one tap away.
  const requested = Number(Array.isArray(params.show) ? params.show[0] : params.show);
  const show = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 120) : PAGE_SIZE;
  const visible = events.slice(0, show);
  const moreParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v && key !== "show") moreParams.set(key, v);
  }
  moreParams.set("show", String(show + PAGE_SIZE));

  return (
    <>
      <FilterBar hasGeo={hasGeo} />
      {!signedIn ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
          <p className="text-sm text-muted">Sign up to buy tickets and join the chat.</p>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Join
          </Link>
        </div>
      ) : null}
      {origin && !filters.state ? (
        <p className="mb-3 text-xs text-muted">
          {origin.source === "geo" ? "Sorted by distance from you." : "Sorted by distance from your home state. Tap Near me for your exact area."}
        </p>
      ) : null}
      {events.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Nothing matches"
          body={
            activeFilterCount(filters) > 0
              ? "No events fit those filters. Try clearing a few."
              : "No upcoming events right now. Check back soon."
          }
          action={
            activeFilterCount(filters) > 0 ? (
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((e) => (
              <EventCard key={e.id} event={e} signedIn={signedIn} />
            ))}
          </div>
          {events.length > visible.length ? (
            <div className="mt-6 text-center">
              <Link href={`/?${moreParams}`} scroll={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Show more ({events.length - visible.length} left)
              </Link>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

export default function FeedPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader title="Outside" subtitle="What is happening near you and across Nigeria." />
      <Suspense fallback={<CardSkeletons />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </>
  );
}
