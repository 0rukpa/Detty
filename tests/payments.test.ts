import { describe, expect, it } from "vitest";
import { STRIPE_FEE } from "@/config/fees";
import {
  applyRelease,
  cancellationImpact,
  earlyAccessAvailable,
  formatCountdown,
  trustLevel,
} from "@/features/payments/escrow";
import {
  koboToSettlement,
  processingFeeFor,
  quoteOrder,
  quoteWithdrawal,
  stripeFeeOn,
} from "@/features/payments/pricing";
import { signTicket, verifyTicketToken } from "@/features/tickets/qr";

describe("ticket pricing", () => {
  it("charges 1 GBD (₦10) per ticket on top, and the Plug keeps the full ticket price", () => {
    const q = quoteOrder(3_500_000, 2); // 2 × ₦35,000 VIP
    expect(q.ticketsKobo).toBe(7_000_000);
    expect(q.dettyFeeKobo).toBe(2_000); // 2 × ₦10
    expect(q.totalKobo).toBe(q.ticketsKobo + q.dettyFeeKobo + q.processingFeeKobo);
    expect(q.isFree).toBe(false);
  });

  it("free tickets carry no fees at all", () => {
    expect(quoteOrder(0, 4)).toMatchObject({ totalKobo: 0, dettyFeeKobo: 0, processingFeeKobo: 0, isFree: true });
  });

  it("the processing fee always covers Stripe's cut exactly (Detty never loses its fee)", () => {
    for (const price of [1, 99, 10_000, 250_000, 500_000, 800_000, 1_234_567, 3_500_000, 100_000_000]) {
      for (const qty of [1, 2, 3, 7, 10]) {
        const q = quoteOrder(price, qty);
        const base = q.ticketsKobo + q.dettyFeeKobo;
        const net = q.totalKobo - stripeFeeOn(q.totalKobo);
        expect(net, `price ${price} × ${qty}`).toBeGreaterThanOrEqual(base);
        // ...and it is the MINIMUM such fee: one kobo less would leave us short.
        expect(q.totalKobo - 1 - stripeFeeOn(q.totalKobo - 1)).toBeLessThan(base);
      }
    }
  });

  it("only produces whole kobo", () => {
    const q = quoteOrder(333_333, 3);
    for (const v of Object.values(q)) if (typeof v === "number") expect(Number.isInteger(v)).toBe(true);
  });

  it("can absorb the Stripe fee instead when configured", () => {
    const q = quoteOrder(500_000, 1, { passStripeFeeToBuyer: false });
    expect(q.processingFeeKobo).toBe(0);
    expect(q.totalKobo).toBe(501_000);
  });

  it("rejects fractional or negative inputs", () => {
    expect(() => quoteOrder(10.5, 1)).toThrow();
    expect(() => quoteOrder(1000, 0)).toThrow();
    expect(() => quoteOrder(-1, 1)).toThrow();
    expect(() => quoteOrder(1000, 1.5)).toThrow();
  });

  it("matches a hand-worked example", () => {
    // ₦8,000 ticket: base = 800,000 + 1,000 = 801,000 kobo
    // total = ceil((801,000 + 50,000) / 0.956) = 890,168 ; Stripe keeps ceil(890,168 × 4.4%) + 50,000 = 89,168
    expect(processingFeeFor(801_000)).toBe(89_168);
    expect(stripeFeeOn(890_168)).toBe(Math.ceil((890_168 * STRIPE_FEE.percentBps) / 10_000) + STRIPE_FEE.fixedKobo);
  });
});

describe("withdrawals", () => {
  it("takes a flat ₦100 fee", () => {
    expect(quoteWithdrawal(5_000_000, { enforceMinimum: true })).toEqual({
      ok: true,
      amountKobo: 5_000_000,
      feeKobo: 10_000,
      netKobo: 4_990_000, // "You'll receive ₦49,900 after the ₦100 fee"
    });
  });
  it("enforces the ₦10,000 minimum for manual withdrawals only", () => {
    expect(quoteWithdrawal(999_999, { enforceMinimum: true }).ok).toBe(false);
    expect(quoteWithdrawal(1_000_000, { enforceMinimum: true }).ok).toBe(true);
    // Auto payouts and the small-balance sweep ignore the minimum so nothing is ever stuck.
    expect(quoteWithdrawal(250_000, { enforceMinimum: false })).toMatchObject({ ok: true, netKobo: 240_000 });
  });
  it("never pays out a balance smaller than the fee", () => {
    expect(quoteWithdrawal(10_000, { enforceMinimum: false }).ok).toBe(false);
    expect(quoteWithdrawal(0, { enforceMinimum: false }).ok).toBe(false);
  });
  it("converts to the settlement currency rounding down", () => {
    expect(koboToSettlement(4_990_000, "usd")).toBe(3_118); // $31.18 at ₦1,600
    expect(koboToSettlement(4_990_000, "ngn")).toBe(4_990_000);
    expect(() => koboToSettlement(100, "jpy")).toThrow();
  });
});

