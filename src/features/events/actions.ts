"use server";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { eventCollaborators, eventLinks, eventMedia, events, savedEvents, storyViews, ticketTiers, users } from "@/db/schema";
import { requireProfile } from "@/features/auth/session";
import { isStorageConfigured, removeMedia } from "@/lib/supabase/admin";
import { randomSuffix, slugify } from "@/lib/slug";
import { getCollaboration } from "./queries";
import { canEditDetails, canManageMoney, canPublish, eventAccess, type EventAccess } from "./rules";
import { eventSchema, inviteSchema, type EventInput, type TierInput } from "./validation";

export type FormState = { error?: string; ok?: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();

function parseEventForm(formData: FormData) {
  return eventSchema.safeParse({ ...Object.fromEntries(formData), vibeTags: formData.getAll("vibeTags") });
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

/** Load an event and work out what the current user may do with it. */
async function loadAccess(eventId: string) {
  const profile = await requireProfile();
  const [event] = await getDb().select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return { profile, event: null, access: null as EventAccess };
  const collab = event.ownerId === profile.id ? null : await getCollaboration(eventId, profile.id);
  return { profile, event, access: eventAccess(profile.id, event.ownerId, collab) };
}

function detailColumns(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    theme: input.theme,
    themeTags: input.themeTags,
    vibeTags: input.vibeTags,
    ageMin: input.ageMin,
    timeOfDay: input.timeOfDay,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    doorsAt: input.doorsAt ?? null,
    venueName: input.venueName,
    address: input.address,
    hideAddress: input.hideAddress,
    state: input.state,
    city: input.city,
    lat: input.lat,
    lng: input.lng,
  };
}

export async function createEvent(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile();
  if (!profile.isPlug) return { error: "Only Plugs can create events." };
  const parsed = parseEventForm(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };
  const input = parsed.data;
  const db = getDb();

  let slug = slugify(input.title);
  const [clash] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
  if (clash) slug = `${slug}-${randomSuffix()}`;

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(events)
      .values({ ...detailColumns(input), slug, ownerId: profile.id, status: "draft" })
      .returning({ id: events.id });
    if (input.links.length > 0) {
      await tx.insert(eventLinks).values(input.links.map((l) => ({ eventId: row.id, ...l })));
    }
    if (input.tiers.length > 0) {
      await tx.insert(ticketTiers).values(input.tiers.map((t) => tierRow(row.id, t)));
    }
    return row.id;
  });
  redirect(`/plug/events/${id}?created=1`);
}

function tierRow(eventId: string, t: TierInput) {
  return {
    eventId,
    name: t.name,
    priceKobo: t.priceNaira * 100,
    quantity: t.quantity,
    perUserLimit: t.perUserLimit,
    salesStart: t.salesStart ?? null,
    salesEnd: t.salesEnd ?? null,
  };
}

