import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/features/auth/session";
import { abandonCheckout } from "@/features/payments/checkout";

/** The buyer backed out of Stripe Checkout: release their held tickets now and return them to the event. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const profile = await getCurrentProfile();
  const orderId = request.nextUrl.searchParams.get("order_id") ?? "";
  if (!profile) return NextResponse.redirect(`${origin}/login`);
  const slug = await abandonCheckout(orderId, profile.id);
  return NextResponse.redirect(slug ? `${origin}/e/${slug}?payment=cancelled` : `${origin}/`);
}
