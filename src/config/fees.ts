import { BRAND } from "./brand";

/** All fees are priced in GBD-equivalents but charged in naira. */
export const FEES = {
  ticketFeeGbd: 1, // 1 GBD (₦10) per ticket, paid by the buyer on top of the ticket price
  withdrawalFeeGbd: 10, // 10 GBD (₦100) flat fee per organiser withdrawal
  minWithdrawalGbd: 1000, // manual withdrawals allowed from ₦10,000 upward
  defaultPayoutMode: "auto_at_start" as "auto_at_start" | "manual",
  sweepSmallBalancesAfterHours: 24, // sub-minimum balances auto-pay this long after the event ends
  // share of sales withdrawable BEFORE the event starts
  earlyAccessPercent: { certified_plug: 50, plug_with_venue_proof: 25, plug: 0 },
  passStripeFeeToBuyer: true, // buyer also covers Stripe's processing fee
} as const;

/** Money is always an integer number of kobo. 1 naira = 100 kobo. */
export const KOBO_PER_NAIRA = 100;

/** Convert a GBD amount to kobo (1 GBD = ₦10 = 1,000 kobo by default). */
export function gbdToKobo(gbd: number): number {
  return gbd * BRAND.currency.nairaPerUnit * KOBO_PER_NAIRA;
}

/**
 * Stripe's own processing cost, used to compute the "Processing fee" line when
 * `passStripeFeeToBuyer` is on. ESTIMATE for a US platform account charging
 * Nigerian cards in NGN: 2.9% + 1.5% international, plus a fixed fee of about
 * $0.30. Tune these to your real Stripe pricing before going live.
 */
export const STRIPE_FEE = {
  percentBps: 440, // 4.40%, in basis points so the maths stays in integers
  fixedKobo: 50_000, // ~$0.30 at the demo rate below
} as const;

/**
 * The platform's Stripe balance settles in its home currency (USD for a US
 * account), so transfers to organisers are made in that currency. Demo FX
 * rates: kobo per 1 minor unit (cent / penny) of the settlement currency.
 */
export const PAYOUT_FX: Record<string, { koboPerMinorUnit: number }> = {
  ngn: { koboPerMinorUnit: 1 },
  usd: { koboPerMinorUnit: 1_600 }, // ₦1,600 per $1
  gbp: { koboPerMinorUnit: 2_050 },
  eur: { koboPerMinorUnit: 1_750 },
};
