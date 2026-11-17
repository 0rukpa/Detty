import { BRAND } from "@/config/brand";

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event"
  );
}

/** Short random suffix used when a slug is already taken. */
export function randomSuffix(length = 4): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** The short official link printed on watermarked flyers, e.g. detty.app/e/white-noise. */
export function officialEventLink(slug: string): string {
  return `${BRAND.domain}/e/${slug}`;
}

/** The absolute URL the QR code and share sheet point at. */
export function eventUrl(slug: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? `https://${BRAND.domain}`).replace(/\/$/, "");
  return `${base}/e/${slug}`;
}
