import { CheckCircle2, MessageCircle, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Suspense } from "react";
import { EmptyState, PageHeader } from "@/components/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { requireProfile } from "@/features/auth/session";
import { eventDateFmt } from "@/features/events/components/EventCard";
import { reconcilePendingOrders } from "@/features/payments/checkout";
import { listMyTickets, type WalletTicket } from "@/features/payments/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tickets" };

const NOTICES: Record<string, string> = {
  processing: "Your payment is being confirmed. Your ticket will appear here in a moment; refresh if it doesn't.",
  refunded: "Those tickets sold out while you were paying, so we refunded you in full.",
};

async function TicketCard({ ticket }: { ticket: WalletTicket }) {
  const live = ticket.status === "valid" && ticket.eventStatus !== "cancelled";
  // The QR holds the signed token, rendered on the server as an SVG.
  const qr = await QRCode.toString(ticket.qrToken, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#08070b", light: "#ffffff" } });

  return (
    <li className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-lime">{eventDateFmt.format(ticket.startsAt)}</p>
          <h2 className="truncate font-display text-xl font-extrabold">{ticket.eventTitle}</h2>
          <p className="truncate text-sm text-muted">
            {ticket.venueName}, {ticket.city}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-bold">{ticket.tierName}</span>
      </div>

      <div className="relative border-t border-dashed border-border p-5">
        <div
          role="img"
          aria-label={`QR code for your ${ticket.tierName} ticket to ${ticket.eventTitle}`}
          className={cn("mx-auto w-56 overflow-hidden rounded-2xl bg-white p-2 [&>svg]:block [&>svg]:size-full", !live && "opacity-25")}
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        {!live ? (
          <p className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm font-bold">
              {ticket.status === "used" ? (
                <>
                  <CheckCircle2 className="size-4 text-lime" /> Checked in
                </>
              ) : ticket.status === "refunded" ? (
                "Refunded"
              ) : (
                "Event cancelled"
              )}
            </span>
          </p>
        ) : null}
        <p className="mt-3 text-center font-mono text-xs text-muted">#{ticket.id.slice(0, 8).toUpperCase()}</p>
      </div>

      {ticket.status !== "refunded" && ticket.eventStatus !== "cancelled" ? (
        <div className="flex gap-2 border-t border-border p-3">
          <Link href={`/lounge/${ticket.eventId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}>
            <MessageCircle className="size-4" /> {BRAND.eventChat}
          </Link>
          <Link href={`/e/${ticket.eventSlug}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1")}>
            Event details
          </Link>
        </div>
      ) : null}
    </li>
  );
}

async function Wallet({ searchParams }: Pick<PageProps<"/tickets">, "searchParams">) {
  const [profile, query] = await Promise.all([requireProfile(), searchParams]);
  // If a payment went through but the buyer never made it back from Stripe, pick it up now.
  await reconcilePendingOrders({ userId: profile.id, limit: 5 });
  const tickets = await listMyTickets(profile.id);
  const notice = typeof query.notice === "string" ? NOTICES[query.notice] : undefined;

  return (
    <>
      {notice ? (
        <p role="status" className="mb-4 rounded-2xl bg-amber/15 p-3 text-sm font-semibold text-amber">
          {notice}
        </p>
      ) : null}
      {tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No tickets yet"
          body="When you buy a ticket, its QR code lives here."
          action={
            <Link href="/" className={buttonVariants({ variant: "lime" })}>
              Find a party
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} />
          ))}
        </ul>
      )}
    </>
  );
}

export default function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  return (
    <>
      <PageHeader title="Tickets" subtitle="Show the QR code at the door." />
      <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
        <Wallet searchParams={searchParams} />
      </Suspense>
    </>
  );
}
