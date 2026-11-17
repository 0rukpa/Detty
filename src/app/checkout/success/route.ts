import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/features/auth/session";
import { handlePaidSession } from "@/features/payments/checkout";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/**
 * Where Stripe sends the buyer after paying. We do NOT trust this redirect:
 * the session is fetched again from Stripe with our secret key, and only a
 * session Stripe itself reports as paid is fulfilled (same idempotent code path
 * as the webhook). Then: straight to The Lounge, with confetti.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.redirect(`${origin}/login`);
  if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId) || !isStripeConfigured()) {
    return NextResponse.redirect(`${origin}/tickets`);
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    // A session can only be claimed by the account that started it.
    if (session.metadata?.user_id !== profile.id) return NextResponse.redirect(`${origin}/tickets`);
    const outcome = await handlePaidSession(session);
    if (outcome.status === "fulfilled" || outcome.status === "already_paid") {
      return NextResponse.redirect(`${origin}/lounge/${outcome.eventId}?welcome=1`);
    }
    if (outcome.status === "refunded_oversold") return NextResponse.redirect(`${origin}/tickets?notice=refunded`);
  } catch (err) {
    console.error("checkout success handling failed", err);
  }
  // Not confirmed yet: the webhook will finish the job; the wallet shows the ticket once it lands.
  return NextResponse.redirect(`${origin}/tickets?notice=processing`);
}
