import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/** Public bucket for flyers, promo videos, posters and stories. */
export const MEDIA_BUCKET = "event-media";

let admin: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Service-role client. SERVER ONLY: this key bypasses RLS. */
export function getAdminClient(): SupabaseClient {
  if (admin) return admin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local to enable uploads.");
  }
  admin = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** Create the media bucket on first use. */
export async function ensureMediaBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const { error } = await getAdminClient().storage.createBucket(MEDIA_BUCKET, { public: true });
    if (error && !/already exists/i.test(error.message)) {
      bucketReady = null;
      throw new Error(`Could not create storage bucket: ${error.message}`);
    }
  })();
  return bucketReady;
}

export function publicMediaUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/** True if `url` points into our own media bucket under the given path prefix. */
export function isOwnMediaUrl(url: string, prefix: string): boolean {
  return url.startsWith(publicMediaUrl(prefix));
}

export async function uploadMedia(path: string, body: Buffer, contentType: string): Promise<string> {
  await ensureMediaBucket();
  const { error } = await getAdminClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return publicMediaUrl(path);
}

export async function removeMedia(urls: (string | null | undefined)[]): Promise<void> {
  const base = publicMediaUrl("");
  const paths = urls.filter((u): u is string => Boolean(u?.startsWith(base))).map((u) => u.slice(base.length));
  if (paths.length > 0) await getAdminClient().storage.from(MEDIA_BUCKET).remove(paths);
}
