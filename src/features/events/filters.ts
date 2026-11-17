/**
 * Discovery filters (spec 5.3). Filters live in the URL so a filtered feed can
 * be shared and survives a refresh. Pure functions only: unit tested.
 */
import { z } from "zod";
import { DETTY_DECEMBER, EVENT_CATEGORIES, VIBE_TAGS } from "@/config/app";
import { STATE_NAMES } from "@/config/nigeria";

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is UTC+1, no DST

export const WHEN_PRESETS = ["tonight", "weekend", "detty_december"] as const;
export type WhenPreset = (typeof WHEN_PRESETS)[number];

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const flag = z.preprocess((v) => one(v) === "1", z.boolean());
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    const s = one(v);
    return s === "" || s === undefined ? undefined : s;
  }, schema.optional().catch(undefined));

export const filterSchema = z.object({
  state: optional(z.enum(STATE_NAMES as [string, ...string[]])),
  when: optional(z.enum(WHEN_PRESETS)),
  from: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  cat: optional(z.enum(EVENT_CATEGORIES)),
  tod: optional(z.enum(["day", "night"])),
  vibe: optional(z.enum(VIBE_TAGS)),
  max: optional(z.coerce.number().int().min(0).max(10_000_000)), // max price in naira
  free: flag,
  cert: flag,
  saved: flag,
});
export type DiscoveryFilters = z.infer<typeof filterSchema>;

export function parseFilters(searchParams: Record<string, string | string[] | undefined>): DiscoveryFilters {
  return filterSchema.parse(searchParams);
}

export function activeFilterCount(f: DiscoveryFilters): number {
  return [f.state, f.when ?? f.from ?? f.to, f.cat, f.tod, f.vibe, f.max, f.free, f.cert, f.saved].filter(Boolean)
    .length;
}

/** Midnight Lagos time of a YYYY-MM-DD date, as a UTC instant. */
export function lagosDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - LAGOS_OFFSET_MS);
}

/** Today's date in Lagos as YYYY-MM-DD. */
export function lagosToday(now: Date = new Date()): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

const addDays = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** The coming Detty December window (Dec 15 to Jan 5) as YYYY-MM-DD dates. */
export function dettyDecemberDates(now: Date = new Date()): { from: string; to: string } {
  const today = lagosToday(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  // In early January we are still inside the window that started last December.
  const startYear = month === DETTY_DECEMBER.endMonth + 1 && day <= DETTY_DECEMBER.endDay ? year - 1 : year;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${startYear}-${pad(DETTY_DECEMBER.startMonth + 1)}-${pad(DETTY_DECEMBER.startDay)}`,
    to: `${startYear + 1}-${pad(DETTY_DECEMBER.endMonth + 1)}-${pad(DETTY_DECEMBER.endDay)}`,
  };
}

/**
 * Resolve the date filter to a half-open [start, end) window of event start times.
 * - tonight: now until 6am tomorrow (Lagos)
 * - weekend: the coming Friday 00:00 to Monday 00:00 (or the current weekend if we are in it)
 * - detty_december: Dec 15 to Jan 5 inclusive
 * - from/to: custom dates, inclusive
 */
export function resolveDateRange(
  f: Pick<DiscoveryFilters, "when" | "from" | "to">,
  now: Date = new Date(),
): { start?: Date; end?: Date } {
  const today = lagosToday(now);
  if (f.when === "tonight") {
    return { start: now, end: new Date(lagosDayStart(addDays(today, 1)).getTime() + 6 * 3_600_000) };
  }
  if (f.when === "weekend") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
    const toFriday = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
    const friday = addDays(today, toFriday);
    const start = lagosDayStart(friday);
    return { start: start < now ? now : start, end: lagosDayStart(addDays(friday, 3)) };
  }
  if (f.when === "detty_december") {
    const { from, to } = dettyDecemberDates(now);
    return { start: lagosDayStart(from), end: lagosDayStart(addDays(to, 1)) };
  }
  return {
    start: f.from ? lagosDayStart(f.from) : undefined,
    end: f.to ? lagosDayStart(addDays(f.to, 1)) : undefined,
  };
}
