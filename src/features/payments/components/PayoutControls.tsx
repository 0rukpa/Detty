"use client";
import { Ban, FastForward, Landmark, ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { cn, formatNaira } from "@/lib/utils";
import { cancelEvent, openPayoutDashboard, setPayoutMode, setUpPayouts, simulateEventStart, withdraw, type PayState } from "../actions";

function Result({ state }: { state: PayState }) {
  return (
    <>
      <FieldError message={state.error} />
      {state.ok ? <p role="status" className="mt-2 text-sm font-semibold text-lime">{state.ok}</p> : null}
    </>
  );
}

/** Runs a no-argument server action and shows its result. */
function useRun(action: () => Promise<PayState>) {
  const router = useRouter();
  const [state, setState] = useState<PayState>({});
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      setState(await action());
      router.refresh();
    });
  return { state, pending, run };
}

export function PayoutAccountCard({ connected, ready, legalName }: { connected: boolean; ready: boolean; legalName: string | null }) {
  const setup = useRun(setUpPayouts);
  const dashboard = useRun(openPayoutDashboard);
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
        <Landmark className="size-5 text-pink" /> Payout account
      </h2>
      <p className="mt-1 text-sm text-muted">
        {ready
          ? `Connected${legalName ? ` as ${legalName}` : ""}. Payouts go to your bank through Stripe.`
          : connected
            ? "Almost there. Finish the Stripe form to start receiving payouts."
            : "Connect a bank account with Stripe to receive your ticket money."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!ready ? (
          <Button variant="lime" disabled={setup.pending} onClick={setup.run}>
            {setup.pending ? "Opening Stripe…" : connected ? "Continue setup" : "Set up payouts"}
          </Button>
        ) : (
          <Button variant="outline" disabled={dashboard.pending} onClick={dashboard.run}>
            {dashboard.pending ? "Opening…" : "Manage payouts"}
          </Button>
        )}
      </div>
      <Result state={setup.state.error || setup.state.ok ? setup.state : dashboard.state} />
    </section>
  );
}

export function PayoutModeForm({ mode }: { mode: "auto_at_start" | "manual" }) {
  const [state, action, pending] = useActionState(setPayoutMode, {});
  const [value, setValue] = useState(mode);
  const options = [
    { id: "auto_at_start", title: "Auto payout", body: "Sent the moment each event starts. No button to press." },
    { id: "manual", title: "Manual", body: "Stays in Available until you withdraw (from ₦10,000)." },
  ] as const;
  return (
    <form action={action} className="rounded-card border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-extrabold">Payout mode</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className={cn("cursor-pointer rounded-2xl border p-3", value === o.id ? "border-pink bg-pink/10" : "border-border")}>
            <input type="radio" name="mode" value={o.id} checked={value === o.id} onChange={() => setValue(o.id)} className="sr-only" />
            <span className="block font-semibold">{o.title}</span>
            <span className="block text-sm text-muted">{o.body}</span>
          </label>
        ))}
      </div>
      <Button type="submit" variant="outline" size="sm" className="mt-3" disabled={pending || value === mode}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Withdraw with the fee shown BEFORE confirming (spec 7.4). */
export function WithdrawForm({
  amountKobo,
  feeKobo,
  minKobo,
  eventId,
  early = false,
  disabledReason,
  label,
}: {
  amountKobo: number;
  feeKobo: number;
  minKobo: number;
  eventId?: string;
  early?: boolean;
  disabledReason?: string | null;
  label?: string;
}) {
  const [state, action, pending] = useActionState(withdraw, {});
  const tooSmall = !early && amountKobo < minKobo;
  const reason = disabledReason ?? (amountKobo <= feeKobo ? "Nothing to withdraw yet." : tooSmall ? `Manual withdrawals start at ${formatNaira(minKobo)}. Smaller balances are paid automatically 24 hours after the event ends.` : null);
  return (
    <form action={action}>
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
      {early ? <input type="hidden" name="early" value="1" /> : null}
      {!reason ? (
        <p className="mb-2 text-sm text-muted">
          You&apos;ll receive <span className="font-bold text-foreground">{formatNaira(amountKobo - feeKobo)}</span> after the {formatNaira(feeKobo)} fee.
        </p>
      ) : (
        <p className="mb-2 text-sm text-muted">{reason}</p>
      )}
      <Button type="submit" variant={early ? "outline" : "lime"} size={early ? "sm" : "md"} disabled={pending || Boolean(reason)}>
        {pending ? "Sending…" : (label ?? `Withdraw ${formatNaira(amountKobo)}`)}
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Lead Plug tools on the event editor: check-in, test-mode fast-forward, cancel with refunds. */
export function EventMoneyTools({
  eventId,
  status,
  testMode,
  ticketsSold,
}: {
  eventId: string;
  status: string;
  testMode: boolean;
  ticketsSold: number;
}) {
  const start = useRun(() => simulateEventStart(eventId));
  const cancel = useRun(() => cancelEvent(eventId));
  const [confirming, setConfirming] = useState(false);
  const canCancel = status === "draft" || status === "published";

  return (
    <section className="rounded-card border border-border bg-surface/50 p-4">
      <h2 className="mb-3 font-display text-xl font-extrabold">Door and money</h2>
      <div className="flex flex-wrap gap-2">
        <Link href={`/plug/events/${eventId}/checkin`} className={buttonVariants({ variant: "outline" })}>
          <ScanLine className="size-4" /> Check-in scanner
        </Link>
        <Link href="/plug/payouts" className={buttonVariants({ variant: "outline" })}>
          <Landmark className="size-4" /> Earnings
        </Link>
        {testMode && status === "published" ? (
          <Button variant="outline" disabled={start.pending} onClick={start.run} title="Stripe test mode only">
            <FastForward className="size-4" /> {start.pending ? "Starting…" : "Simulate event start"}
          </Button>
        ) : null}
        {canCancel ? (
          confirming ? (
            <>
              <Button variant="danger" disabled={cancel.pending} onClick={cancel.run}>
                <Ban className="size-4" /> {cancel.pending ? "Cancelling…" : ticketsSold > 0 ? `Yes, cancel and refund ${ticketsSold} ticket${ticketsSold === 1 ? "" : "s"}` : "Yes, cancel event"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep event
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              <Ban className="size-4" /> Cancel event
            </Button>
          )
        ) : null}
      </div>
      {testMode && status === "published" ? (
        <p className="mt-2 text-xs text-muted">Test mode: &quot;Simulate event start&quot; moves the start time to now so escrow releases for the demo.</p>
      ) : null}
      {confirming ? <p className="mt-2 text-sm text-amber">Cancelling cannot be undone. Every buyer is refunded in full.</p> : null}
      <Result state={cancel.state.error || cancel.state.ok ? cancel.state : start.state} />
    </section>
  );
}
