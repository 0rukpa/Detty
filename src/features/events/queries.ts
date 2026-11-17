import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { distanceKm } from "@/config/nigeria";
import { getDb } from "@/db";
import {
  eventCollaborators,
  eventLinks,
  eventMedia,
  events,
  savedEvents,
  storyViews,
  ticketTiers,
  users,
} from "@/db/schema";
import { resolveDateRange, type DiscoveryFilters } from "./filters";

export type HostSummary = {
  id: string;
  handle: string;
  displayName: string;
  plugStatus: string;
  certifiedPlug: boolean;
  ratingAvg: number;
  ratingCount: number;
};

export type FeedEvent = {
  id: string;
  slug: string;
  title: string;
  category: (typeof events.$inferSelect)["category"];
  timeOfDay: "day" | "night";
  startsAt: Date;
  venueName: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  ageMin: number;
  theme: string;
  flyerUrl: string | null;
  flyerAlt: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  hasStory: boolean;
  saved: boolean;
  priceFromKobo: number | null; // null = no tiers yet
  distanceKm: number | null;
  host: HostSummary;
};

export type FeedOptions = {
  filters?: DiscoveryFilters;
  /** Viewer's age. Events above it are excluded server-side (spec 4.1). */
  viewerAge?: number;
  viewerId?: string;
  /** Sort by distance from here when set (geolocation, or the home state as a fallback). */
  origin?: { lat: number; lng: number };
  limit?: number;
};

const publicStatuses = ["published", "live"] as const;

const minPrice = sql<string | null>`(
  select min(t.price_kobo) from ${ticketTiers} t where t.event_id = ${events.id}
)`;

const firstMedia = (type: "flyer" | "video", column: "url" | "poster_url" | "alt" | "watermarked") =>
  sql<string | null>`(
    select ${sql.raw(column === "watermarked" ? "coalesce(m.watermarked_url, m.url)" : `m.${column}`)}
    from ${eventMedia} m
    where m.event_id = ${events.id} and m.type = ${sql.raw(`'${type}'`)}
    order by m."order" asc, m.created_at asc limit 1
  )`;

const hasActiveStory = sql<boolean>`exists (
  select 1 from ${eventMedia} m
  where m.event_id = ${events.id} and m.type = 'story' and m.expires_at > now()
)`;

const hostColumns = {
  hostId: users.id,
  hostHandle: users.handle,
  hostName: users.displayName,
  hostPlugStatus: users.plugStatus,
  hostCertified: users.certifiedPlug,
  hostRatingAvg: users.ratingAvg,
  hostRatingCount: users.ratingCount,
};

function toHost(r: {
  hostId: string;
  hostHandle: string;
  hostName: string;
  hostPlugStatus: string;
  hostCertified: boolean;
  hostRatingAvg: number;
  hostRatingCount: number;
}): HostSummary {
  return {
    id: r.hostId,
    handle: r.hostHandle,
    displayName: r.hostName,
    plugStatus: r.hostPlugStatus,
    certifiedPlug: r.hostCertified,
    ratingAvg: r.hostRatingAvg,
    ratingCount: r.hostRatingCount,
  };
}

