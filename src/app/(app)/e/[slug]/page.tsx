import { CalendarDays, Check, DoorOpen, EyeOff, Lock, MapPin, MessageCircle, Moon, Pencil, Shirt, Sun, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/config/app";
import { BRAND } from "@/config/brand";
import { getCurrentProfile } from "@/features/auth/session";
import { eventDateFmt, HostBadge, POSTER, RatingSummary } from "@/features/events/components/EventCard";
import { MediaCarousel, type Slide } from "@/features/events/components/MediaCarousel";
import { SaveButton, ShareButton } from "@/features/events/components/SaveButton";
import { StoryRing } from "@/features/events/components/StoryViewer";
import { getCollaboration, getEventBySlug } from "@/features/events/queries";
import { canEditDetails, eventAccess } from "@/features/events/rules";
import { TicketPicker, type PickerTier } from "@/features/payments/components/TicketPicker";
import { countMyTickets } from "@/features/payments/queries";
import { LINK_PLATFORMS, VENDOR_LABELS, type LinkPlatform } from "@/features/events/validation";
import { meetsAgeLimit } from "@/features/profiles/validation";
import { eventUrl } from "@/lib/slug";

export const metadata: Metadata = { title: "Event" };

const timeFmt = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

/** YouTube is the one platform that allows a simple, privacy-friendly embed. */
function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v");
    return id && /^[\w-]{6,15}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

async function EventContent({ params, searchParams }: Pick<PageProps<"/e/[slug]">, "params" | "searchParams">) {
  const [{ slug }, query, profile] = await Promise.all([params, searchParams, getCurrentProfile()]);
  const detail = await getEventBySlug(slug, profile?.id);
  if (!detail) notFound();
  const { event, host, flyers, videos, stories, tiers, links, collaborators } = detail;

  const collab = profile && profile.id !== event.ownerId ? await getCollaboration(event.id, profile.id) : null;
  const access = profile ? eventAccess(profile.id, event.ownerId, collab) : null;

  // Drafts and events under review are only visible to their team.
  if ((event.status === "draft" || event.status === "pending_review") && !access) notFound();

  // Under-18 safeguard (spec 4.1), enforced on the server.
  if (profile && !access && !meetsAgeLimit(profile.dob, event.ageMin)) {
    return (
      <EmptyState
        icon={Lock}
        title={`This event is ${event.ageMin}+`}
        body="It is not available for your age. There is plenty more outside."
        action={
          <Link href="/" className={buttonVariants({ variant: "lime" })}>
            Back to the feed
          </Link>
        }
      />
    );
  }

  const slides: Slide[] = [
    ...videos.map((v) => ({ id: v.id, kind: "video" as const, url: v.url, poster: v.posterUrl, alt: `Promo video for ${event.title}` })),
    // Always the watermarked flyer on public surfaces.
    ...flyers.map((f) => ({ id: f.id, kind: "image" as const, url: f.watermarkedUrl ?? f.url, alt: f.alt ?? `Flyer for ${event.title}` })),
  ];
  const coHosts = collaborators.filter((c) => c.role !== "vendor");
  const vendors = collaborators.filter((c) => c.role === "vendor");
  const TimeIcon = event.timeOfDay === "day" ? Sun : Moon;
  const cancelled = event.status === "cancelled";
  const now = new Date();
  const over = event.endsAt < now;
  const myTickets = profile ? await countMyTickets(profile.id, event.id) : 0;
  const onSale = event.status === "published" || event.status === "live";

  const pickerTiers: PickerTier[] = tiers.map((t) => {
    const left = t.quantity - t.sold - t.reserved;
    const unavailable =
      left <= 0
        ? "Sold out"
        : t.salesEnd && t.salesEnd < now
          ? "Sales closed"
          : t.salesStart && t.salesStart > now
            ? `On sale ${eventDateFmt.format(t.salesStart)}`
            : null;
    return { id: t.id, name: t.name, priceKobo: t.priceKobo, left, perUserLimit: t.perUserLimit, unavailable };
  });
  const blocked = cancelled
    ? "This event was cancelled."
    : over
      ? "This event has ended."
      : !onSale
        ? "Tickets go on sale when the event is published."
        : null;

  return (
    <article className="space-y-5">
      {event.status === "draft" ? (
        <p className="flex items-center gap-2 rounded-2xl bg-amber/15 p-3 text-sm font-semibold text-amber">
          <EyeOff className="size-4" /> Draft preview. Only you and your co-hosts can see this.
        </p>
      ) : null}
      {cancelled ? (
        <p className="rounded-2xl bg-danger/15 p-3 text-sm font-semibold text-danger">
          This event was cancelled.{myTickets > 0 ? " Your tickets have been refunded in full." : ""}
        </p>
      ) : null}
      {query.payment === "cancelled" ? (
        <p role="status" className="rounded-2xl bg-surface-2 p-3 text-sm text-muted">Checkout cancelled. You have not been charged.</p>
      ) : null}
      {myTickets > 0 && !cancelled ? (
        <Link href={`/lounge/${event.id}`} className="flex items-center justify-between gap-3 rounded-card bg-gradient-to-r from-purple to-pink p-4">
          <span>
            <span className="block font-display text-lg font-extrabold">You are going</span>
            <span className="text-sm text-white/90">
              {myTickets} {myTickets === 1 ? "ticket" : "tickets"} · Open {BRAND.eventChat}
            </span>
          </span>
          <MessageCircle className="size-6" />
        </Link>
      ) : null}

      <div className="relative">
        <MediaCarousel slides={slides} fallbackClass={POSTER[event.category]} />
        <div className="absolute right-3 top-3 flex gap-2">
          <ShareButton url={eventUrl(event.slug)} title={event.title} />
          <SaveButton eventId={event.id} saved={detail.saved} signedIn={Boolean(profile)} />
        </div>
      </div>

      <header>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide">
          <span className="rounded-full bg-surface-2 px-2.5 py-1">{CATEGORY_LABELS[event.category]}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1">
            <TimeIcon className="size-3" /> {event.timeOfDay}
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1">{event.ageMin > 0 ? `${event.ageMin}+` : "All ages"}</span>
        </div>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-balance">{event.title}</h1>
      </header>

      {/* Hosts, stories ring and trust */}
      <section className="flex items-center gap-4 rounded-card border border-border bg-surface p-4">
        <StoryRing
          stories={stories.map((s) => ({ id: s.id, url: s.url, isVideo: s.isVideo, caption: s.caption, createdAt: s.createdAt.toISOString() }))}
          label={event.title}
          initial={host.displayName.slice(0, 1)}
          signedIn={Boolean(profile)}
          autoOpen={query.story === "1"}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            Hosted by <span className="font-semibold text-foreground">@{host.handle}</span>
            {coHosts.length > 0 ? <> with {coHosts.map((c) => `@${c.handle}`).join(", ")}</> : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <HostBadge host={host} />
            <RatingSummary host={host} />
          </div>
        </div>
        {canEditDetails(access) ? (
          <Link href={`/plug/events/${event.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Pencil className="size-4" /> Edit
          </Link>
        ) : null}
      </section>

      {vendors.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Confirmed vendors">
          {vendors.map((v) => (
            <li key={v.userId} className="inline-flex items-center gap-1.5 rounded-full bg-lime/15 px-3 py-1.5 text-sm font-semibold text-lime">
              <Check className="size-4" />
              {VENDOR_LABELS[v.vendorType as keyof typeof VENDOR_LABELS] ?? "Vendor"} @{v.handle} confirmed
            </li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-3 rounded-card border border-border bg-surface p-4 text-sm">
        <p className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-pink" />
          <span>
            <span className="block font-semibold">{eventDateFmt.format(event.startsAt)}</span>
            <span className="text-muted">Ends {eventDateFmt.format(event.endsAt)}</span>
          </span>
        </p>
        {event.doorsAt ? (
          <p className="flex items-center gap-3">
            <DoorOpen className="size-5 shrink-0 text-pink" /> Doors open {timeFmt.format(event.doorsAt)}
          </p>
        ) : null}
        <p className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-pink" />
          <span>
            <span className="block font-semibold">
              {event.venueName}, {event.city}, {event.state}
            </span>
            <span className="text-muted">
              {event.hideAddress && !access && myTickets === 0 ? "The exact address unlocks when you buy a ticket." : event.address}
            </span>
          </span>
        </p>
        {event.theme ? (
          <p className="flex items-start gap-3">
            <Shirt className="mt-0.5 size-5 shrink-0 text-pink" />
            <span>
              <span className="block font-semibold">Dress code: {event.theme}</span>
              {event.themeTags.length > 0 ? <span className="text-muted">{event.themeTags.map((t) => `#${t}`).join(" ")}</span> : null}
            </span>
          </p>
        ) : null}
      </section>

      {event.description ? (
        <section>
          <h2 className="mb-2 font-display text-xl font-extrabold">About</h2>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{event.description}</p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-extrabold">
          <Ticket className="size-5 text-pink" /> Tickets
        </h2>
        {tiers.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-5 text-sm text-muted">Tickets have not been released yet.</p>
        ) : (
          <TicketPicker tiers={pickerTiers} signedIn={Boolean(profile)} blocked={blocked} />
        )}
      </section>

      {links.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-xl font-extrabold">Follow the event</h2>
          <ul className="flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={l.platform}>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {LINK_PLATFORMS[l.platform as LinkPlatform]?.label ?? l.platform}
                </a>
              </li>
            ))}
          </ul>
          {links
            .filter((l) => l.platform === "youtube")
            .map((l) => youtubeEmbed(l.url))
            .filter((src): src is string => Boolean(src))
            .map((src) => (
              <iframe
                key={src}
                src={src}
                title="YouTube preview"
                loading="lazy"
                allow="accelerometer; encrypted-media; picture-in-picture"
                allowFullScreen
                className="mt-3 aspect-video w-full rounded-card border border-border"
              />
            ))}
        </section>
      ) : null}
    </article>
  );
}

export default function EventPage({ params, searchParams }: PageProps<"/e/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy="true">
          <div className="skeleton aspect-[4/5] rounded-card" />
          <div className="skeleton h-10 w-2/3 rounded-xl" />
          <div className="skeleton h-28 rounded-card" />
        </div>
      }
    >
      <EventContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
