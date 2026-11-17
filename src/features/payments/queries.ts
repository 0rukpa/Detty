import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connectAccounts,
  conversationMembers,
  conversations,
  events,
  organiserEarnings,
  ticketTiers,
  tickets,
  users,
  withdrawals,
} from "@/db/schema";
import { earlyAccessAvailable, releaseAt, trustLevel } from "./escrow";
import { earlyTaken, hasVenueProof, payoutBlockReason } from "./withdrawals";

export type WalletTicket = {
  id: string;
  qrToken: string;
  status: "valid" | "used" | "refunded";
  checkedInAt: Date | null;
  tierName: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventStatus: string;
  startsAt: Date;
  venueName: string;
  city: string;
};

export async function listMyTickets(userId: string): Promise<WalletTicket[]> {
  return getDb()
    .select({
      id: tickets.id,
      qrToken: tickets.qrToken,
      status: tickets.status,
      checkedInAt: tickets.checkedInAt,
      tierName: ticketTiers.name,
      eventId: events.id,
      eventSlug: events.slug,
      eventTitle: events.title,
      eventStatus: events.status,
      startsAt: events.startsAt,
      venueName: events.venueName,
      city: events.city,
    })
    .from(tickets)
    .innerJoin(ticketTiers, eq(ticketTiers.id, tickets.tierId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .where(eq(tickets.userId, userId))
    .orderBy(asc(events.startsAt), asc(tickets.createdAt));
}

/** How many live (not refunded) tickets the user holds for an event. */
export async function countMyTickets(userId: string, eventId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(tickets)
    .where(and(eq(tickets.userId, userId), eq(tickets.eventId, eventId), inArray(tickets.status, ["valid", "used"])));
  return row?.n ?? 0;
}

export type LoungeSummary = { eventId: string; slug: string; title: string; startsAt: Date; city: string; members: number; role: string };

/** The Lounges a user belongs to (ticket holders, the Lead Plug). */
export async function listMyLounges(userId: string): Promise<LoungeSummary[]> {
  return getDb()
    .select({
      eventId: events.id,
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      city: events.city,
      role: conversationMembers.role,
      members: sql<number>`(select count(*)::int from ${conversationMembers} m where m.conversation_id = ${conversations.id} and not m.removed)`,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .innerJoin(events, eq(events.id, conversations.eventId))
    .where(and(eq(conversationMembers.userId, userId), eq(conversations.type, "event_lounge"), eq(conversationMembers.removed, false)))
    .orderBy(asc(events.startsAt));
}

/** Lounge access: only paid ticket holders, the Lead Plug and collaborators (spec 8.1). */
export async function getLounge(eventId: string, userId: string) {
  const [row] = await getDb()
    .select({
      conversationId: conversations.id,
      role: conversationMembers.role,
      members: sql<number>`(select count(*)::int from ${conversationMembers} m where m.conversation_id = ${conversations.id} and not m.removed)`,
    })
    .from(conversations)
    .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.eventId, eventId),
        eq(conversations.type, "event_lounge"),
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.removed, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type EventEarnings = {
  eventId: string;
  slug: string;
  title: string;
  status: string;
  startsAt: Date;
  unlocksAt: Date;
  escrowKobo: number;
  availableKobo: number;
  withdrawnKobo: number;
  earlyAvailableKobo: number;
  ticketsSold: number;
  checkedIn: number;
};

export type PayoutDashboard = {
  totals: { escrowKobo: number; availableKobo: number; withdrawnKobo: number; earlyAvailableKobo: number };
  events: EventEarnings[];
  /** The next escrow to unlock, for the countdown. */
  nextUnlock: { title: string; at: Date; kobo: number } | null;
  withdrawals: (typeof withdrawals.$inferSelect)[];
  account: typeof connectAccounts.$inferSelect | null;
  blockReason: string | null;
  debtKobo: number;
};

export async function getPayoutDashboard(userId: string): Promise<PayoutDashboard> {
  const db = getDb();
  const [[user], rows, history, [account], blockReason] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({
        eventId: events.id,
        slug: events.slug,
        title: events.title,
        status: events.status,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        bucket: organiserEarnings.bucket,
        amountKobo: organiserEarnings.amountKobo,
        ticketsSold: sql<number>`(select count(*)::int from ${tickets} t where t.event_id = ${events.id} and t.status <> 'refunded')`,
        checkedIn: sql<number>`(select count(*)::int from ${tickets} t where t.event_id = ${events.id} and t.status = 'used')`,
      })
      .from(organiserEarnings)
      .innerJoin(events, eq(events.id, organiserEarnings.eventId))
      .where(eq(organiserEarnings.userId, userId))
      .orderBy(asc(events.startsAt)),
    db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt)).limit(30),
    db.select().from(connectAccounts).where(eq(connectAccounts.userId, userId)).limit(1),
    payoutBlockReason(userId),
  ]);

  const byEvent = new Map<string, EventEarnings & { endsAt: Date }>();
  for (const r of rows) {
    const e =
      byEvent.get(r.eventId) ??
      ({
        eventId: r.eventId,
        slug: r.slug,
        title: r.title,
        status: r.status,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        unlocksAt: releaseAt(r),
        escrowKobo: 0,
        availableKobo: 0,
        withdrawnKobo: 0,
        earlyAvailableKobo: 0,
        ticketsSold: r.ticketsSold,
        checkedIn: r.checkedIn,
      } satisfies EventEarnings & { endsAt: Date });
    if (r.bucket === "escrow") e.escrowKobo = r.amountKobo;
    if (r.bucket === "available") e.availableKobo = r.amountKobo;
    if (r.bucket === "withdrawn") e.withdrawnKobo = r.amountKobo;
    byEvent.set(r.eventId, e);
  }

  const now = new Date();
  const list = [...byEvent.values()];
  for (const e of list) {
    if (e.escrowKobo > 0 && e.status === "published" && e.startsAt > now && user) {
      e.earlyAvailableKobo = earlyAccessAvailable({
        escrowKobo: e.escrowKobo,
        earlyTakenKobo: await earlyTaken(e.eventId),
        level: trustLevel(user, await hasVenueProof(e.eventId)),
        frozen: user.earlyAccessFrozen,
      });
    }
  }

  const sum = (pick: (e: EventEarnings) => number) => list.reduce((n, e) => n + pick(e), 0);
  const upcoming = list.filter((e) => e.escrowKobo > 0 && e.status !== "cancelled").sort((a, b) => a.unlocksAt.getTime() - b.unlocksAt.getTime())[0];

  return {
    totals: {
      escrowKobo: sum((e) => e.escrowKobo),
      availableKobo: sum((e) => e.availableKobo),
      withdrawnKobo: sum((e) => e.withdrawnKobo),
      earlyAvailableKobo: sum((e) => e.earlyAvailableKobo),
    },
    events: list,
    nextUnlock: upcoming ? { title: upcoming.title, at: upcoming.unlocksAt, kobo: upcoming.escrowKobo } : null,
    withdrawals: history,
    account: account ?? null,
    blockReason,
    debtKobo: user?.earlyAccessDebtKobo ?? 0,
  };
}

export type Attendee = { ticketId: string; handle: string; displayName: string; tier: string; status: string; checkedInAt: Date | null };

export async function listAttendees(eventId: string): Promise<Attendee[]> {
  return getDb()
    .select({
      ticketId: tickets.id,
      handle: users.handle,
      displayName: users.displayName,
      tier: ticketTiers.name,
      status: tickets.status,
      checkedInAt: tickets.checkedInAt,
    })
    .from(tickets)
    .innerJoin(users, eq(users.id, tickets.userId))
    .innerJoin(ticketTiers, eq(ticketTiers.id, tickets.tierId))
    .where(and(eq(tickets.eventId, eventId), inArray(tickets.status, ["valid", "used"])))
    .orderBy(desc(tickets.checkedInAt), asc(users.handle));
}
