"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { events, orders, organiserEarnings, ticketTiers, tickets, users } from "@/db/schema";
import { getAuthUser, requireProfile } from "@/features/auth/session";
import { getCollaboration } from "@/features/events/queries";
import { canEditDetails, eventAccess } from "@/features/events/rules";
import { verifyTicketToken } from "@/features/tickets/qr";
import { getStripe, isStripeConfigured, isStripeTestMode } from "@/lib/stripe";
import { refundOrder, startTicketCheckout } from "./checkout";
import { cancellationImpact } from "./escrow";
import { runEscrowJobs } from "./jobs";
import { addEarnings, releaseHold } from "./ledger";
import { getPayoutProvider } from "./providers";
import { createWithdrawal, earlyTaken, startPayoutOnboarding, syncPayoutAccount } from "./withdrawals";

export type PayState = { error?: string; ok?: string };

const uuid = z.string().uuid();
const checkoutSchema = z.object({ tierId: uuid, quantity: z.coerce.number().int().min(1).max(50) });

/** Buy tickets: reserves inventory, then sends the buyer to Stripe Checkout (or straight to The Lounge if free). */
export async function buyTickets(_prev: PayState, formData: FormData): Promise<PayState> {
  const profile = await requireProfile();
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pick a ticket and quantity." };
  const authUser = await getAuthUser();
  const result = await startTicketCheckout(profile, authUser?.email, parsed.data.tierId, parsed.data.quantity);
  if (!result.ok) return { error: result.error };
  redirect(result.redirectTo);
}

// ---------- payout account ----------

export async function setUpPayouts(): Promise<PayState> {
  const profile = await requireProfile();
  if (!profile.isPlug) return { error: "Only Plugs have payouts." };
  const authUser = await getAuthUser();
  let url: string;
  try {
    url = await startPayoutOnboarding(profile, authUser?.email);
  } catch (err) {
    console.error("payout onboarding failed", err);
    const message = err instanceof Error ? err.message : "";
    if (/losses.collector|platform.profile|managed.risk/i.test(message)) {
      return {
        error:
          "Stripe needs the platform owner to accept the Connect loss-liability acknowledgement first (Stripe Dashboard > Settings > Connect > Platform profile).",
      };
    }
    return { error: "We could not start payout setup. Try again shortly." };
  }
  await syncPayoutAccount({ userId: profile.id });
  redirect(url);
}

export async function openPayoutDashboard(): Promise<PayState> {
  const profile = await requireProfile();
  const account = await syncPayoutAccount({ userId: profile.id });
  if (!account) return { error: "Set up payouts first." };
  const url = await getPayoutProvider().dashboardUrl(account.stripeAccountId);
  if (!url) return { error: "Your payout dashboard opens once setup is complete." };
  redirect(url);
}

export async function setPayoutMode(_prev: PayState, formData: FormData): Promise<PayState> {
  const profile = await requireProfile();
  const mode = z.enum(["auto_at_start", "manual"]).safeParse(formData.get("mode"));
  if (!mode.success) return { error: "Pick a payout mode." };
  await getDb().update(users).set({ payoutMode: mode.data }).where(eq(users.id, profile.id));
  return { ok: mode.data === "manual" ? "You will withdraw manually." : "Earnings will be sent automatically when each event starts." };
}

export async function withdraw(_prev: PayState, formData: FormData): Promise<PayState> {
  const profile = await requireProfile();
  const eventId = formData.get("eventId") ? String(formData.get("eventId")) : undefined;
  const early = formData.get("early") === "1";
  if (eventId && !uuid.safeParse(eventId).success) return { error: "Unknown event." };
  const result = await createWithdrawal({ userId: profile.id, mode: early ? "early" : "manual", eventId });
  if (!result.ok) return { error: result.error };
  return { ok: `Sent. You'll receive ₦${(result.netKobo / 100).toLocaleString("en-NG")} after the ₦${(result.feeKobo / 100).toLocaleString("en-NG")} fee.` };
}

// ---------- cancel + refunds ----------

