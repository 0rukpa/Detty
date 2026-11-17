"use client";
import { Lock, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { GbeduAmount } from "@/components/GbeduAmount";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { BRAND } from "@/config/brand";
import { FEES } from "@/config/fees";
import { submitKeepingValues } from "@/lib/forms";
import { cn, formatNaira } from "@/lib/utils";
import { buyTickets, type PayState } from "../actions";
import { quoteOrder } from "../pricing";

export type PickerTier = {
  id: string;
  name: string;
  priceKobo: number;
  left: number;
  perUserLimit: number;
  /** Why this tier can't be bought right now, if it can't. */
  unavailable: string | null;
};

/**
 * Pick a tier and quantity and see the full price breakdown BEFORE going to
 * Stripe. The numbers shown here come from the same pure function the server
 * uses, but the server recomputes everything: nothing here is trusted.
 */
export function TicketPicker({ tiers, signedIn, blocked }: { tiers: PickerTier[]; signedIn: boolean; blocked: string | null }) {
  const firstOpen = tiers.find((t) => !t.unavailable);
  const [tierId, setTierId] = useState(firstOpen?.id ?? "");
  const [qty, setQty] = useState(1);
  const [state, action, pending] = useActionState<PayState, FormData>(buyTickets, {});

  const tier = tiers.find((t) => t.id === tierId);
  const max = tier ? Math.max(1, Math.min(tier.perUserLimit, tier.left)) : 1;
  const quantity = Math.min(qty, max);
  const quote = tier ? quoteOrder(tier.priceKobo, quantity) : null;

  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="space-y-4">
      <input type="hidden" name="tierId" value={tierId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div role="radiogroup" aria-label="Ticket type" className="space-y-2.5">
        {tiers.map((t) => {
          const selected = t.id === tierId;
          return (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-card border p-4 transition",
                selected ? "border-pink bg-pink/10" : "border-border bg-surface",
                t.unavailable && "cursor-not-allowed opacity-55",
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="tier-choice"
                  className="size-4 accent-pink"
                  checked={selected}
                  disabled={Boolean(t.unavailable)}
                  onChange={() => {
                    setTierId(t.id);
                    setQty(1);
                  }}
                />
                <span>
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block text-sm text-muted">
                    {t.unavailable ?? (t.left <= 20 ? `Only ${t.left} left` : `Up to ${t.perUserLimit} per person`)}
                  </span>
                </span>
              </span>
              <span className="font-display text-xl font-extrabold">{t.priceKobo === 0 ? "Free" : formatNaira(t.priceKobo)}</span>
            </label>
          );
        })}
      </div>

      {tier && quote ? (
        <>
          <div className="flex items-center justify-between rounded-card border border-border bg-surface p-4">
            <span className="font-semibold">How many?</span>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Fewer tickets" disabled={quantity <= 1} onClick={() => setQty(quantity - 1)} className="flex size-10 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40">
                <Minus className="size-4" />
              </button>
              <span aria-live="polite" className="w-6 text-center font-display text-xl font-extrabold tabular-nums">
                {quantity}
              </span>
              <button type="button" aria-label="More tickets" disabled={quantity >= max} onClick={() => setQty(quantity + 1)} className="flex size-10 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40">
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {!quote.isFree ? (
            <dl className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">
                  {tier.name} × {quantity}
                </dt>
                <dd className="font-semibold tabular-nums">{formatNaira(quote.ticketsKobo)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-muted">
                  {BRAND.appName} fee (<GbeduAmount value={FEES.ticketFeeGbd * quantity} className="text-sm" />)
                </dt>
                <dd className="font-semibold tabular-nums">{formatNaira(quote.dettyFeeKobo)}</dd>
              </div>
              {quote.processingFeeKobo > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted">Processing fee</dt>
                  <dd className="font-semibold tabular-nums">{formatNaira(quote.processingFeeKobo)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 text-base">
                <dt className="font-bold">Total</dt>
                <dd className="font-display text-xl font-extrabold tabular-nums">{formatNaira(quote.totalKobo)}</dd>
              </div>
            </dl>
          ) : null}
        </>
      ) : null}

      <FieldError message={state.error} />

      {blocked ? (
        <p className="rounded-card border border-dashed border-border p-4 text-center text-sm text-muted">{blocked}</p>
      ) : !signedIn ? (
        <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          Sign up to get tickets
        </Link>
      ) : (
        <Button type="submit" size="lg" className="w-full" disabled={pending || !tier || !quote}>
          {pending ? "Holding your tickets…" : quote?.isFree ? "Get free ticket" : `Pay ${quote ? formatNaira(quote.totalKobo) : ""}`}
        </Button>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Lock className="size-3.5" /> Paid securely with Stripe. Money is held in escrow until the event starts.
      </p>
    </form>
  );
}
