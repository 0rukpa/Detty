import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/EmptyState";
import { requireProfile } from "@/features/auth/session";
import { CollaboratorManager, PublishBar, StatusPill } from "@/features/events/components/EventAdmin";
import { EventForm, type EventFormValues } from "@/features/events/components/EventForm";
import { MediaManager, type ManagedMedia } from "@/features/events/components/MediaManager";
import { ClearNewEventDraft } from "@/features/events/components/NewEventForm";
import { getCollaboration, getEventForEdit, type EventMediaItem } from "@/features/events/queries";
import { canEditDetails, canManageMoney, eventAccess } from "@/features/events/rules";
import { dateToLagosLocal, type LinkPlatform } from "@/features/events/validation";
import { EventMoneyTools } from "@/features/payments/components/PayoutControls";
import { isStripeTestMode } from "@/lib/stripe";
import { isStorageConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Edit event" };

async function Editor({ params, searchParams }: Pick<PageProps<"/plug/events/[id]">, "params" | "searchParams">) {
  const [{ id }, query, profile] = await Promise.all([params, searchParams, requireProfile()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getEventForEdit(id);
  if (!detail) notFound();
  const { event, flyers, videos, stories, tiers, links, collaborators } = detail;

  const collab = event.ownerId === profile.id ? null : await getCollaboration(id, profile.id);
  const access = eventAccess(profile.id, event.ownerId, collab);
  if (!access) notFound();

  const managed = (m: EventMediaItem): ManagedMedia => ({
    id: m.id,
    url: m.url,
    watermarkedUrl: m.watermarkedUrl,
    posterUrl: m.posterUrl,
    alt: m.alt,
    caption: m.caption,
    isVideo: m.isVideo,
    seenCount: m.seenCount,
    mine: m.createdBy === profile.id,
  });

  const initial: EventFormValues = {
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category,
    theme: event.theme,
    themeTags: event.themeTags.join(", "),
    vibeTags: event.vibeTags,
    ageMin: event.ageMin,
    timeOfDay: event.timeOfDay,
    startsAt: dateToLagosLocal(event.startsAt),
    endsAt: dateToLagosLocal(event.endsAt),
    doorsAt: event.doorsAt ? dateToLagosLocal(event.doorsAt) : "",
    venueName: event.venueName,
    address: event.address,
    hideAddress: event.hideAddress,
    state: event.state,
    city: event.city,
    lat: event.lat,
    lng: event.lng,
    links: links.map((l) => ({ platform: l.platform as LinkPlatform, url: l.url })),
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      priceNaira: String(t.priceKobo / 100),
      quantity: String(t.quantity),
      perUserLimit: String(t.perUserLimit),
      sold: t.sold + t.reserved,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 truncate font-display text-2xl font-extrabold">{event.title}</h2>
        {!canManageMoney(access) ? <StatusPill status={event.status} /> : null}
      </div>

      {query.created === "1" ? <ClearNewEventDraft /> : null}
      {query.created === "1" ? (
        <p role="status" className="rounded-2xl bg-lime/15 p-3 text-sm font-semibold text-lime">
          Draft saved. Add at least one flyer, then publish.
        </p>
      ) : null}

      {canManageMoney(access) ? <PublishBar eventId={event.id} slug={event.slug} status={event.status} /> : null}
      {canManageMoney(access) ? (
        <EventMoneyTools
          eventId={event.id}
          status={event.status}
          testMode={isStripeTestMode()}
          ticketsSold={tiers.reduce((n, t) => n + t.sold, 0)}
        />
      ) : null}

      <section className="rounded-card border border-border bg-surface/50 p-4">
        <h2 className="mb-4 font-display text-xl font-extrabold">Media</h2>
        {isStorageConfigured() ? (
          <MediaManager
            eventId={event.id}
            flyers={flyers.map(managed)}
            videos={videos.map(managed)}
            stories={stories.map(managed)}
            canEdit={canEditDetails(access)}
          />
        ) : (
          <p className="text-sm text-amber">
            Uploads are off. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.
          </p>
        )}
      </section>

      {canManageMoney(access) ? (
        <section className="rounded-card border border-border bg-surface/50 p-4">
          <h2 className="mb-1 font-display text-xl font-extrabold">Collaborators and co-signs</h2>
          <p className="mb-4 text-sm text-muted">
            Co-hosts can edit and post stories. Promoters can post stories. Vendors (DJ, venue, hypeman) confirm they are
            booked, which shows as a trust chip.
          </p>
          <CollaboratorManager eventId={event.id} collaborators={collaborators} />
        </section>
      ) : null}

      {canEditDetails(access) ? <EventForm initial={initial} canEditTiers={canManageMoney(access)} /> : null}
    </div>
  );
}

export default function EditEventPage({ params, searchParams }: PageProps<"/plug/events/[id]">) {
  return (
    <>
      <PageHeader title="Manage event" />
      <Suspense fallback={<div className="skeleton h-[32rem] rounded-card" />}>
        <Editor params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
