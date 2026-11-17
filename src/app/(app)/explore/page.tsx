import { CalendarX, Plane } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHeader } from "@/components/EmptyState";
import { getState } from "@/config/nigeria";
import { DbNotice } from "@/features/events/components/DbNotice";
import { eventDateFmt } from "@/features/events/components/EventCard";
import { EventMap, type MapPin } from "@/features/events/components/EventMap";
import { FilterBar } from "@/features/events/components/FilterBar";
import { loadDiscovery, type SearchParams } from "@/features/events/discovery";
import { dettyDecemberDates } from "@/features/events/filters";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Explore" };

/** States with the most going on, shown as one-tap Detty Travel shortcuts. */
const TRAVEL_SHORTCUTS: [state: string, label: string][] = [
  ["Lagos", "Lagos"],
  ["FCT", "Abuja"],
  ["Rivers", "Port Harcourt"],
  ["Oyo", "Ibadan"],
  ["Enugu", "Enugu"],
  ["Cross River", "Calabar"],
  ["Akwa Ibom", "Uyo"],
  ["Edo", "Benin"],
];

const priceLabel = (kobo: number | null) => (kobo === null ? "Tickets soon" : kobo === 0 ? "Free" : `From ${formatNaira(kobo)}`);

async function Explore({ searchParams }: { searchParams: SearchParams }) {
  const data = await loadDiscovery(searchParams);
  if (data.status !== "ok") return <DbNotice status={data.status} />;
  const { events, filters, hasGeo } = data;

  const state = filters.state ? getState(filters.state) : undefined;
  const december = dettyDecemberDates();
  const travelHref = (name: string) => {
    const q = new URLSearchParams({ state: name });
    if (filters.when) q.set("when", filters.when);
    return `/explore?${q}`;
  };
  const pins: MapPin[] = events.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    lat: e.lat,
    lng: e.lng,
    when: eventDateFmt.format(e.startsAt),
    price: priceLabel(e.priceFromKobo),
    certified: e.host.certifiedPlug,
  }));

  return (
    <>
      <section className="mb-5 rounded-card border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Plane className="size-5 text-pink" /> Detty Travel
        </h2>
        <p className="mt-1 text-sm text-muted">
          Planning a trip? Pick a state and buy tickets before you land.
        </p>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {TRAVEL_SHORTCUTS.map(([name, label]) => {
            const on = filters.state === name;
            return (
              <Link
                key={name}
                href={on ? "/explore" : travelHref(name)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold transition",
                  on ? "border-lime bg-lime text-black" : "border-border text-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <Link
          href={`/explore?${new URLSearchParams({ state: filters.state ?? "Lagos", when: "detty_december" })}`}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple to-pink px-4 py-2 text-sm font-bold"
        >
          Detty December in {state?.name ?? "Lagos"}: {december.from.slice(8)} Dec to {Number(december.to.slice(8))} Jan
        </Link>
      </section>

      <FilterBar hasGeo={hasGeo} showNearMe={false} />

      <EventMap pins={pins} focus={state ? { lat: state.lat, lng: state.lng, zoom: 10 } : undefined} />

      <h2 className="mb-3 mt-6 font-display text-xl font-extrabold">
        {events.length} {events.length === 1 ? "event" : "events"}
        {state ? ` in ${state.name}` : " across Nigeria"}
      </h2>
      {events.length === 0 ? (
        <EmptyState icon={CalendarX} title="Nothing here yet" body="No events match. Try another state or wider dates." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/e/${e.slug}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{e.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {eventDateFmt.format(e.startsAt)} · {e.venueName}, {e.city}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold">{priceLabel(e.priceFromKobo)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <>
      <PageHeader title="Explore" subtitle="The map, and every state you might visit." />
      <Suspense fallback={<div className="skeleton h-[420px] rounded-card" />}>
        <Explore searchParams={searchParams} />
      </Suspense>
    </>
  );
}