describe("escrow and early access", () => {
  it("maps trust levels", () => {
    expect(trustLevel({ certifiedPlug: true, plugStatus: "verified" }, false)).toBe("certified_plug");
    expect(trustLevel({ certifiedPlug: false, plugStatus: "verified" }, true)).toBe("plug_with_venue_proof");
    expect(trustLevel({ certifiedPlug: false, plugStatus: "verified" }, false)).toBe("plug");
    expect(trustLevel({ certifiedPlug: false, plugStatus: "pending" }, true)).toBe("plug");
  });

  it("lets Certified Plugs take 50% before the event, others 25% or nothing", () => {
    const base = { escrowKobo: 24_000_000, earlyTakenKobo: 0, frozen: false };
    expect(earlyAccessAvailable({ ...base, level: "certified_plug" })).toBe(12_000_000); // ₦120k now, ₦120k later
    expect(earlyAccessAvailable({ ...base, level: "plug_with_venue_proof" })).toBe(6_000_000);
    expect(earlyAccessAvailable({ ...base, level: "plug" })).toBe(0);
  });

  it("counts what was already taken, and grows with new sales", () => {
    // Took ₦120k early from ₦240k of sales; nothing more until sales grow.
    expect(earlyAccessAvailable({ escrowKobo: 12_000_000, earlyTakenKobo: 12_000_000, level: "certified_plug", frozen: false })).toBe(0);
    // Another ₦100k sells: gross ₦340k, cap ₦170k, ₦50k more unlocks.
    expect(earlyAccessAvailable({ escrowKobo: 22_000_000, earlyTakenKobo: 12_000_000, level: "certified_plug", frozen: false })).toBe(5_000_000);
  });

  it("is frozen while a debt is outstanding", () => {
    expect(earlyAccessAvailable({ escrowKobo: 24_000_000, earlyTakenKobo: 0, level: "certified_plug", frozen: true })).toBe(0);
  });

  it("recovers debt from the next release before paying the Plug", () => {
    expect(applyRelease(10_000_000, 0)).toEqual({ toAvailable: 10_000_000, debtRepaid: 0, debtLeft: 0 });
    expect(applyRelease(10_000_000, 4_000_000)).toEqual({ toAvailable: 6_000_000, debtRepaid: 4_000_000, debtLeft: 0 });
    expect(applyRelease(3_000_000, 4_000_000)).toEqual({ toAvailable: 0, debtRepaid: 3_000_000, debtLeft: 1_000_000 });
  });

  it("turns early access into a debt when the event is cancelled", () => {
    expect(cancellationImpact(12_000_000)).toEqual({ newDebtKobo: 12_000_000, freezeEarlyAccess: true });
    expect(cancellationImpact(0)).toEqual({ newDebtKobo: 0, freezeEarlyAccess: false });
  });

  it("formats the unlock countdown", () => {
    const now = new Date("2026-12-18T17:00:00Z");
    expect(formatCountdown(new Date("2026-12-20T21:00:00Z"), now)).toBe("2d 4h");
    expect(formatCountdown(new Date("2026-12-18T20:12:00Z"), now)).toBe("3h 12m");
    expect(formatCountdown(new Date("2026-12-18T17:45:00Z"), now)).toBe("45m");
    expect(formatCountdown(new Date("2026-12-18T16:00:00Z"), now)).toBe("now");
  });
});

describe("signed ticket QR tokens", () => {
  const key = "test-secret";
  const id = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

  it("round-trips an authentic token", () => {
    const token = signTicket(id, key);
    expect(token.startsWith(`${id}.`)).toBe(true);
    expect(verifyTicketToken(token, key)).toBe(id);
    expect(verifyTicketToken(`  ${token}\n`, key)).toBe(id);
  });

  it("rejects forged, edited or malformed tokens", () => {
    const token = signTicket(id, key);
    const otherId = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6c";
    expect(verifyTicketToken(id, key)).toBeNull(); // a bare id is not a ticket
    expect(verifyTicketToken(`${otherId}.${token.split(".")[1]}`, key)).toBeNull(); // signature from another ticket
    expect(verifyTicketToken(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, key)).toBeNull();
    expect(verifyTicketToken(token, "another-secret")).toBeNull();
    expect(verifyTicketToken("", key)).toBeNull();
    expect(verifyTicketToken("not-a-uuid.abcdefghijklmnopqrstuv", key)).toBeNull();
    expect(verifyTicketToken(`${token}.extra`, key)).toBeNull();
    expect(() => signTicket("123", key)).toThrow();
  });
});
