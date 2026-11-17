/**
 * Payout rails behind one interface (spec Section 7).
 *
 *  - StripeConnectPayoutProvider: real, test mode. Organisers onboard as Stripe
 *    connected accounts and withdrawals become Stripe Transfers.
 *  - MockPayoutProvider: test mode only (PAYOUT_PROVIDER=mock). Simulates a
 *    payout so the whole flow can be demoed before Connect is fully enabled.
 *  - PaystackPayoutProvider: documented placeholder for a local rail. Stripe
 *    Connect can't straightforwardly pay out to Nigerian bank accounts, so
 *    production needs a local transfer provider here.
 */
import "server-only";
import { PAYOUT_FX } from "@/config/fees";
import { appUrl, getStripe, isStripeTestMode } from "@/lib/stripe";
import { koboToSettlement } from "./pricing";

export type PayoutAccountStatus = {
  accountId: string;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  legalName: string | null;
};

export type TransferResult = { transferId: string; currency: string; amountMinor: number };

export interface PayoutProvider {
  readonly name: string;
  /** Create the organiser's payout account and return its id. */
  createAccount(input: { email?: string; displayName: string; userId: string }): Promise<string>;
  /** A hosted page where the organiser enters identity and bank details. */
  onboardingUrl(accountId: string): Promise<string>;
  /** A link to the organiser's payout dashboard, if the rail has one. */
  dashboardUrl(accountId: string): Promise<string | null>;
  getStatus(accountId: string): Promise<PayoutAccountStatus>;
  /** Send `netKobo` worth of funds. Must be idempotent on `idempotencyKey`. */
  transfer(input: { accountId: string; netKobo: number; idempotencyKey: string; description: string }): Promise<TransferResult>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Accounts v2 is new; the SDK surface is accessed loosely on purpose */
export class StripeConnectPayoutProvider implements PayoutProvider {
  readonly name = "stripe";
  private settlementCurrency: string | null = null;

  /** The platform balance is held in its home currency, and so are transfers. */
  private async currency(): Promise<string> {
    if (!this.settlementCurrency) {
      const platform = await getStripe().accounts.retrieveCurrent();
      this.settlementCurrency = (platform.default_currency ?? "usd").toLowerCase();
    }
    if (!PAYOUT_FX[this.settlementCurrency]) throw new Error(`No payout FX rate configured for ${this.settlementCurrency}`);
    return this.settlementCurrency;
  }

  async createAccount(input: { email?: string; displayName: string; userId: string }): Promise<string> {
    const stripe = getStripe();
    const platform = await stripe.accounts.retrieveCurrent();
    // Accounts v2. "recipient" = can receive transfers, which is what separate charges and transfers needs.
    // In test mode the account is created in the platform's own (Stripe-supported) country so the flow can be demoed.
    const account = await (stripe.v2.core.accounts as any).create({
      contact_email: input.email,
      display_name: input.displayName,
      dashboard: "express",
      identity: { country: (platform.country ?? "US").toLowerCase(), entity_type: "individual" },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      defaults: {
        currency: await this.currency(),
        locales: ["en-US"],
        responsibilities: { fees_collector: "application", losses_collector: "application" },
      },
      metadata: { detty_user_id: input.userId },
      include: ["configuration.recipient", "identity", "requirements"],
    });
    return account.id as string;
  }

  async onboardingUrl(accountId: string): Promise<string> {
    const link = await (getStripe().v2.core.accountLinks as any).create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: `${appUrl()}/plug/payouts?onboarding=refresh`,
          return_url: `${appUrl()}/plug/payouts?onboarding=done`,
        },
      },
    });
    return link.url as string;
  }

  async dashboardUrl(accountId: string): Promise<string | null> {
    try {
      return (await getStripe().accounts.createLoginLink(accountId)).url;
    } catch {
      return null; // not available until onboarding is complete
    }
  }

  async getStatus(accountId: string): Promise<PayoutAccountStatus> {
    const account = await (getStripe().v2.core.accounts as any).retrieve(accountId, {
      include: ["configuration.recipient", "identity", "requirements"],
    });
    const transfers = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
    const person = account.identity?.individual;
    const legalName = [person?.given_name, person?.surname].filter(Boolean).join(" ") || null;
    return {
      accountId,
      payoutsEnabled: transfers?.status === "active",
      detailsSubmitted: Boolean(person?.given_name) || transfers?.status === "active",
      legalName,
    };
  }

  async transfer(input: { accountId: string; netKobo: number; idempotencyKey: string; description: string }): Promise<TransferResult> {
    const currency = await this.currency();
    const amount = koboToSettlement(input.netKobo, currency);
    if (amount < 1) throw new Error("Amount is too small to transfer.");
    const transfer = await getStripe().transfers.create(
      { amount, currency, destination: input.accountId, description: input.description, metadata: { net_kobo: String(input.netKobo) } },
      { idempotencyKey: input.idempotencyKey },
    );
    return { transferId: transfer.id, currency, amountMinor: amount };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Test-mode stand-in: no money moves. Lets the escrow -> available -> withdrawn flow be demoed end to end. */
export class MockPayoutProvider implements PayoutProvider {
  readonly name = "mock";
  async createAccount(input: { userId: string }): Promise<string> {
    return `mock_acct_${input.userId.replace(/-/g, "").slice(0, 16)}`;
  }
  async onboardingUrl(): Promise<string> {
    return `${appUrl()}/plug/payouts?onboarding=done`;
  }
  async dashboardUrl(): Promise<string | null> {
    return null;
  }
  async getStatus(accountId: string): Promise<PayoutAccountStatus> {
    return { accountId, payoutsEnabled: true, detailsSubmitted: true, legalName: null };
  }
  async transfer(input: { netKobo: number; idempotencyKey: string }): Promise<TransferResult> {
    return { transferId: `mock_tr_${input.idempotencyKey.slice(-12)}`, currency: "ngn", amountMinor: input.netKobo };
  }
}

/**
 * TODO(production): pay Nigerian bank accounts through a local rail.
 * Paystack Transfers flow: create a transfer recipient (bank code + NUBAN,
 * name-resolved against the verified ID name), then POST /transfer with an
 * idempotent reference, and confirm on the transfer.success webhook.
 */
export class PaystackPayoutProvider implements PayoutProvider {
  readonly name = "paystack";
  private notReady(): never {
    throw new Error("The Paystack payout rail is not implemented yet. See README > Production notes.");
  }
  createAccount = async (): Promise<string> => this.notReady();
  onboardingUrl = async (): Promise<string> => this.notReady();
  dashboardUrl = async (): Promise<string | null> => this.notReady();
  getStatus = async (): Promise<PayoutAccountStatus> => this.notReady();
  transfer = async (): Promise<TransferResult> => this.notReady();
}

let provider: PayoutProvider | null = null;

export function getPayoutProvider(): PayoutProvider {
  if (provider) return provider;
  const choice = (process.env.PAYOUT_PROVIDER ?? "stripe").toLowerCase();
  if (choice === "mock") {
    // Never allow simulated payouts against live keys.
    if (!isStripeTestMode()) throw new Error("PAYOUT_PROVIDER=mock is only allowed with Stripe test keys.");
    provider = new MockPayoutProvider();
  } else if (choice === "paystack") {
    provider = new PaystackPayoutProvider();
  } else {
    provider = new StripeConnectPayoutProvider();
  }
  return provider;
}
