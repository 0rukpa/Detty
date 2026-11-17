/**
 * Scheduled money jobs (spec 6.6 and 7.4), run by /api/cron/escrow every few
 * minutes and by the test-mode "simulate event start" button.
 *
 *  1. Fulfil any paid checkouts whose webhook was missed, then release expired 10-minute holds.
 *  2. Event start reached  -> status "live", escrow moves to Available
 *     (recovering any early-access debt first), auto payout if that is the Plug's mode.
 *  3. Event end reached    -> status "ended".
 *  4. 24h after the end    -> sweep balances under the manual minimum so nothing is ever stuck.
 */
import "server-only";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { APP_CONFIG } from "@/config/app";
import { FEES, gbdToKobo } from "@/config/fees";
import { getDb } from "@/db";
import { escrowReleases, events, organiserEarnings, users } from "@/db/schema";
import { sweepExpiredHolds } from "./checkout";
import { applyRelease } from "./escrow";
import { addEarnings } from "./ledger";
import { createWithdrawal } from "./withdrawals";

export type JobReport = { holdsReleased: number; wentLive: number; released: number; autoPaid: number; ended: number; swept: number };

/** Move one event's escrow to Available. Returns the amount released, or null if there was nothing to do. */
export async function releaseEscrow(eventId: string): Promise<{ ownerId: string; toAvailable: number } | null> {
  return getDb().transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for("update").limit(1);
    // Never release while refunds may still be needed.
    if (!event || event.status === "cancelled" || event.status === "pending_review" || event.status === "draft") return null;

    const claimed = await tx
      .update(escrowReleases)
      .set({ status: "released" })
      .where(and(eq(escrowReleases.eventId, eventId), eq(escrowReleases.status, "scheduled")))
      .returning({ eventId: escrowReleases.eventId });
    if (claimed.length === 0) return null; // already released (idempotent)

    const [escrow] = await tx
      .select()
      .from(organiserEarnings)
      .where(and(eq(organiserEarnings.userId, event.ownerId), eq(organiserEarnings.eventId, eventId), eq(organiserEarnings.bucket, "escrow")))
      .for("update")
      .limit(1);
    const amount = Math.max(escrow?.amountKobo ?? 0, 0);

    const [owner] = await tx.select().from(users).where(eq(users.id, event.ownerId)).for("update").limit(1);
    const { toAvailable, debtRepaid, debtLeft } = applyRelease(amount, owner.earlyAccessDebtKobo);

    if (amount > 0) {
      await addEarnings(tx, owner.id, eventId, "escrow", -amount);
      await addEarnings(tx, owner.id, eventId, "available", toAvailable);
    }
    if (debtRepaid > 0) {
      await tx
        .update(users)
        .set({ earlyAccessDebtKobo: debtLeft, earlyAccessFrozen: debtLeft > 0 })
        .where(eq(users.id, owner.id));
    }
    return { ownerId: owner.id, toAvailable };
  });
}

export async function runEscrowJobs(opts: { now?: Date; eventId?: string } = {}): Promise<JobReport> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const only = opts.eventId ? eq(events.id, opts.eventId) : undefined;
  const report: JobReport = { holdsReleased: 0, wentLive: 0, released: 0, autoPaid: 0, ended: 0, swept: 0 };

  report.holdsReleased = await sweepExpiredHolds();

  // 2a. published -> live
  const live = await db
    .update(events)
    .set({ status: "live" })
    .where(and(eq(events.status, "published"), lte(events.startsAt, now), gt(events.endsAt, now), only))
    .returning({ id: events.id });
  report.wentLive = live.length;

  // 2b. release escrow that has reached its unlock time
  const unlockTime = APP_CONFIG.ESCROW_RELEASE === "event_start" ? sql`${events.startsAt}` : sql`${events.endsAt} + interval '24 hours'`;
  const due = await db
    .select({ id: events.id, ownerId: events.ownerId, eventMode: events.payoutMode, userMode: users.payoutMode })
    .from(escrowReleases)
    .innerJoin(events, eq(events.id, escrowReleases.eventId))
    .innerJoin(users, eq(users.id, events.ownerId))
    .where(and(eq(escrowReleases.status, "scheduled"), sql`${unlockTime} <= ${now.toISOString()}::timestamptz`, inArray(events.status, ["published", "live", "ended"]), only));

  for (const e of due) {
    const released = await releaseEscrow(e.id);
    if (!released) continue;
    report.released += 1;
    // Auto payout (the default): the moment the event starts, earnings are sent. No button to press.
    if ((e.eventMode ?? e.userMode) === "auto_at_start" && released.toAvailable > 0) {
      const paid = await createWithdrawal({ userId: e.ownerId, mode: "auto", eventId: e.id });
      if (paid.ok) report.autoPaid += 1;
    }
  }

  // 3. live/published -> ended
  const ended = await db
    .update(events)
    .set({ status: "ended" })
    .where(and(inArray(events.status, ["published", "live"]), lte(events.endsAt, now), only))
    .returning({ id: events.id });
  report.ended = ended.length;

  // 4. sweep small balances 24h after the event ends
  const sweepBefore = new Date(now.getTime() - FEES.sweepSmallBalancesAfterHours * 3_600_000);
  const small = await db
    .select({ userId: organiserEarnings.userId, eventId: organiserEarnings.eventId })
    .from(organiserEarnings)
    .innerJoin(events, eq(events.id, organiserEarnings.eventId))
    .where(
      and(
        eq(organiserEarnings.bucket, "available"),
        gt(organiserEarnings.amountKobo, 0),
        sql`${organiserEarnings.amountKobo} < ${gbdToKobo(FEES.minWithdrawalGbd)}`,
        lte(events.endsAt, sweepBefore),
        only,
      ),
    );
  for (const s of small) {
    const paid = await createWithdrawal({ userId: s.userId, mode: "sweep", eventId: s.eventId });
    if (paid.ok) report.swept += 1;
  }

  return report;
}
