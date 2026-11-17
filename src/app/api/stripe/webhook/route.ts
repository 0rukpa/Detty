import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getDb } from "@/db";
import { orders, stripeEvents } from "@/db/schema";
import { applyRefund, handlePaidSession } from "@/features/payments/checkout";
import { releaseHold } from "@/features/payments/ledger";
import { markTransfer, syncPayoutAccount } from "@/features/payments/withdrawals";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/**
 * Stripe webhooks: the source of truth for payment state (spec Section 17).
 *  - Signature verified against STRIPE_WEBHOOK_SECRET on the raw body.
 *  - Idempotent: each event id is recorded once; handlers are also idempotent
 *    on their own, so a replay or a crash mid-handler is safe.
 *
 * Local testing:  stripe listen --forward-to localhost:3000/api/stripe/webhook
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !secret) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const db = getDb();
  const [seen] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, event.id)).limit(1);
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handle(event);
  } catch (err) {
    // A 500 makes Stripe retry later; we have not recorded the event, so the retry is processed.
    console.error(`webhook ${event.type} failed`, err);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return NextResponse.json({ received: true });
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handlePaidSession(event.data.object);
      return;

    case "checkout.session.expired": {
      const orderId = event.data.object.metadata?.order_id;
      if (orderId) await releaseHold(orderId, "expired");
      return;
    }

    case "payment_intent.payment_failed": {
      // The buyer can retry inside the same Checkout Session, so the hold is kept until it expires.
      console.warn("payment failed for order", event.data.object.metadata?.order_id);
      return;
    }

    case "payment_intent.succeeded":
      // Fulfilment happens on checkout.session.completed, which carries the order metadata and totals.
      return;

    case "charge.refunded": {
      const charge = event.data.object;
      const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!intent || !charge.refunded) return; // partial refunds are handled manually by admins
      const [order] = await getDb().select({ id: orders.id }).from(orders).where(eq(orders.paymentIntentId, intent)).limit(1);
      if (order) await applyRefund(order.id);
      return;
    }

    case "account.updated":
      await syncPayoutAccount({ accountId: event.data.object.id });
      return;

    case "transfer.created":
      await markTransfer(event.data.object.id, "paid");
      return;

    case "transfer.reversed":
      await markTransfer(event.data.object.id, "failed");
      return;

    case "identity.verification_session.verified":
    case "identity.verification_session.requires_input":
      // Handled in Phase 4 (Plug verification).
      return;

    default:
      return;
  }
}