/** Cancel an event before it starts: every ticket is refunded automatically through Stripe (spec 5.4). */
export async function cancelEvent(eventId: string): Promise<PayState> {
  if (!uuid.safeParse(eventId).success) return { error: "Unknown event." };
  const profile = await requireProfile();
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || (event.ownerId !== profile.id && profile.role !== "admin")) return { error: "Only the Lead Plug can cancel this event." };
  if (!["draft", "published", "pending_review"].includes(event.status)) return { error: "This event can no longer be cancelled here." };
  if (event.status === "published" && event.startsAt <= new Date()) return { error: "The event has already started. Contact support for refunds." };

  // Stop new sales first, then unwind.
  await db.update(events).set({ status: "cancelled" }).where(eq(events.id, eventId));

  const pending = await db.select({ id: orders.id, session: orders.stripeCheckoutId }).from(orders).where(and(eq(orders.eventId, eventId), eq(orders.status, "pending")));
  for (const o of pending) {
    await releaseHold(o.id, "expired");
    if (o.session && isStripeConfigured()) await getStripe().checkout.sessions.expire(o.session).catch(() => undefined);
  }

  const paid = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.eventId, eventId), eq(orders.status, "paid")));
  let failed = 0;
  for (const o of paid) {
    try {
      await refundOrder(o.id);
    } catch (err) {
      failed += 1;
      console.error("refund failed for order", o.id, err);
    }
  }

  // Early access already paid out becomes a debt recovered from future earnings (spec 7.4 rule 4).
  const impact = cancellationImpact(await earlyTaken(eventId));
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(organiserEarnings)
      .where(and(eq(organiserEarnings.eventId, eventId), inArray(organiserEarnings.bucket, ["escrow", "available"])));
    for (const r of rows) await addEarnings(tx, r.userId, eventId, r.bucket, -r.amountKobo);
    if (impact.newDebtKobo > 0) {
      await tx
        .update(users)
        .set({ earlyAccessDebtKobo: sql`${users.earlyAccessDebtKobo} + ${impact.newDebtKobo}`, earlyAccessFrozen: true })
        .where(eq(users.id, event.ownerId));
    }
  });

  if (failed > 0) return { error: `Cancelled, but ${failed} refund(s) need a retry. Our team has been alerted.` };
  return { ok: paid.length > 0 ? `Cancelled. ${paid.length} order(s) refunded in full.` : "Event cancelled." };
}

// ---------- check-in ----------

export type CheckInState = { status: "idle" } | { status: "ok" | "duplicate" | "invalid"; message: string; detail?: string };

/** Scan a ticket at the door: verifies the signature, then marks it used exactly once. */
export async function checkInTicket(eventId: string, token: string): Promise<CheckInState> {
  if (!uuid.safeParse(eventId).success) return { status: "invalid", message: "Unknown event." };
  const profile = await requireProfile();
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return { status: "invalid", message: "Unknown event." };
  const collab = event.ownerId === profile.id ? null : await getCollaboration(eventId, profile.id);
  if (!canEditDetails(eventAccess(profile.id, event.ownerId, collab))) return { status: "invalid", message: "You can't check in for this event." };

  const ticketId = verifyTicketToken(String(token).slice(0, 200));
  if (!ticketId) return { status: "invalid", message: "Not a valid Detty ticket." };

  const [ticket] = await db
    .select({ id: tickets.id, eventId: tickets.eventId, status: tickets.status, checkedInAt: tickets.checkedInAt, tier: ticketTiers.name, handle: users.handle, name: users.displayName })
    .from(tickets)
    .innerJoin(ticketTiers, eq(ticketTiers.id, tickets.tierId))
    .innerJoin(users, eq(users.id, tickets.userId))
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!ticket) return { status: "invalid", message: "Ticket not found." };
  if (ticket.eventId !== eventId) return { status: "invalid", message: "This ticket is for a different event." };
  const who = `${ticket.name} (@${ticket.handle}) · ${ticket.tier}`;
  if (ticket.status === "refunded") return { status: "invalid", message: "This ticket was refunded.", detail: who };

  // Atomic: only one scan can flip valid -> used.
  const used = await db
    .update(tickets)
    .set({ status: "used", checkedInAt: new Date() })
    .where(and(eq(tickets.id, ticketId), eq(tickets.status, "valid")))
    .returning({ id: tickets.id });
  if (used.length === 0) {
    const at = ticket.checkedInAt
      ? new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(ticket.checkedInAt)
      : "earlier";
    return { status: "duplicate", message: `Already checked in at ${at}.`, detail: who };
  }
  return { status: "ok", message: "Checked in. Let them in!", detail: who };
}

// ---------- demo tools (Stripe test mode only) ----------

/**
 * Fast-forward an event to "started" so escrow releases now (hackathon demo, spec Section 16).
 * Refuses to run with live keys.
 */
export async function simulateEventStart(eventId: string): Promise<PayState> {
  if (!isStripeTestMode()) return { error: "Only available in Stripe test mode." };
  if (!uuid.safeParse(eventId).success) return { error: "Unknown event." };
  const profile = await requireProfile();
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || (event.ownerId !== profile.id && profile.role !== "admin")) return { error: "Only the Lead Plug can do this." };
  if (event.status !== "published") return { error: "Only a published event that has not started can be fast-forwarded." };

  const now = new Date();
  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = event.endsAt > now ? event.endsAt : new Date(now.getTime() + 4 * 3_600_000);
  await db.update(events).set({ startsAt, endsAt, doorsAt: null }).where(eq(events.id, eventId));
  const report = await runEscrowJobs({ now, eventId });
  return {
    ok: report.released > 0
      ? report.autoPaid > 0
        ? "Event started. Escrow released and your auto payout was sent."
        : "Event started. Escrow moved to Available."
      : "Event started. There was no escrow to release.",
  };
}