export async function updateEvent(_prev: FormState, formData: FormData): Promise<FormState> {
  const idParsed = uuid.safeParse(formData.get("eventId"));
  if (!idParsed.success) return { error: "Unknown event." };
  const { event, access } = await loadAccess(idParsed.data);
  if (!event || !canEditDetails(access)) return { error: "You can't edit this event." };
  if (event.status === "cancelled" || event.status === "settled") return { error: "This event can no longer be edited." };

  const parsed = parseEventForm(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };
  const input = parsed.data;
  const db = getDb();

  try {
    await db.transaction(async (tx) => {
      await tx.update(events).set(detailColumns(input)).where(eq(events.id, event.id));

      await tx.delete(eventLinks).where(eq(eventLinks.eventId, event.id));
      if (input.links.length > 0) {
        await tx.insert(eventLinks).values(input.links.map((l) => ({ eventId: event.id, ...l })));
      }

      // Ticket tiers are money: only the Lead Plug may change them.
      if (!canManageMoney(access)) return;
      const existing = await tx.select().from(ticketTiers).where(eq(ticketTiers.eventId, event.id));
      const keepIds = input.tiers.flatMap((t) => (t.id ? [t.id] : []));

      for (const old of existing) {
        if (!keepIds.includes(old.id) && old.sold + old.reserved > 0) {
          throw new UserError(`"${old.name}" has tickets sold, so it can't be removed.`);
        }
      }
      await tx
        .delete(ticketTiers)
        .where(
          and(eq(ticketTiers.eventId, event.id), keepIds.length > 0 ? notInArray(ticketTiers.id, keepIds) : undefined),
        );

      for (const t of input.tiers) {
        const old = t.id ? existing.find((e) => e.id === t.id) : undefined;
        if (!old) {
          await tx.insert(ticketTiers).values(tierRow(event.id, t));
          continue;
        }
        if (t.quantity < old.sold + old.reserved) {
          throw new UserError(`"${old.name}" already has ${old.sold + old.reserved} tickets taken.`);
        }
        if (old.sold > 0 && t.priceNaira * 100 !== old.priceKobo) {
          throw new UserError(`"${old.name}" has sales, so its price is locked. Add a new tier instead.`);
        }
        await tx.update(ticketTiers).set(tierRow(event.id, t)).where(eq(ticketTiers.id, old.id));
      }
    });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("updateEvent failed", err);
    return { error: "Could not save your changes. Try again." };
  }
  return { ok: "Saved" };
}

class UserError extends Error {}

/** Publish or unpublish. Only the Lead Plug, and only if the publish rules pass. */
export async function setPublished(eventId: string, publish: boolean): Promise<FormState> {
  if (!uuid.safeParse(eventId).success) return { error: "Unknown event." };
  const { profile, event, access } = await loadAccess(eventId);
  if (!event || !canManageMoney(access)) return { error: "Only the Lead Plug can publish this event." };
  const db = getDb();

  if (!publish) {
    if (event.status !== "published") return { error: "Only a published event can be unpublished." };
    const [{ sold }] = await db
      .select({ sold: sql<number>`coalesce(sum(${ticketTiers.sold} + ${ticketTiers.reserved}), 0)::int` })
      .from(ticketTiers)
      .where(eq(ticketTiers.eventId, eventId));
    if (sold > 0) return { error: "Tickets have been sold. Cancel the event instead so buyers are refunded." };
    await db.update(events).set({ status: "draft" }).where(eq(events.id, eventId));
    return { ok: "Moved back to draft" };
  }

  if (event.status !== "draft") return { error: "This event is already live or closed." };
  const tiers = await db.select().from(ticketTiers).where(eq(ticketTiers.eventId, eventId));
  const [{ flyers }] = await db
    .select({ flyers: sql<number>`count(*)::int` })
    .from(eventMedia)
    .where(and(eq(eventMedia.eventId, eventId), eq(eventMedia.type, "flyer")));
  const check = canPublish(profile, { startsAt: event.startsAt, endsAt: event.endsAt, flyerCount: flyers }, tiers);
  if (!check.ok) return { error: check.reason };

  await db.update(events).set({ status: "published" }).where(eq(events.id, eventId));
  return { ok: "Your event is live" };
}

// ---------- collaborators and vendor co-signs ----------

export async function inviteCollaborator(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const { profile, event, access } = await loadAccess(input.eventId);
  if (!event || !canManageMoney(access)) return { error: "Only the Lead Plug can invite collaborators." };
  const db = getDb();

  const [target] = await db
    .select({ id: users.id, suspended: users.suspended })
    .from(users)
    .where(sql`lower(${users.handle}) = ${input.handle.toLowerCase()}`)
    .limit(1);
  if (!target || target.suspended) return { error: `No user with the handle @${input.handle}.` };
  if (target.id === profile.id) return { error: "You are already the Lead Plug." };

  const row = {
    eventId: event.id,
    userId: target.id,
    role: input.role,
    vendorType: input.role === "vendor" ? (input.vendorType ?? null) : null,
    status: "invited" as const,
  };
  await db
    .insert(eventCollaborators)
    .values(row)
    .onConflictDoUpdate({ target: [eventCollaborators.eventId, eventCollaborators.userId], set: row });
  return { ok: `Invite sent to @${input.handle}. They show on the event once they accept.` };
}

