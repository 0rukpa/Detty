import { BadgeCheck, MapPin, Moon, Star, Sun } from "lucide-react";
import Link from "next/link";
import { CATEGORY_LABELS, type EventCategory } from "@/config/app";
import { BRAND } from "@/config/brand";
import { cn, formatNaira } from "@/lib/utils";
import type { FeedEvent, HostSummary } from "../queries";
import { SaveButton } from "./SaveButton";

/** Poster gradients used when an event has no flyer yet. */
export const POSTER: Record<EventCategory, string> = {
  party: "from-purple via-pink to-orange",
  rave: "from-[#1b0b3a] via-purple to-lime",
  picnic: "from-lime via-[#2ee6c8] to-[#4d8dff]",
  day_party: "from-orange via-pink to-purple",
  beach: "from-[#2ee6c8] via-[#4d8dff] to-purple",
  concert: "from-pink via-purple to-[#1b0b3a]",
  owambe: "from-amber via-orange to-pink",
  game_night: "from-[#4d8dff] via-purple to-pink",
  brunch: "from-amber via-pink to-purple",
  other: "from-surface-2 via-purple to-pink",
};

export const eventDateFmt = new Intl.DateTimeFormat("en-NG", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

export function formatDistance(km: number): string {
  if (km < 1) return "Under 1 km away";
  if (km < 100) return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
  return `${Math.round(km).toLocaleString("en-NG")} km away`;
}

export function HostBadge({ host }: { host: Pick<HostSummary, "certifiedPlug" | "plugStatus"> }) {
  if (host.certifiedPlug) {
    return (
      <span className="rainbow-bg animate-rainbow inline-flex shrink-0 items-center gap-1 rounded-full p-px">
        <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-bold">
          <BadgeCheck className="size-3.5 text-lime" /> {BRAND.certifiedOrganiser}
        </span>
      </span>
    );
  }
  if (host.plugStatus === "verified") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple/20 px-2 py-0.5 text-[11px] font-bold text-foreground">
        <BadgeCheck className="size-3.5 text-purple" /> {BRAND.organiser.singular}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-bold text-amber">
      Unverified host
    </span>
  );
}

export function RatingSummary({ host }: { host: Pick<HostSummary, "ratingAvg" | "ratingCount"> }) {
  if (host.ratingCount === 0) return <span className="text-xs text-muted">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <Star className="size-3.5 fill-amber text-amber" /> {host.ratingAvg.toFixed(1)}
      <span className="font-normal text-muted">({host.ratingCount.toLocaleString("en-NG")})</span>
    </span>
  );
}

export function EventCard({ event, signedIn }: { event: FeedEvent; signedIn: boolean }) {
  const TimeIcon = event.timeOfDay === "day" ? Sun : Moon;
  const price =
    event.priceFromKobo === null
      ? "Tickets soon"
      : event.priceFromKobo === 0
        ? "Free"
        : `From ${formatNaira(event.priceFromKobo)}`;
  const href = `/e/${event.slug}`;
  const hasMedia = Boolean(event.videoUrl ?? event.flyerUrl);

  return (
    <article className="group relative overflow-hidden rounded-card border border-border bg-surface">
      <div className={cn("relative aspect-[4/5] bg-gradient-to-br", POSTER[event.category])}>
        <Link href={href} aria-label={event.title} tabIndex={-1} className="absolute inset-0">
          {event.videoUrl ? (
            <video
              src={event.videoUrl}
              poster={event.posterUrl ?? event.flyerUrl ?? undefined}
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              aria-label={`Promo video for ${event.title}`}
              className="size-full object-cover"
            />
          ) : event.flyerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- watermarked flyers are served as-is from Storage
            <img
              src={event.flyerUrl}
              alt={event.flyerAlt ?? `Flyer for ${event.title}`}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : null}
          <span aria-hidden className={cn("absolute inset-0 bg-gradient-to-b from-black/35 to-transparent", hasMedia ? "to-30%" : "via-transparent to-black/80")} />
        </Link>

        <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur">
              {CATEGORY_LABELS[event.category]}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
              <TimeIcon className="size-3" /> {event.timeOfDay === "day" ? "Day" : "Night"}
            </span>
            {event.ageMin > 0 ? (
              <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                {event.ageMin}+
              </span>
            ) : null}
          </div>
          <SaveButton eventId={event.id} saved={event.saved} signedIn={signedIn} className="pointer-events-auto" />
        </div>

        {/* With a flyer or video the artwork speaks for itself; otherwise the title sits on the gradient. */}
        {!hasMedia ? (
          <div className="pointer-events-none absolute inset-x-5 bottom-5">
            <p className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-balance">{event.title}</p>
          </div>
        ) : null}
      </div>

      <Link href={href} className="block px-4 pt-4">
        <p className="text-sm font-semibold text-lime">{eventDateFmt.format(event.startsAt)}</p>
        <h3 className="mt-0.5 font-display text-2xl font-extrabold leading-tight tracking-tight text-balance">
          {event.title}
        </h3>
      </Link>

      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* Story ring around the host avatar when the event has live stories */}
          <Link
            href={event.hasStory ? `${href}?story=1` : href}
            aria-label={event.hasStory ? `View stories for ${event.title}` : `Hosted by @${event.host.handle}`}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full p-0.5",
              event.hasStory ? "bg-gradient-to-tr from-orange via-pink to-purple" : "bg-border",
            )}
          >
            <span className="flex size-full items-center justify-center rounded-full bg-surface-2 text-sm font-bold uppercase">
              {event.host.displayName.slice(0, 1)}
            </span>
          </Link>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm text-muted">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">
                {event.distanceKm !== null ? formatDistance(event.distanceKm) : event.venueName} · {event.city}
              </span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span className="truncate text-muted">@{event.host.handle}</span>
              <HostBadge host={event.host} />
            </p>
          </div>
        </div>
        <Link href={href} className="shrink-0 rounded-full bg-surface-2 px-3.5 py-2 text-sm font-bold hover:bg-border">
          {price}
        </Link>
      </div>
    </article>
  );
}
