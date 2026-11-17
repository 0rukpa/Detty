/**
 * Ticket checkout (spec 7.1): Stripe Checkout with "separate charges and
 * transfers". The charge lands on the platform; the Plug is only paid when the
 * escrow releases and they withdraw.
 */
import "server-only";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { BRAND } from "@/config/brand";
import { FEES } from "@/config/fees";
import { getDb } from "@/db";
import { events, orders, ticketTiers, type User } from "@/db/schema";
import { meetsAgeLimit } from "@/features/profiles/validation";
import { appUrl, getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  fulfilOrder,
  holdExpiry,
  markOrderRefunded,
  releaseExpiredHolds,
  releaseHold,
  reserveTickets,
  ticketsHeldByUser,
  addEarnings,
} from "./ledger";
import { quoteOrder } from "./pricing";

export type CheckoutStart =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/** Expire stale holds in our DB and their sessions at Stripe, so nobody pays for released tickets. */
export async function sweepExpiredHolds(): Promise<number> {
  // Someone may have paid just as their hold ran out: honour the payment before releasing anything.
  await reconcilePendingOrders({ limit: 10 });
  const sessions = await releaseExpiredHolds();
  if (sessions.length > 0 && isStripeConfigured()) {
    const stripe = getStripe();
    await Promise.allSettled(sessions.map((id) => stripe.checkout.sessions.expire(id)));
  }
  return sessions.length;
}

export async function startTicketCheckout(
  buyer: User,
  buyerEmail: string | undefined,
  tierId: string,
  quantity: number,
): Promise<CheckoutStart> {
  const db = getDb();
  await sweepExpiredHolds();

  const [row] = await db
    .select({ tier: ticketTiers, event: events })
    .from(ticketTiers)
    .innerJoin(events, eq(events.id, ticketTiers.eventId))
    .where(eq(ticketTiers.id, tierId))
    .limit(1);
  if (!row) return { ok: false, error: "That ticket is no longer available." };
  const { tier, event } = row;
  const now = new Date();

  // Everything below is enforced here on the server, whatever the UI showed.
  if (event.status !== "published" && event.status !== "live") return { ok: false, error: "Tickets are not on sale for this event." };
  if (event.endsAt <= now) return { ok: false, error: "This event has ended." };
  if (!meetsAgeLimit(buyer.dob, event.ageMin)) return { ok: false, error: `This event is ${event.ageMin}+.` };
  if (tier.salesStart && tier.salesStart > now) return { ok: false, error: "This ticket is not on sale yet." };
  if (tier.salesEnd && tier.salesEnd < now) return { ok: false, error: "Sales for this ticket have closed." };

  const quote = quoteOrder(tier.priceKobo, quantity);
  if (!quote.isFree && !isStripeConfigured()) return { ok: false, error: "Payments are not set up yet." };

  // Reserve inventory for 10 minutes and create the pending order, atomically.
  const reserved = await db.transaction(async (tx) => {
    const held = await ticketsHeldByUser(tx, tier.id, buyer.id, now);
    if (held + quantity > tier.perUserLimit) {
      const left = Math.max(tier.perUserLimit - held, 0);
      return { error: left === 0 ? `You already have the maximum of ${tier.perUserLimit} for this ticket.` : `You can only get ${left} more of this ticket.` };
    }
    if (!(await reserveTickets(tx, tier.id, quantity))) {
      const left = tier.quantity - tier.sold - tier.reserved;
      return { error: left > 0 ? `Only ${left} left.` : "Sold out." };
    }
    const [order] = await tx
      .insert(orders)
      .values({
        userId: buyer.id,
        eventId: event.id,
        tierId: tier.id,
        quantity,
        amountKobo: quote.totalKobo,
        feeKobo: quote.dettyFeeKobo,
        processingFeeKobo: quote.processingFeeKobo,
        organiserNetKobo: quote.ticketsKobo,
        status: "pending",
        holdExpiresAt: holdExpiry(now),
      })
      .returning({ id: orders.id });
    return { orderId: order.id };
  });
  if ("error" in reserved) return { ok: false, error: reserved.error ?? "Could not reserve tickets." };
  const { orderId } = reserved;

  // Free tickets skip Stripe entirely.
  if (quote.isFree) {
    const result = await fulfilOrder(orderId);
    if (result.status !== "fulfilled" && result.status !== "already_paid") {
      await releaseHold(orderId, "failed");
      return { ok: false, error: "Could not issue your ticket. Try again." };
    }
    return { ok: true, redirectTo: `/lounge/${event.id}?welcome=1` };
  }

  try {
    const line = (name: string, amount: number, qty = 1, description?: string) => ({
      quantity: qty,
      price_data: { currency: "ngn", unit_amount: amount, product_data: { name, ...(description ? { description } : {}) } },
    });
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: orderId,
      customer_email: buyerEmail,
      line_items: [
        line(`${event.title}: ${tier.name}`, tier.priceKobo, quantity, `${event.venueName}, ${event.city}`),
        line(`${BRAND.appName} fee (${FEES.ticketFeeGbd * quantity} ${BRAND.currency.code})`, quote.dettyFeeKobo),
        ...(quote.processingFeeKobo > 0 ? [line("Processing fee", quote.processingFeeKobo)] : []),
      ],
      metadata: { kind: "ticket", order_id: orderId, event_id: event.id, user_id: buyer.id },
      payment_intent_data: { metadata: { kind: "ticket", order_id: orderId, event_id: event.id } },
      // Stripe's minimum session lifetime is 30 minutes; our own 10-minute hold is enforced by sweepExpiredHolds().
      expires_at: Math.floor(now.getTime() / 1000) + 31 * 60,
      success_url: `${appUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/checkout/cancel?order_id=${orderId}`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    await db.update(orders).set({ stripeCheckoutId: session.id }).where(eq(orders.id, orderId));
    return { ok: true, redirectTo: session.url };
  } catch (err) {
    console.error("checkout session failed", err);
    await releaseHold(orderId, "failed");
    return { ok: false, error: "We could not start the payment. Try again." };
  }
}

