/**
 * Escrow and early-access rules (spec 6.6 and 7.4). Pure functions, unit tested.
 *
 * Earnings sit in three buckets per event: escrow -> available -> withdrawn.
 * Money only moves between them in src/features/payments/ledger.ts.
 */
import { APP_CONFIG } from "@/config/app";
import { FEES } from "@/config/fees";

export type TrustLevel = keyof typeof FEES.earlyAccessPercent;

export function trustLevel(plug: { certifiedPlug: boolean; plugStatus: string }, hasVenueProof: boolean): TrustLevel {
  if (plug.certifiedPlug) return "certified_plug";
  if (plug.plugStatus === "verified" && hasVenueProof) return "plug_with_venue_proof";
  return "plug";
}

/** When an event's escrow unlocks. */
export function releaseAt(event: { startsAt: Date; endsAt: Date }): Date {
  return APP_CONFIG.ESCROW_RELEASE === "event_start"
    ? event.startsAt
    : new Date(event.endsAt.getTime() + 24 * 3_600_000);
}

/**
 * How much of an event's sales can be withdrawn BEFORE it starts.
 *   cap   = percent × gross sales so far (escrow still held + what was already taken early)
 *   avail = cap − already taken early, never more than what is still in escrow
 * The rest stays in escrow so buyers can still be refunded.
 */
export function earlyAccessAvailable(input: {
  escrowKobo: number;
  earlyTakenKobo: number;
  level: TrustLevel;
  frozen: boolean;
}): number {
  if (input.frozen) return 0;
  const percent = FEES.earlyAccessPercent[input.level];
  if (percent <= 0) return 0;
  const gross = input.escrowKobo + input.earlyTakenKobo;
  const cap = Math.floor((gross * percent) / 100);
  return Math.max(0, Math.min(cap - input.earlyTakenKobo, input.escrowKobo));
}

/**
 * Releasing escrow when an event starts. If the Plug owes money from an earlier
 * cancelled event (early access they already spent), it is recovered first.
 */
export function applyRelease(escrowKobo: number, debtKobo: number): { toAvailable: number; debtRepaid: number; debtLeft: number } {
  const debtRepaid = Math.min(Math.max(debtKobo, 0), Math.max(escrowKobo, 0));
  return { toAvailable: escrowKobo - debtRepaid, debtRepaid, debtLeft: debtKobo - debtRepaid };
}

/**
 * Cancelling an event (spec 7.4 rule 4): every buyer is refunded in full. The
 * escrowed part covers refunds first; whatever the Plug already took as early
 * access becomes a debt recovered from future earnings, and early access freezes.
 */
export function cancellationImpact(earlyTakenKobo: number): { newDebtKobo: number; freezeEarlyAccess: boolean } {
  return { newDebtKobo: Math.max(earlyTakenKobo, 0), freezeEarlyAccess: earlyTakenKobo > 0 };
}

/** "2d 4h", "3h 12m", "45m", "now": for the dashboard countdown. */
export function formatCountdown(to: Date, now: Date = new Date()): string {
  const mins = Math.floor((to.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return "now";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
