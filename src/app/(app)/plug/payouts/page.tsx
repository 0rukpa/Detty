import { Clock, Lock, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardSkeletons, PageHeader } from "@/components/EmptyState";
import { FEES, gbdToKobo } from "@/config/fees";
import { requireProfile } from "@/features/auth/session";
import { StatusPill } from "@/features/events/components/EventAdmin";
import { PayoutAccountCard, PayoutModeForm, WithdrawForm } from "@/features/payments/components/PayoutControls";
import { formatCountdown } from "@/features/payments/escrow";
import { getPayoutDashboard } from "@/features/payments/queries";
import { syncPayoutAccount } from "@/features/payments/withdrawals";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Earnings" };

const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
const WD_TONE = { paid: "text-lime", pending: "text-amber", failed: "text-danger" } as const;

async function Earnings({ searchParams }: Pick<PageProps<"/plug/payouts">, "searchParams">) {
  const [profile, query] = await Promise.all([requireProfile(), searchParams]);
  if (!profile.isPlug) redirect("/profile");
  // Coming back from Stripe onboarding: pull the fresh account status (the account.updated webhook does the same).
  if (query.onboarding) await syncPayoutAccount({ userId: profile.id });

  const d = await getPayoutDashboard(profile.id);
  const feeKobo = gbdToKobo(FEES.withdrawalFeeGbd);
  const minKobo = gbdToKobo(FEES.minWithdrawalGbd);
  const ready = Boolean(d.account?.payoutsEnabled);
  const cannotWithdraw = d.blockReason ?? (!ready ? "Set up your payout account to withdraw." : null);
  const now = new Date();

  return (
    <div className="space-y-5">
      {/* "Organisers must never feel their money is stuck": always say exactly when it unlocks. */}
      {d.nextUnlock ? (
        <section className="rounded-card bg-gradient-to-br from-purple to-pink p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <Clock className="size-4" /> Next unlock
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold leading-tight">
            Your {formatNaira(d.nextUnlock.kobo)} unlocks {d.nextUnlock.at <= now ? "any minute now" : `in ${formatCountdown(d.nextUnlock.at, now)}`}
          </p>
          <p className="mt-1 text-sm text-white/90">
            When {d.nextUnlock.title} starts ({dateFmt.format(d.nextUnlock.at)}).
          </p>
        </section>
      ) : null}

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "In escrow", kobo: d.totals.escrowKobo, icon: Lock, hint: "Events not started" },
          { label: "Available", kobo: d.totals.availableKobo, icon: Wallet, hint: "Ready to withdraw" },
          { label: "Withdrawn", kobo: d.totals.withdrawnKobo, icon: Clock, hint: "Paid out so far" },
        ].map(({ label, kobo, icon: Icon, hint }) => (
          <div key={label} className="rounded-card border border-border bg-surface p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Icon className="size-3.5" /> {label}
            </p>
            <p className="mt-1 font-display text-xl font-extrabold tabular-nums sm:text-2xl">{formatNaira(kobo)}</p>
            <p className="mt-0.5 hidden text-xs text-muted sm:block">{hint}</p>
          </div>
        ))}
      </section>

      {d.blockReason ? <p className="rounded-2xl bg-amber/15 p-3 text-sm font-semibold text-amber">{d.blockReason}</p> : null}
      {d.debtKobo > 0 ? (
        <p className="rounded-2xl bg-danger/15 p-3 text-sm text-danger">
          {formatNaira(d.debtKobo)} of early access from a cancelled event will be recovered from your next earnings. Early access is paused until then.
        </p>
      ) : null}

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-extrabold">Withdraw</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          <span className="font-semibold text-foreground">{formatNaira(d.totals.availableKobo)} available now</span>
          {d.totals.escrowKobo > 0 ? ` · ${formatNaira(d.totals.escrowKobo)} unlocks when your events start` : ""}
        </p>
        <WithdrawForm amountKobo={d.totals.availableKobo} feeKobo={feeKobo} minKobo={minKobo} disabledReason={cannotWithdraw} />
      </section>

      <PayoutAccountCard connected={Boolean(d.account)} ready={ready} legalName={d.account?.legalName ?? null} />
      <PayoutModeForm mode={profile.payoutMode} />

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">By event</h2>
        {d.events.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-5 text-sm text-muted">Your sales will show here once tickets start selling.</p>
        ) : (
          <ul className="space-y-3">
            {d.events.map((e) => (
              <li key={e.eventId} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/plug/events/${e.eventId}`} className="block truncate font-semibold underline">
                      {e.title}
                    </Link>
                    <p className="text-sm text-muted">
                      {dateFmt.format(e.startsAt)} · {e.ticketsSold} sold · {e.checkedIn} checked in
                    </p>
                  </div>
                  <StatusPill status={e.status} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">In escrow</dt>
                    <dd className="font-bold tabular-nums">{formatNaira(e.escrowKobo)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Available</dt>
                    <dd className="font-bold tabular-nums">{formatNaira(e.availableKobo)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Withdrawn</dt>
                    <dd className="font-bold tabular-nums">{formatNaira(e.withdrawnKobo)}</dd>
                  </div>
                </dl>
                {e.escrowKobo > 0 && e.status === "published" && e.unlocksAt > now ? (
                  <p className="mt-2 text-xs text-muted">Unlocks in {formatCountdown(e.unlocksAt, now)}.</p>
                ) : null}
                {e.earlyAvailableKobo > 0 ? (
                  <div className="mt-3 rounded-2xl bg-surface-2 p-3">
                    <p className="mb-2 text-sm">
                      <span className="font-bold">{formatNaira(e.earlyAvailableKobo)} available now</span>
                      <span className="text-muted"> · {formatNaira(e.escrowKobo - e.earlyAvailableKobo)} unlocks when your party starts</span>
                    </p>
                    <WithdrawForm
                      amountKobo={e.earlyAvailableKobo}
                      feeKobo={feeKobo}
                      minKobo={minKobo}
                      eventId={e.eventId}
                      early
                      disabledReason={cannotWithdraw}
                      label="Take early access"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">Payout history</h2>
        {d.withdrawals.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-5 text-sm text-muted">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {d.withdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold tabular-nums">{formatNaira(w.netKobo)}</p>
                  <p className="text-muted">
                    {dateFmt.format(w.createdAt)} · {w.early ? "Early access" : w.auto ? "Auto payout" : "Withdrawal"} · fee {formatNaira(w.feeKobo)}
                    {w.provider === "mock" ? " · simulated" : ""}
                  </p>
                </div>
                <span className={`font-bold capitalize ${WD_TONE[w.status]}`}>{w.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function PayoutsPage({ searchParams }: PageProps<"/plug/payouts">) {
  return (
    <>
      <PageHeader title="Earnings" subtitle="Ticket money is held safely until your event starts." />
      <Suspense fallback={<CardSkeletons />}>
        <Earnings searchParams={searchParams} />
      </Suspense>
    </>
  );
}