export type PaidOutcome =
  | { status: "fulfilled" | "already_paid"; eventId: string; userId: string }
  | { status: "refunded_oversold" | "unpaid" | "unknown" };

/**
 * A Checkout Session reports as paid. Called from the webhook (source of truth)
 * and from the success page, which re-fetches the session FROM STRIPE so the
 * buyer is never left waiting on webhook delivery. Idempotent.
 */
export async function handlePaidSession(session: Stripe.Checkout.Session): Promise<PaidOutcome> {
  const orderId = session.metadata?.order_id;
  if (session.metadata?.kind !== "ticket" || !orderId) return { status: "unknown" };
  if (session.payment_status !== "paid") return { status: "unpaid" };

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  // Never trust metadata alone: the session must be the one we created for this order, for this amount.
  if (!order || order.stripeCheckoutId !== session.id || session.amount_total !== order.amountKobo) return { status: "unknown" };

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const result = await fulfilOrder(orderId, paymentIntentId);
  if (result.status === "fulfilled" || result.status === "already_paid") {
    return { status: result.status, eventId: result.eventId, userId: order.userId };
  }
  if (result.status === "oversold" && paymentIntentId) {
    // They paid after their hold lapsed and the tickets went to someone else: full refund.
    await getStripe().refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-${orderId}` });
    await db.update(orders).set({ status: "refunded", paymentIntentId }).where(and(eq(orders.id, orderId), eq(orders.status, "expired")));
    return { status: "refunded_oversold" };
  }
  return { status: "unknown" };
}

/**
 * Refund one paid order in full (ticket price + fees) and reverse the Plug's
 * escrow for it. Used by event cancellation and admin refunds.
 */
export async function refundOrder(orderId: string): Promise<boolean> {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.status !== "paid") return false;
  if (order.paymentIntentId) {
    await getStripe().refunds.create({ payment_intent: order.paymentIntentId }, { idempotencyKey: `refund-${orderId}` });
  }
  return applyRefund(orderId);
}

/** Record a refund in our books (also called from the charge.refunded webhook). Idempotent. */
export async function applyRefund(orderId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const order = await markOrderRefunded(tx, orderId);
    if (!order) return false;
    if (order.organiserNetKobo > 0) {
      const [event] = await tx.select({ ownerId: events.ownerId }).from(events).where(eq(events.id, order.eventId)).limit(1);
      // Refunds come out of the escrowed part first (spec 7.4 rule 4).
      await addEarnings(tx, event.ownerId, order.eventId, "escrow", -order.organiserNetKobo);
    }
    return true;
  });
}

/**
 * Abandoned checkout: give the tickets back straight away instead of waiting
 * out the hold. Server-only (NOT a server action): the caller passes the
 * authenticated user's id. Returns the event slug to send them back to.
 */
export async function abandonCheckout(orderId: string, userId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const [order] = await getDb()
    .select({ id: orders.id, userId: orders.userId, session: orders.stripeCheckoutId, slug: events.slug })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.userId !== userId) return null;
  if ((await releaseHold(order.id, "expired")) && order.session && isStripeConfigured()) {
    await getStripe().checkout.sessions.expire(order.session).catch(() => undefined);
  }
  return order.slug;
}

/**
 * Safety net for missed webhooks: ask Stripe directly about checkouts we still
 * think are unpaid, and fulfil any that Stripe says were paid. Covers a buyer
 * who pays and closes the tab before returning, and local development where
 * webhooks can't reach localhost. Runs from the cron job, before holds are
 * released, and when a buyer opens their wallet. Idempotent.
 */
export async function reconcilePendingOrders(opts: { userId?: string; limit?: number } = {}): Promise<number> {
  if (!isStripeConfigured()) return 0;
  const since = new Date(Date.now() - 24 * 3_600_000); // Checkout Sessions live for at most 24h
  const pending = await getDb()
    .select({ id: orders.id, sessionId: orders.stripeCheckoutId })
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending"),
        isNotNull(orders.stripeCheckoutId),
        gt(orders.createdAt, since),
        opts.userId ? eq(orders.userId, opts.userId) : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 50);

  let fulfilled = 0;
  const stripe = getStripe();
  for (const order of pending) {
    try {
      const session = await stripe.checkout.sessions.retrieve(order.sessionId!);
      if (session.payment_status !== "paid") continue;
      const outcome = await handlePaidSession(session);
      if (outcome.status === "fulfilled") fulfilled += 1;
    } catch (err) {
      console.error("reconcile failed for order", order.id, err);
    }
  }
  return fulfilled;
}
