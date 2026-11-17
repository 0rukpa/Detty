/**
 * Ticket pricing (spec 7.1). Pure integer maths in kobo: no floats, ever.
 *
 * The buyer pays:  tickets + Detty fee + processing fee
 * The Plug earns:  tickets (price × qty), nothing deducted
 * Detty earns:     the Detty fee (1 GBD-equivalent per ticket), net of Stripe
 */
import { FEES, gbdToKobo, PAYOUT_FX, STRIPE_FEE } from "@/config/fees";

export type OrderQuote = {
  quantity: number;
  unitPriceKobo: number;
  ticketsKobo: number; // organiser_net_kobo
  dettyFeeKobo: number; // fee_kobo
  processingFeeKobo: number; // processing_fee_kobo
  totalKobo: number; // amount_kobo charged to the buyer
  isFree: boolean;
};

const BPS = 10_000;

/** What Stripe keeps from a charge of `totalKobo`, rounded up (never under-estimate a cost). */
export function stripeFeeOn(totalKobo: number, fee = STRIPE_FEE): number {
  if (totalKobo <= 0) return 0;
  return Math.ceil((totalKobo * fee.percentBps) / BPS) + fee.fixedKobo;
}

/**
 * The smallest processing fee such that, after Stripe takes its cut of the
 * TOTAL (the fee is charged on the fee too), the platform still nets at least
 * tickets + Detty fee. Solves  total − stripeFee(total) ≥ base  for total.
 */
export function processingFeeFor(baseKobo: number, fee = STRIPE_FEE): number {
  if (baseKobo <= 0) return 0;
  let total = Math.ceil(((baseKobo + fee.fixedKobo) * BPS) / (BPS - fee.percentBps));
  // Integer rounding can leave us a kobo short or long; settle on the exact minimum.
  while (total - stripeFeeOn(total, fee) < baseKobo) total += 1;
  while (total - 1 - stripeFeeOn(total - 1, fee) >= baseKobo) total -= 1;
  return total - baseKobo;
}

export function quoteOrder(
  unitPriceKobo: number,
  quantity: number,
  opts: { passStripeFeeToBuyer?: boolean } = {},
): OrderQuote {
  if (!Number.isInteger(unitPriceKobo) || unitPriceKobo < 0) throw new Error("Price must be a whole number of kobo");
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be a positive whole number");

  const ticketsKobo = unitPriceKobo * quantity;
  // Free tickets carry no fees at all and never touch Stripe.
  if (ticketsKobo === 0) {
    return { quantity, unitPriceKobo, ticketsKobo: 0, dettyFeeKobo: 0, processingFeeKobo: 0, totalKobo: 0, isFree: true };
  }

  const dettyFeeKobo = gbdToKobo(FEES.ticketFeeGbd) * quantity;
  const base = ticketsKobo + dettyFeeKobo;
  const pass = opts.passStripeFeeToBuyer ?? FEES.passStripeFeeToBuyer;
  const processingFeeKobo = pass ? processingFeeFor(base) : 0;
  return {
    quantity,
    unitPriceKobo,
    ticketsKobo,
    dettyFeeKobo,
    processingFeeKobo,
    totalKobo: base + processingFeeKobo,
    isFree: false,
  };
}

// ---------- withdrawals ----------

export type WithdrawalQuote =
  | { ok: true; amountKobo: number; feeKobo: number; netKobo: number }
  | { ok: false; reason: string };

/** Flat 10 GBD-equivalent (₦100) fee per withdrawal, shown before confirming. */
export function quoteWithdrawal(amountKobo: number, opts: { enforceMinimum: boolean }): WithdrawalQuote {
  const feeKobo = gbdToKobo(FEES.withdrawalFeeGbd);
  const minKobo = gbdToKobo(FEES.minWithdrawalGbd);
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) return { ok: false, reason: "Nothing to withdraw yet." };
  if (opts.enforceMinimum && amountKobo < minKobo) {
    return { ok: false, reason: `The minimum withdrawal is ₦${(minKobo / 100).toLocaleString("en-NG")}.` };
  }
  if (amountKobo <= feeKobo) return { ok: false, reason: "The balance is smaller than the withdrawal fee." };
  return { ok: true, amountKobo, feeKobo, netKobo: amountKobo - feeKobo };
}

/** Convert kobo to the platform's settlement currency (minor units), rounding DOWN so we never overpay. */
export function koboToSettlement(kobo: number, currency: string): number {
  const fx = PAYOUT_FX[currency.toLowerCase()];
  if (!fx) throw new Error(`No payout FX rate configured for ${currency}`);
  return Math.floor(kobo / fx.koboPerMinorUnit);
}
