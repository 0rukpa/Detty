import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runEscrowJobs } from "@/features/payments/jobs";

/**
 * Scheduled job (see vercel.json): releases expired checkout holds, flips
 * events live/ended, releases escrow at event start, sends auto payouts and
 * sweeps small balances. Vercel Cron calls this with
 * "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const report = await runEscrowJobs();
  return NextResponse.json({ ok: true, ...report });
}
