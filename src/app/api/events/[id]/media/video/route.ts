import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { eventMedia, events } from "@/db/schema";
import { getCurrentProfile } from "@/features/auth/session";
import { getCollaboration } from "@/features/events/queries";
import { canEditDetails, canPostStories, eventAccess, MEDIA_LIMITS } from "@/features/events/rules";
import {
  ensureMediaBucket,
  getAdminClient,
  isOwnMediaUrl,
  isStorageConfigured,
  MEDIA_BUCKET,
  publicMediaUrl,
} from "@/lib/supabase/admin";

const EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sign"),
    kind: z.enum(["video", "story"]),
    contentType: z.enum(MEDIA_LIMITS.videoTypes),
    size: z.number().int().positive().max(MEDIA_LIMITS.videoBytes, "Videos must be 50MB or smaller."),
    duration: z.number().positive().max(MEDIA_LIMITS.videoSeconds + 1, "Videos must be 60 seconds or shorter."),
  }),
  z.object({
    action: z.literal("commit"),
    kind: z.enum(["video", "story"]),
    path: z.string().max(200),
    posterUrl: z.string().max(500).optional(),
    caption: z.string().trim().max(200).optional(),
  }),
]);

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Video uploads (promo videos and video stories) in two steps, so large files
 * never pass through our server:
 *   1. "sign":   we check permissions and limits, and return a one-time signed upload URL.
 *   2. "commit": after the browser uploads, we verify the stored object and save the row.
 *
 * Note: the 60s limit is checked from the duration the browser reports. A real
 * server-side probe (ffprobe) is a production follow-up; size IS verified server-side.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/events/[id]/media/video">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail(404, "Unknown event.");
  if (!isStorageConfigured()) return fail(503, "Uploads are not set up. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.");

  const profile = await getCurrentProfile();
  if (!profile || profile.suspended) return fail(401, "Sign in first.");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Bad request.");
  const input = parsed.data;

  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return fail(404, "Unknown event.");
  const collab = event.ownerId === profile.id ? null : await getCollaboration(id, profile.id);
  const access = eventAccess(profile.id, event.ownerId, collab);
  if (input.kind === "story" ? !canPostStories(access) : !canEditDetails(access)) {
    return fail(403, "You can't upload to this event.");
  }

  const prefix = `events/${id}/${input.kind}/`;
  const storage = getAdminClient().storage.from(MEDIA_BUCKET);

  if (input.action === "sign") {
    if (input.kind === "video") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventMedia)
        .where(and(eq(eventMedia.eventId, id), eq(eventMedia.type, "video")));
      if (count >= MEDIA_LIMITS.maxVideos) return fail(409, `An event can have up to ${MEDIA_LIMITS.maxVideos} videos.`);
    }
    await ensureMediaBucket();
    const path = `${prefix}${crypto.randomUUID()}.${EXT[input.contentType]}`;
    const { data, error } = await storage.createSignedUploadUrl(path);
    if (error || !data) return fail(500, "Could not start the upload.");
    return NextResponse.json({ bucket: MEDIA_BUCKET, path: data.path, token: data.token });
  }

  // commit: the path must be one we issued for this event, and the object must exist and be within limits.
  if (!input.path.startsWith(prefix) || input.path.includes("..")) return fail(400, "Bad upload path.");
  const name = input.path.slice(prefix.length);
  const { data: found } = await storage.list(prefix.slice(0, -1), { search: name, limit: 1 });
  const object = found?.find((o) => o.name === name);
  if (!object) return fail(400, "Upload not found. Try again.");
  if (Number(object.metadata?.size ?? 0) > MEDIA_LIMITS.videoBytes) {
    await storage.remove([input.path]);
    return fail(413, "Videos must be 50MB or smaller.");
  }
  const posterUrl = input.posterUrl && isOwnMediaUrl(input.posterUrl, `events/${id}/poster/`) ? input.posterUrl : null;

  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${eventMedia.order}), -1)::int + 1` })
    .from(eventMedia)
    .where(and(eq(eventMedia.eventId, id), eq(eventMedia.type, input.kind)));
  const [row] = await db
    .insert(eventMedia)
    .values({
      eventId: id,
      type: input.kind,
      url: publicMediaUrl(input.path),
      posterUrl,
      caption: input.caption,
      createdBy: profile.id,
      order: nextOrder,
      expiresAt: input.kind === "story" ? new Date(Date.now() + MEDIA_LIMITS.storyHours * 3_600_000) : null,
    })
    .returning({ id: eventMedia.id });
  return NextResponse.json({ id: row.id });
}
