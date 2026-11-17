import { z } from "zod";
import { EVENT_CATEGORIES, VIBE_TAGS } from "@/config/app";
import { getState } from "@/config/nigeria";

export const LINK_PLATFORMS = {
  instagram: { label: "Instagram", hosts: ["instagram.com"] },
  tiktok: { label: "TikTok", hosts: ["tiktok.com"] },
  x: { label: "X", hosts: ["x.com", "twitter.com"] },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  snapchat: { label: "Snapchat", hosts: ["snapchat.com"] },
} as const;
export type LinkPlatform = keyof typeof LINK_PLATFORMS;
const PLATFORM_KEYS = Object.keys(LINK_PLATFORMS) as [LinkPlatform, ...LinkPlatform[]];

/** Only https links to the platform's own domain, so a "TikTok" chip can't lead somewhere else. */
export function isPlatformUrl(platform: LinkPlatform, raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.replace(/^www\./, "");
    return LINK_PLATFORMS[platform].hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** `datetime-local` value typed in Lagos time (UTC+1) -> UTC instant. */
export function lagosLocalToDate(value: string): Date {
  return new Date(`${value.length === 16 ? `${value}:00` : value}+01:00`);
}

/** UTC instant -> `datetime-local` value in Lagos time. */
export function dateToLagosLocal(date: Date): string {
  return new Date(date.getTime() + 3_600_000).toISOString().slice(0, 16);
}

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time")
  .transform(lagosLocalToDate);
const optionalLocalDateTime = z.preprocess((v) => (v === "" || v == null ? undefined : v), localDateTime.optional());

const tagList = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : v,
  z.array(z.string().max(30)).max(12),
);

export const tierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name every ticket tier").max(40),
  priceNaira: z.coerce.number().int("Whole naira only").min(0).max(50_000_000),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(100_000),
  perUserLimit: z.coerce.number().int().min(1).max(50).default(6),
  salesStart: optionalLocalDateTime,
  salesEnd: optionalLocalDateTime,
});
export type TierInput = z.infer<typeof tierSchema>;

const linkSchema = z
  .object({ platform: z.enum(PLATFORM_KEYS), url: z.string().trim().max(300) })
  .refine((l) => isPlatformUrl(l.platform, l.url), { message: "Use the full https link to your page on that platform" });

const json = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }, schema);

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Give your event a title").max(80),
    description: z.string().trim().max(3000).default(""),
    category: z.enum(EVENT_CATEGORIES),
    theme: z.string().trim().max(120).default(""),
    themeTags: tagList,
    vibeTags: z.array(z.enum(VIBE_TAGS)).max(6).default([]),
    ageMin: z.coerce.number().refine((n) => [0, 16, 18, 21].includes(n), "Pick an age limit"),
    timeOfDay: z.enum(["day", "night"]),
    startsAt: localDateTime,
    endsAt: localDateTime,
    doorsAt: optionalLocalDateTime,
    venueName: z.string().trim().min(2, "Where is it?").max(80),
    address: z.string().trim().max(200).default(""),
    hideAddress: z.preprocess((v) => v === "on" || v === true, z.boolean()),
    state: z.string().refine((s) => Boolean(getState(s)), "Pick a Nigerian state"),
    city: z.string().trim().min(1, "Pick a city").max(60),
    // Nigeria's bounding box, so a pin can't end up in the ocean off Ghana.
    lat: z.coerce.number().min(4).max(14),
    lng: z.coerce.number().min(2.5).max(15),
    links: json(z.array(linkSchema).max(5)).default([]),
    tiers: json(z.array(tierSchema).max(12)).default([]),
  })
  .refine((e) => e.endsAt > e.startsAt, { path: ["endsAt"], message: "Must end after it starts" })
  .refine((e) => !e.doorsAt || e.doorsAt <= e.startsAt, { path: ["doorsAt"], message: "Doors open before the start" });

export type EventInput = z.infer<typeof eventSchema>;

export const VENDOR_TYPES = ["dj", "hypeman", "venue", "photographer", "caterer"] as const;
export const VENDOR_LABELS: Record<(typeof VENDOR_TYPES)[number], string> = {
  dj: "DJ",
  hypeman: "Hypeman",
  venue: "Venue",
  photographer: "Photographer",
  caterer: "Caterer",
};

export const inviteSchema = z
  .object({
    eventId: z.string().uuid(),
    handle: z
      .string()
      .trim()
      .transform((h) => h.replace(/^@/, ""))
      .pipe(z.string().regex(/^[A-Za-z0-9_.]{3,20}$/, "Enter a valid @handle")),
    role: z.enum(["co_host", "promoter", "vendor"]),
    vendorType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(VENDOR_TYPES).optional()),
  })
  .refine((i) => i.role !== "vendor" || Boolean(i.vendorType), { path: ["vendorType"], message: "Pick the vendor type" });