/** Upcoming public events with discovery filters applied. */
export async function listFeedEvents(opts: FeedOptions = {}): Promise<FeedEvent[]> {
  const db = getDb();
  const f = opts.filters;
  const now = new Date();
  const where: (SQL | undefined)[] = [inArray(events.status, publicStatuses), gte(events.endsAt, now)];

  if (opts.viewerAge !== undefined) where.push(lte(events.ageMin, opts.viewerAge));
  if (f) {
    const range = resolveDateRange(f, now);
    if (f.state) where.push(eq(events.state, f.state));
    if (range.start) where.push(gte(events.startsAt, range.start));
    if (range.end) where.push(lt(events.startsAt, range.end));
    if (f.when === "tonight") where.push(eq(events.timeOfDay, "night"));
    if (f.cat) where.push(eq(events.category, f.cat));
    if (f.tod) where.push(eq(events.timeOfDay, f.tod));
    if (f.vibe) where.push(sql`${events.vibeTags} @> ARRAY[${f.vibe}]::text[]`);
    if (f.free) where.push(sql`${minPrice} = 0`);
    else if (f.max !== undefined) where.push(sql`${minPrice} <= ${f.max * 100}`);
    if (f.cert) where.push(eq(users.certifiedPlug, true));
    if (f.saved && opts.viewerId) {
      where.push(
        sql`exists (select 1 from ${savedEvents} s where s.event_id = ${events.id} and s.user_id = ${opts.viewerId})`,
      );
    }
  }

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      category: events.category,
      timeOfDay: events.timeOfDay,
      startsAt: events.startsAt,
      venueName: events.venueName,
      city: events.city,
      state: events.state,
      lat: events.lat,
      lng: events.lng,
      ageMin: events.ageMin,
      theme: events.theme,
      flyerUrl: firstMedia("flyer", "watermarked"),
      flyerAlt: firstMedia("flyer", "alt"),
      videoUrl: firstMedia("video", "url"),
      posterUrl: firstMedia("video", "poster_url"),
      hasStory: hasActiveStory,
      saved: opts.viewerId
        ? sql<boolean>`exists (select 1 from ${savedEvents} s where s.event_id = ${events.id} and s.user_id = ${opts.viewerId})`
        : sql<boolean>`false`,
      priceFromKobo: minPrice,
      ...hostColumns,
    })
    .from(events)
    .innerJoin(users, eq(users.id, events.ownerId))
    .where(and(...where))
    // Certified Plugs get a ranking boost within the same day.
    .orderBy(asc(sql`date_trunc('day', ${events.startsAt})`), desc(users.certifiedPlug), asc(events.startsAt))
    .limit(opts.limit ?? 120);

  const list: FeedEvent[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    timeOfDay: r.timeOfDay,
    startsAt: r.startsAt,
    venueName: r.venueName,
    city: r.city,
    state: r.state,
    lat: r.lat,
    lng: r.lng,
    ageMin: r.ageMin,
    theme: r.theme,
    flyerUrl: r.flyerUrl,
    flyerAlt: r.flyerAlt,
    videoUrl: r.videoUrl,
    posterUrl: r.posterUrl,
    hasStory: r.hasStory,
    saved: r.saved,
    priceFromKobo: r.priceFromKobo === null ? null : Number(r.priceFromKobo),
    distanceKm: opts.origin ? distanceKm(opts.origin, { lat: r.lat, lng: r.lng }) : null,
    host: toHost(r),
  }));

  // Near me: closest first, but only when the user has not picked a state to travel to.
  if (opts.origin && !f?.state) list.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return list;
}

export type EventMediaItem = {
  id: string;
  type: "flyer" | "video" | "story";
  url: string;
  watermarkedUrl: string | null;
  posterUrl: string | null;
  alt: string | null;
  caption: string | null;
  createdBy: string | null;
  isVideo: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  seenCount?: number;
};

export type EventCollaboratorItem = {
  userId: string;
  handle: string;
  displayName: string;
  role: "co_host" | "promoter" | "vendor";
  vendorType: string | null;
  status: "invited" | "accepted" | "declined";
};

export type EventDetail = {
  event: typeof events.$inferSelect;
  host: HostSummary;
  flyers: EventMediaItem[];
  videos: EventMediaItem[];
  stories: EventMediaItem[];
  tiers: (typeof ticketTiers.$inferSelect)[];
  links: { platform: string; url: string }[];
  collaborators: EventCollaboratorItem[];
  saved: boolean;
};

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|$)/i;

