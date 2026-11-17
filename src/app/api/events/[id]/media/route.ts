import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { eventMedia, events } from "@/db/schema";
import { getCurrentProfile } from "@/features/auth/session";
import { getCollaboration } from "@/features/events/queries";
import { canEditDetails, canPostStories, eventAccess, MEDIA_LIMITS } from "@/features/events/rules";
import { processFlyer, processImage } from "@/features/events/watermark";
import { isStorageConfigured, uploadMedia } from "@/lib/supabase/admin";

const fields = z.object({
  kind: z.enum(["flyer", "story", "poster"]),
  alt: z.string().trim().max(200).optional(),
  caption: z.string().trim().max(200).optional(),
});

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Image uploads for an event: flyers (auto-watermarked), image stories (24h)
 * and video poster frames. Videos go straight to Storage; see ./video/route.ts.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/events/[id]/media">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail(404, "Unknown event.");
  if (!isStorageConfigured()) return fail(503, "Uploads are not set up. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.");

  const profile = await getCurrentProfile();
  if (!profile || profile.suspended) return fail(401, "Sign in first.");

  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return fail(404, "Unknown event.");
  const collab = event.ownerId === profile.id ? null : await getCollaboration(id, profile.id);
  const access = eventAccess(profile.id, event.ownerId, collab);

  const form = await request.formData().catch(() => null);
  const parsed = fields.safeParse({
    kind: form?.get("kind"),
    alt: form?.get("alt") || undefined,
    caption: form?.get("caption") || undefined,
  });
  const file = form?.get("file");
  if (!parsed.success || !(file instanceof File)) return fail(400, "Missing file.");
  const { kind, alt, caption } = parsed.data;

  if (kind === "story" ? !canPostStories(access) : !canEditDetails(access)) {
    return fail(403, "You can't upload to this event.");
  }
  if (!(MEDIA_LIMITS.imageTypes as readonly string[]).includes(file.type)) {
    return fail(415, "Use a JPG, PNG or WebP image.");
  }
  if (file.size > MEDIA_LIMITS.imageBytes) return fail(413, "Images must be 10MB or smaller.");

  const input = Buffer.from(await file.arrayBuffer());
  const key = crypto.randomUUID();

  try {
    if (kind === "poster") {
      const url = await uploadMedia(`events/${id}/poster/${key}.webp`, await processImage(input, 1280), "image/webp");
      return NextResponse.json({ url });
    }

    if (kind === "story") {
      const url = await uploadMedia(`events/${id}/story/${key}.webp`, await processImage(input), "image/webp");
      const [row] = await db
        .insert(eventMedia)
        .values({
          eventId: id,
          type: "story",
          url,
          caption,
          createdBy: profile.id,
          expiresAt: new Date(Date.now() + MEDIA_LIMITS.storyHours * 3_600_000),
        })
        .returning({ id: eventMedia.id });
      return NextResponse.json({ id: row.id, url });
    }

    const [{ count, nextOrder }] = await db
      .select({
        count: sql<number>`count(*)::int`,
        nextOrder: sql<number>`coalesce(max(${eventMedia.order}), -1)::int + 1`,
      })
      .from(eventMedia)
      .where(and(eq(eventMedia.eventId, id), eq(eventMedia.type, "flyer")));
    if (count >= MEDIA_LIMITS.maxFlyers) return fail(409, `An event can have up to ${MEDIA_LIMITS.maxFlyers} flyers.`);

    const flyer = await processFlyer(input, event.slug);
    const [url, watermarkedUrl] = await Promise.all([
      uploadMedia(`events/${id}/flyer/${key}.webp`, flyer.original, "image/webp"),
      uploadMedia(`events/${id}/flyer/${key}-wm.webp`, flyer.watermarked, "image/webp"),
    ]);
    const [row] = await db
      .insert(eventMedia)
      .values({ eventId: id, type: "flyer", url, watermarkedUrl, alt, createdBy: profile.id, order: nextOrder })
      .returning({ id: eventMedia.id });
    return NextResponse.json({ id: row.id, url, watermarkedUrl });
  } catch (err) {
    console.error("media upload failed", err);
    return fail(422, "We could not process that image. Try a different file.");
  }
}
