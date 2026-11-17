import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** True while we are on test keys. Gates demo-only tools like "simulate event start". */
export function isStripeTestMode(): boolean {
  return /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");
}

/** Server-side Stripe client. The secret key never reaches the browser. */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set. Add your test key to .env.local.");
  client = new Stripe(key, { appInfo: { name: "Detty" }, maxNetworkRetries: 2 });
  return client;
}

/** Base URL for Stripe redirects. */
export function appUrl(): string {
  // On Vercel, fall back to the project's production domain if NEXT_PUBLIC_APP_URL was not set.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (process.env.NEXT_PUBLIC_APP_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
}