export async function removeCollaborator(eventId: string, userId: string): Promise<FormState> {
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(userId).success) return { error: "Bad request." };
  const { event, access } = await loadAccess(eventId);
  if (!event || !canManageMoney(access)) return { error: "Only the Lead Plug can remove collaborators." };
  await getDb()
    .delete(eventCollaborators)
    .where(and(eq(eventCollaborators.eventId, eventId), eq(eventCollaborators.userId, userId)));
  return { ok: "Removed" };
}

/** Accept or decline an invite / co-sign request addressed to the current user. */
export async function respondToInvite(eventId: string, accept: boolean): Promise<FormState> {
  if (!uuid.safeParse(eventId).success) return { error: "Bad request." };
  const profile = await requireProfile();
  const updated = await getDb()
    .update(eventCollaborators)
    .set({ status: accept ? "accepted" : "declined" })
    .where(
      and(
        eq(eventCollaborators.eventId, eventId),
        eq(eventCollaborators.userId, profile.id),
        eq(eventCollaborators.status, "invited"),
      ),
    )
    .returning({ eventId: eventCollaborators.eventId });
  if (updated.length === 0) return { error: "That invite is no longer open." };
  return { ok: accept ? "Accepted" : "Declined" };
}

// ---------- media ----------

export async function deleteMedia(mediaId: string): Promise<FormState> {
  if (!uuid.safeParse(mediaId).success) return { error: "Bad request." };
  const db = getDb();
  const [media] = await db.select().from(eventMedia).where(eq(eventMedia.id, mediaId)).limit(1);
  if (!media) return { error: "Already deleted." };
  const { profile, access } = await loadAccess(media.eventId);
  // Hosts can delete anything; a promoter only their own stories.
  const allowed = canEditDetails(access) || (access === "promoter" && media.createdBy === profile.id);
  if (!allowed) return { error: "You can't delete this." };

  await db.delete(eventMedia).where(eq(eventMedia.id, mediaId));
  if (isStorageConfigured()) {
    await removeMedia([media.url, media.watermarkedUrl, media.posterUrl]).catch((err) =>
      console.error("storage cleanup failed", err),
    );
  }
  return { ok: "Deleted" };
}

/** Record that the current user saw these stories (for the hosts' "seen by" count). */
export async function markStoriesSeen(mediaIds: string[]): Promise<void> {
  const ids = z.array(uuid).max(50).safeParse(mediaIds);
  if (!ids.success || ids.data.length === 0) return;
  const profile = await requireProfile();
  const db = getDb();
  const stories = await db
    .select({ id: eventMedia.id })
    .from(eventMedia)
    .where(and(inArray(eventMedia.id, ids.data), eq(eventMedia.type, "story")));
  if (stories.length === 0) return;
  await db
    .insert(storyViews)
    .values(stories.map((s) => ({ mediaId: s.id, userId: profile.id })))
    .onConflictDoNothing();
}

// ---------- save / like ----------

export async function toggleSaveEvent(eventId: string): Promise<{ saved: boolean }> {
  const profile = await requireProfile();
  if (!uuid.safeParse(eventId).success) return { saved: false };
  const db = getDb();
  const removed = await db
    .delete(savedEvents)
    .where(and(eq(savedEvents.eventId, eventId), eq(savedEvents.userId, profile.id)))
    .returning({ eventId: savedEvents.eventId });
  if (removed.length > 0) return { saved: false };
  await db.insert(savedEvents).values({ eventId, userId: profile.id }).onConflictDoNothing();
  return { saved: true };
}
