/**
 * Withdrawals and payouts (spec 7.4). "Organisers must never feel their money
 * is stuck": auto payout at event start, manual withdrawal, a sweep for small
 * balances, and early access before the event for trusted Plugs.
 */
import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { BRAND } from "@/config/brand";
import { getDb } from "@/db";
import { connectAccounts, events, organiserEarnings, users, verifications, withdrawals } from "@/db/schema";
import { earlyAccessAvailable, trustLevel } from "./escrow";
import { addEarnings } from "./ledger";
import { quoteWithdrawal } from "./pricing";
import { getPayoutProvider } from "./providers";

export type WithdrawMode = "manual" | "auto" | "sweep" | "early";
export type WithdrawResult =
  | { ok: true; withdrawalId: string; amountKobo: number; feeKobo: number; netKobo: number }
  | { ok: false; error: string };

/**
 * Withdrawals are blocked while refunds might still be needed (spec 7.4):
 * an event under review, or a suspended account. Phase 4 adds open scam reports.
 */
export async function payoutBlockReason(userId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db.select({ suspended: users.suspended, plugStatus: users.plugStatus }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.suspended || user.plugStatus === "suspended") return "Payouts are paused on this account.";
  const [review] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.ownerId, userId), eq(events.status, "pending_review")))
    .limit(1);
  if (review) return "Payouts are paused while one of your events is under review.";
  return null;
}

export async function hasVenueProof(eventId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: verifications.id })
    .from(verifications)
    .where(and(eq(verifications.eventId, eventId), eq(verifications.type, "venue_proof"), eq(verifications.status, "approved")))
    .limit(1);
  return Boolean(row);
}

/** Total already withdrawn early from an event (failed attempts don't count). */
export async function earlyTaken(eventId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<string>`coalesce(sum(${withdrawals.amountKobo}), 0)` })
    .from(withdrawals)
    .where(and(eq(withdrawals.eventId, eventId), eq(withdrawals.early, true), ne(withdrawals.status, "failed")));
  return Number(row?.n ?? 0);
}