async function loadDetail(
  row: typeof events.$inferSelect,
  host: HostSummary,
  opts: { viewerId?: string; includeInvited?: boolean; withSeenCounts?: boolean },
): Promise<EventDetail> {
  const db = getDb();
  const [media, tiers, links, collabs, saved] = await Promise.all([
    db
      .select({
        id: eventMedia.id,
        type: eventMedia.type,
        url: eventMedia.url,
        watermarkedUrl: eventMedia.watermarkedUrl,
        posterUrl: eventMedia.posterUrl,
        alt: eventMedia.alt,
        caption: eventMedia.caption,
        createdBy: eventMedia.createdBy,
        createdAt: eventMedia.createdAt,
        expiresAt: eventMedia.expiresAt,
        seenCount: opts.withSeenCounts
          ? sql<number>`(select count(*)::int from ${storyViews} v where v.media_id = ${eventMedia.id})`
          : sql<number>`0`,
      })
      .from(eventMedia)
      .where(
        and(eq(eventMedia.eventId, row.id), or(isNull(eventMedia.expiresAt), gt(eventMedia.expiresAt, new Date()))),
      )
      .orderBy(asc(eventMedia.order), asc(eventMedia.createdAt)),
    db.select().from(ticketTiers).where(eq(ticketTiers.eventId, row.id)).orderBy(asc(ticketTiers.priceKobo)),
    db
      .select({ platform: eventLinks.platform, url: eventLinks.url })
      .from(eventLinks)
      .where(eq(eventLinks.eventId, row.id)),
    db
      .select({
        userId: users.id,
        handle: users.handle,
        displayName: users.displayName,
        role: eventCollaborators.role,
        vendorType: eventCollaborators.vendorType,
        status: eventCollaborators.status,
      })
      .from(eventCollaborators)
      .innerJoin(users, eq(users.id, eventCollaborators.userId))
      .where(
        and(
          eq(eventCollaborators.eventId, row.id),
          opts.includeInvited ? undefined : eq(eventCollaborators.status, "accepted"),
        ),
      )
      .orderBy(asc(eventCollaborators.createdAt)),
    opts.viewerId
      ? db
          .select({ eventId: savedEvents.eventId })
          .from(savedEvents)
          .where(and(eq(savedEvents.eventId, row.id), eq(savedEvents.userId, opts.viewerId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const items: EventMediaItem[] = media.map((m) => ({ ...m, isVideo: m.type === "video" || VIDEO_EXT.test(m.url) }));
  return {
    event: row,
    host,
    flyers: items.filter((m) => m.type === "flyer"),
    videos: items.filter((m) => m.type === "video"),
    stories: items.filter((m) => m.type === "story"),
    tiers,
    links,
    collaborators: collabs,
    saved: saved.length > 0,
  };
}

async function findEvent(where: SQL) {
  const [row] = await getDb()
    .select({ event: events, ...hostColumns })
    .from(events)
    .innerJoin(users, eq(users.id, events.ownerId))
    .where(where)
    .limit(1);
  return row ? { event: row.event, host: toHost(row) } : null;
}

/** Public event page. Drafts and cancelled events are only visible to their team (checked by the caller). */
export async function getEventBySlug(slug: string, viewerId?: string): Promise<EventDetail | null> {
  const found = await findEvent(eq(events.slug, slug));
  if (!found) return null;
  return loadDetail(found.event, found.host, { viewerId });
}

/** Everything the Plug editor needs, including pending invites and story seen counts. */
export async function getEventForEdit(id: string): Promise<EventDetail | null> {
  const found = await findEvent(eq(events.id, id));
  if (!found) return null;
  return loadDetail(found.event, found.host, { includeInvited: true, withSeenCounts: true });
}

export async function getCollaboration(eventId: string, userId: string) {
  const [row] = await getDb()
    .select({ role: eventCollaborators.role, status: eventCollaborators.status })
    .from(eventCollaborators)
    .where(and(eq(eventCollaborators.eventId, eventId), eq(eventCollaborators.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type MyEvent = {
  id: string;
  slug: string;
  title: string;
  status: (typeof events.$inferSelect)["status"];
  startsAt: Date;
  city: string;
  role: "owner" | "co_host" | "promoter" | "vendor";
  sold: number;
  capacity: number;
};

/** Events the user leads or collaborates on, newest first. */
export async function listMyEvents(userId: string): Promise<MyEvent[]> {
  const rows = await getDb()
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      status: events.status,
      startsAt: events.startsAt,
      city: events.city,
      ownerId: events.ownerId,
      collabRole: sql<MyEvent["role"] | null>`(
        select c.role from ${eventCollaborators} c
        where c.event_id = ${events.id} and c.user_id = ${userId} and c.status = 'accepted'
      )`,
      sold: sql<number>`coalesce((select sum(t.sold)::int from ${ticketTiers} t where t.event_id = ${events.id}), 0)`,
      capacity: sql<number>`coalesce((select sum(t.quantity)::int from ${ticketTiers} t where t.event_id = ${events.id}), 0)`,
    })
    .from(events)
    .where(
      or(
        eq(events.ownerId, userId),
        sql`exists (select 1 from ${eventCollaborators} c where c.event_id = ${events.id} and c.user_id = ${userId} and c.status = 'accepted')`,
      ),
    )
    .orderBy(desc(events.startsAt));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    startsAt: r.startsAt,
    city: r.city,
    role: r.ownerId === userId ? "owner" : (r.collabRole ?? "promoter"),
    sold: r.sold,
    capacity: r.capacity,
  }));
}

export type Invite = {
  eventId: string;
  slug: string;
  title: string;
  startsAt: Date;
  role: "co_host" | "promoter" | "vendor";
  vendorType: string | null;
  hostHandle: string;
};

/** Pending collaborator invites and vendor co-sign requests for a user. */
export async function listInvites(userId: string): Promise<Invite[]> {
  return getDb()
    .select({
      eventId: events.id,
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      role: eventCollaborators.role,
      vendorType: eventCollaborators.vendorType,
      hostHandle: users.handle,
    })
    .from(eventCollaborators)
    .innerJoin(events, eq(events.id, eventCollaborators.eventId))
    .innerJoin(users, eq(users.id, events.ownerId))
    .where(and(eq(eventCollaborators.userId, userId), eq(eventCollaborators.status, "invited")))
    .orderBy(asc(events.startsAt));
}
