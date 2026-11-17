/**
 * Every movement of ticket inventory and organiser money happens here, inside
 * database transactions, and every function is idempotent: Stripe can deliver
 * the same webhook twice, and the success page may race the webhook.
 */
import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { APP_CONFIG } from "@/config/app";
import { getDb, type Db } from "@/db";
import {
  conversationMembers,
  conversations,
  escrowReleases,
  events,
  orders,
  organiserEarnings,
  ticketTiers,
  tickets,
} from "@/db/schema";
import { signTicket } from "@/features/tickets/qr";
import { releaseAt } from "./escrow";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Bucket = "escrow" | "available" | "withdrawn";

/** Add (or subtract) from one earnings bucket. The DB constraint is one row per (user, event, bucket). */
export async function addEarnings(tx: Tx, userId: string, eventId: string, bucket: Bucket, deltaKobo: number) {
  if (deltaKobo === 0) return;
  await tx
    .insert(organiserEarnings)
    .values({ userId, eventId, bucket, amountKobo: deltaKobo })
    .onConflictDoUpdate({
      target: [organiserEarnings.userId, organiserEarnings.eventId, organiserEarnings.bucket],
      set: { amountKobo: sql`${organiserEarnings.amountKobo} + ${deltaKobo}`, updatedAt: new Date() },
    });
}

/** The Lounge for an event, created on first use with the Lead Plug as host. */
export async function ensureLounge(tx: Tx, eventId: string, ownerId: string): Promise<string> {
  const [existing] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.eventId, eventId), eq(conversations.type, "event_lounge")))
    .limit(1);
  let id = existing?.id;
  if (!id) {
    [{ id }] = await tx.insert(conversations).values({ type: "event_lounge", eventId }).returning({ id: conversations.id });
  }
  await tx.insert(conversationMembers).values({ conversationId: id, userId: ownerId, role: "host" }).onConflictDoNothing();
  return id;
}

export type FulfilResult =
  | { status: "fulfilled" | "already_paid"; orderId: string; eventId: string }
  | { status: "oversold" | "not_found" | "not_payable"; orderId: string };

/**
 * Turn a paid (or free) order into tickets: take the inventory, issue signed QR
 * tickets, credit the Plug's escrow, and add the buyer to The Lounge.
 */
export async function fulfilOrder(orderId: string, paymentIntentId?: string | null): Promise<FulfilResult> {
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    if (!order || !order.tierId) return { status: "not_found", orderId };
    if (order.status === "paid") return { status: "already_paid", orderId, eventId: order.eventId };
    if (order.status !== "pending" && order.status !== "expired") return { status: "not_payable", orderId };

    if (order.status === "pending") {
      // The 10-minute hold is still ours: convert it into a sale.
      await tx
        .update(ticketTiers)
        .set({ sold: sql`${ticketTiers.sold} + ${order.quantity}`, reserved: sql`greatest(${ticketTiers.reserved} - ${order.quantity}, 0)` })
        .where(eq(ticketTiers.id, order.tierId));
    } else {
      // Paid after the hold lapsed. Only honour it if tickets are still left; otherwise the caller refunds.
      const taken = await tx
        .update(ticketTiers)
        .set({ sold: sql`${ticketTiers.sold} + ${order.quantity}` })
        .where(
          and(
            eq(ticketTiers.id, order.tierId),
            sql`${ticketTiers.quantity} - ${ticketTiers.sold} - ${ticketTiers.reserved} >= ${order.quantity}`,
          ),
        )
        .returning({ id: ticketTiers.id });
      if (taken.length === 0) return { status: "oversold", orderId };
    }

    await tx
      .update(orders)
      .set({ status: "paid", paymentIntentId: paymentIntentId ?? order.paymentIntentId, holdExpiresAt: null })
      .where(eq(orders.id, orderId));

    await tx.insert(tickets).values(
      Array.from({ length: order.quantity }, () => {
        const id = crypto.randomUUID();
        return { id, orderId, tierId: order.tierId!, eventId: order.eventId, userId: order.userId, qrToken: signTicket(id) };
      }),
    );

    const [event] = await tx.select().from(events).where(eq(events.id, order.eventId)).limit(1);
    if (order.organiserNetKobo > 0) {
      const unlock = releaseAt(event);
      const [release] = await tx.select().from(escrowReleases).where(eq(escrowReleases.eventId, event.id)).limit(1);
      // Sales after the escrow already unlocked (door sales) are available straight away.
      const bucket: Bucket = release?.status === "released" ? "available" : "escrow";
      await addEarnings(tx, event.ownerId, event.id, bucket, order.organiserNetKobo);
      await tx
        .insert(escrowReleases)
        .values({ eventId: event.id, releaseAt: unlock, amountKobo: order.organiserNetKobo })
        .onConflictDoUpdate({
          target: escrowReleases.eventId,
          set: { amountKobo: sql`${escrowReleases.amountKobo} + ${order.organiserNetKobo}` },
        });
    }

    const loungeId = await ensureLounge(tx, event.id, event.ownerId);
    await tx
      .insert(conversationMembers)
      .values({ conversationId: loungeId, userId: order.userId, role: "member" })
      .onConflictDoNothing();

    return { status: "fulfilled", orderId, eventId: order.eventId };
  });
}