export async function createWithdrawal(input: { userId: string; mode: WithdrawMode; eventId?: string }): Promise<WithdrawResult> {
  const db = getDb();
  const provider = getPayoutProvider();

  const [account] = await db.select().from(connectAccounts).where(eq(connectAccounts.userId, input.userId)).limit(1);
  if (!account?.payoutsEnabled) return { ok: false, error: "Set up your payout account first." };
  const blocked = await payoutBlockReason(input.userId);
  if (blocked) return { ok: false, error: blocked };

  // Early access needs facts gathered before the transaction.
  let earlyCap = 0;
  if (input.mode === "early") {
    if (!input.eventId) return { ok: false, error: "Pick an event." };
    const [row] = await db
      .select({ event: events, user: users })
      .from(events)
      .innerJoin(users, eq(users.id, events.ownerId))
      .where(and(eq(events.id, input.eventId), eq(events.ownerId, input.userId)))
      .limit(1);
    if (!row || row.event.status !== "published" || row.event.startsAt <= new Date()) {
      return { ok: false, error: "Early access is only available before a published event starts." };
    }
    const [escrow] = await db
      .select({ amountKobo: organiserEarnings.amountKobo })
      .from(organiserEarnings)
      .where(and(eq(organiserEarnings.userId, input.userId), eq(organiserEarnings.eventId, input.eventId), eq(organiserEarnings.bucket, "escrow")))
      .limit(1);
    earlyCap = earlyAccessAvailable({
      escrowKobo: escrow?.amountKobo ?? 0,
      earlyTakenKobo: await earlyTaken(input.eventId),
      level: trustLevel(row.user, await hasVenueProof(input.eventId)),
      frozen: row.user.earlyAccessFrozen,
    });
    if (earlyCap <= 0) return { ok: false, error: "No early access is available for this event right now." };
  }

  // Move the money out of the balance and record the withdrawal, atomically.
  const from = input.mode === "early" ? "escrow" : "available";
  const staged = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(organiserEarnings)
      .where(
        and(
          eq(organiserEarnings.userId, input.userId),
          eq(organiserEarnings.bucket, from),
          input.eventId ? eq(organiserEarnings.eventId, input.eventId) : undefined,
        ),
      )
      .for("update");
    const positive = rows.filter((r) => r.amountKobo > 0);
    const total = positive.reduce((sum, r) => sum + r.amountKobo, 0);
    const amount = input.mode === "early" ? Math.min(earlyCap, total) : total;

    const quote = quoteWithdrawal(amount, { enforceMinimum: input.mode === "manual" });
    if (!quote.ok) return { error: quote.reason };

    // Take from each event's row until the amount is covered.
    const allocation: { eventId: string; kobo: number }[] = [];
    let left = amount;
    for (const r of positive) {
      if (left <= 0) break;
      const take = Math.min(r.amountKobo, left);
      allocation.push({ eventId: r.eventId, kobo: take });
      left -= take;
    }
    for (const a of allocation) {
      await addEarnings(tx, input.userId, a.eventId, from, -a.kobo);
      await addEarnings(tx, input.userId, a.eventId, "withdrawn", a.kobo);
    }
    const [w] = await tx
      .insert(withdrawals)
      .values({
        userId: input.userId,
        eventId: allocation.length === 1 ? allocation[0].eventId : (input.eventId ?? null),
        amountKobo: quote.amountKobo,
        feeKobo: quote.feeKobo,
        netKobo: quote.netKobo,
        provider: provider.name,
        early: input.mode === "early",
        auto: input.mode === "auto" || input.mode === "sweep",
        status: "pending",
      })
      .returning({ id: withdrawals.id });
    return { id: w.id, quote, allocation };
  });
  if ("error" in staged) return { ok: false, error: staged.error ?? "Could not withdraw." };

  try {
    const transfer = await provider.transfer({
      accountId: account.stripeAccountId,
      netKobo: staged.quote.netKobo,
      idempotencyKey: `wd-${staged.id}`,
      description: `${BRAND.appName} payout ${staged.id.slice(0, 8)}`,
    });
    // The transfer exists once the API call returns; the transfer.created webhook confirms the same state.
    await db.update(withdrawals).set({ stripeTransferId: transfer.transferId, status: "paid" }).where(eq(withdrawals.id, staged.id));
    const { amountKobo, feeKobo, netKobo } = staged.quote;
    return { ok: true, withdrawalId: staged.id, amountKobo, feeKobo, netKobo };
  } catch (err) {
    console.error("payout transfer failed", err);
    const reason = err instanceof Error ? err.message.slice(0, 300) : "Transfer failed";
    // Put the money back exactly where it came from.
    await db.transaction(async (tx) => {
      for (const a of staged.allocation) {
        await addEarnings(tx, input.userId, a.eventId, "withdrawn", -a.kobo);
        await addEarnings(tx, input.userId, a.eventId, from, a.kobo);
      }
      await tx.update(withdrawals).set({ status: "failed", failureReason: reason }).where(eq(withdrawals.id, staged.id));
    });
    return { ok: false, error: "The payout could not be sent, so your balance was restored. Try again shortly." };
  }
}

// ---------- payout account (Connect) ----------

export async function startPayoutOnboarding(user: { id: string; displayName: string }, email?: string): Promise<string> {
  const db = getDb();
  const provider = getPayoutProvider();
  let [account] = await db.select().from(connectAccounts).where(eq(connectAccounts.userId, user.id)).limit(1);
  if (!account) {
    const accountId = await provider.createAccount({ email, displayName: user.displayName, userId: user.id });
    [account] = await db
      .insert(connectAccounts)
      .values({ userId: user.id, stripeAccountId: accountId })
      .onConflictDoUpdate({ target: connectAccounts.userId, set: { stripeAccountId: accountId } })
      .returning();
  }
  return provider.onboardingUrl(account.stripeAccountId);
}

/** Pull the latest status from the payout rail (also driven by the account.updated webhook). */
export async function syncPayoutAccount(where: { userId: string } | { accountId: string }) {
  const db = getDb();
  const [account] = await db
    .select()
    .from(connectAccounts)
    .where("userId" in where ? eq(connectAccounts.userId, where.userId) : eq(connectAccounts.stripeAccountId, where.accountId))
    .limit(1);
  if (!account) return null;
  try {
    const status = await getPayoutProvider().getStatus(account.stripeAccountId);
    const [updated] = await db
      .update(connectAccounts)
      .set({ payoutsEnabled: status.payoutsEnabled, chargesEnabled: status.detailsSubmitted, legalName: status.legalName ?? account.legalName })
      .where(eq(connectAccounts.userId, account.userId))
      .returning();
    return updated;
  } catch (err) {
    console.error("payout account sync failed", err);
    return account;
  }
}

/** Mark withdrawals paid/failed from transfer webhooks. */
export async function markTransfer(transferId: string, status: "paid" | "failed") {
  await getDb()
    .update(withdrawals)
    .set({ status })
    .where(and(eq(withdrawals.stripeTransferId, transferId), inArray(withdrawals.status, ["pending", "paid"])));
}
