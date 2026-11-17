import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/EmptyState";
import { requireProfile } from "@/features/auth/session";
import { getCollaboration, getEventForEdit } from "@/features/events/queries";
import { canEditDetails, eventAccess } from "@/features/events/rules";
import { listAttendees } from "@/features/payments/queries";
import { CheckinScanner } from "@/features/tickets/components/CheckinScanner";

export const metadata: Metadata = { title: "Check-in" };

const timeFmt = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

async function Door({ params }: Pick<PageProps<"/plug/events/[id]/checkin">, "params">) {
  const [{ id }, profile] = await Promise.all([params, requireProfile()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getEventForEdit(id);
  if (!detail) notFound();
  const collab = detail.event.ownerId === profile.id ? null : await getCollaboration(id, profile.id);
  if (!canEditDetails(eventAccess(profile.id, detail.event.ownerId, collab))) notFound();

  const attendees = await listAttendees(id);
  const checkedIn = attendees.filter((a) => a.status === "used").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/plug/events/${id}`} className="text-sm text-muted underline">
          Back to {detail.event.title}
        </Link>
        <p className="mt-2 font-display text-2xl font-extrabold">
          {checkedIn} / {attendees.length} <span className="text-base font-semibold text-muted">checked in</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={attendees.length} aria-valuenow={checkedIn}>
          <div className="h-full rounded-full bg-lime" style={{ width: `${attendees.length ? (checkedIn / attendees.length) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="mx-auto max-w-sm">
        <CheckinScanner eventId={id} />
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">Guest list</h2>
        {attendees.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-5 text-sm text-muted">No tickets sold yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {attendees.map((a) => (
              <li key={a.ticketId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.displayName}</span>
                  <span className="block truncate text-muted">
                    @{a.handle} · {a.tier}
                  </span>
                </span>
                {a.status === "used" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-lime">
                    <CheckCircle2 className="size-4" /> {a.checkedInAt ? timeFmt.format(a.checkedInAt) : "In"}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted">Not yet</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function CheckinPage({ params }: PageProps<"/plug/events/[id]/checkin">) {
  return (
    <>
      <PageHeader title="Check-in" subtitle="Scan each ticket once. Duplicates are blocked." />
      <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
        <Door params={params} />
      </Suspense>
    </>
  );
}