/** Give a pending order's reserved tickets back (checkout abandoned, failed or timed out). */
export async function releaseHold(orderId: string, status: "expired" | "failed"): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const released = await tx
      .update(orders)
      .set({ status, holdExpiresAt: null })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
      .returning({ tierId: orders.tierId, quantity: orders.quantity });
    if (released.length === 0 || !released[0].tierId) return false;
    await tx
      .update(ticketTiers)
      .set({ reserved: sql`greatest(${ticketTiers.reserved} - ${released[0].quantity}, 0)` })
      .where(eq(ticketTiers.id, released[0].tierId));
    return true;
  });
}

/** Orders whose 10-minute hold has run out. Returns their Checkout Session ids so the caller can expire them at Stripe. */
export async function releaseExpiredHolds(now: Date = new Date()): Promise<string[]> {
  const stale = await getDb()
    .select({ id: orders.id, stripeCheckoutId: orders.stripeCheckoutId })
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.holdExpiresAt, now)))
    .limit(200);
  const sessions: string[] = [];
  for (const o of stale) {
    if ((await releaseHold(o.id, "expired")) && o.stripeCheckoutId) sessions.push(o.stripeCheckoutId);
  }
  return sessions;
}

/**
 * Reserve tickets for a new checkout. Atomic: two buyers can never both get the
 * last ticket. Returns null if there are not enough left.
 */
export async function reserveTickets(tx: Tx, tierId: string, quantity: number) {
  const [tier] = await tx
    .update(ticketTiers)
    .set({ reserved: sql`${ticketTiers.reserved} + ${quantity}` })
    .where(
      and(eq(ticketTiers.id, tierId), sql`${ticketTiers.quantity} - ${ticketTiers.sold} - ${ticketTiers.reserved} >= ${quantity}`),
    )
    .returning();
  return tier ?? null;
}

/** How many tickets in this tier the user already holds or is in the middle of buying. */
export async function ticketsHeldByUser(tx: Tx | Db, tierId: string, userId: string, now: Date = new Date()): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`coalesce(sum(${orders.quantity}), 0)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.tierId, tierId),
        eq(orders.userId, userId),
        sql`(${orders.status} = 'paid' or (${orders.status} = 'pending' and ${orders.holdExpiresAt} > ${now.toISOString()}::timestamptz))`,
      ),
    );
  return row?.n ?? 0;
}

export function holdExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + APP_CONFIG.CHECKOUT_HOLD_MINUTES * 60_000);
}

/**
 * Mark an order refunded and void its tickets. Returns what the caller needs to
 * reverse the Plug's earnings; null if it was already refunded.
 */
export async function markOrderRefunded(tx: Tx, orderId: string) {
  const [order] = await tx
    .update(orders)
    .set({ status: "refunded" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paid")))
    .returning();
  if (!order) return null;
  await tx.update(tickets).set({ status: "refunded" }).where(and(eq(tickets.orderId, orderId), inArray(tickets.status, ["valid", "used"])));
  if (order.tierId) {
    await tx
      .update(ticketTiers)
      .set({ sold: sql`greatest(${ticketTiers.sold} - ${order.quantity}, 0)` })
      .where(eq(ticketTiers.id, order.tierId));
  }
  return order;
}
