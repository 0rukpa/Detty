/**
 * Autosaved event drafts, kept in this browser's localStorage so an unfinished
 * "Create event" form survives validation errors, refreshes and closed tabs.
 * Browser-only helpers: every access is wrapped because storage can be blocked.
 */
import type { EventFormValues, LinkDraft, TierDraft } from "./components/EventForm";

export const NEW_EVENT_DRAFT_KEY = "detty:event-draft:new";

type Stored = Record<string, string | string[]>;

/** Serialise the live form (including the hidden tiers/links JSON fields). */
export function saveEventDraft(key: string, formData: FormData): void {
  const out: Stored = {};
  for (const name of new Set(formData.keys())) {
    const all = formData.getAll(name).filter((v): v is string => typeof v === "string");
    out[name] = name === "vibeTags" ? all : (all[0] ?? "");
  }
  // An unchecked checkbox is simply absent from FormData.
  out.hideAddress = formData.has("hideAddress") ? "on" : "";
  out.vibeTags ??= [];
  try {
    localStorage.setItem(key, JSON.stringify(out));
  } catch {
    // Storage full or blocked (private mode): autosave is a convenience, never an error.
  }
}

export function clearEventDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseList<T>(raw: unknown, fallback: T[]): T[] {
  if (typeof raw !== "string") return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : fallback;
  } catch {
    return fallback;
  }
}

/** Merge a stored draft over the server-provided defaults. `restored` is true if the person had typed something. */
export function loadEventDraft(
  defaults: EventFormValues,
  key: string | undefined,
): { values: EventFormValues; restored: boolean } {
  if (!key || typeof window === "undefined") return { values: defaults, restored: false };
  let d: Stored;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { values: defaults, restored: false };
    d = JSON.parse(raw) as Stored;
  } catch {
    return { values: defaults, restored: false };
  }

  const text = (name: keyof EventFormValues & string, fallback: string) =>
    typeof d[name] === "string" ? (d[name] as string) : fallback;
  const num = (name: "lat" | "lng" | "ageMin", fallback: number) => {
    const n = Number(d[name]);
    return d[name] !== undefined && d[name] !== "" && Number.isFinite(n) ? n : fallback;
  };

  const values: EventFormValues = {
    ...defaults,
    title: text("title", defaults.title),
    description: text("description", defaults.description),
    category: text("category", defaults.category),
    theme: text("theme", defaults.theme),
    themeTags: text("themeTags", defaults.themeTags),
    vibeTags: Array.isArray(d.vibeTags) ? d.vibeTags : defaults.vibeTags,
    ageMin: num("ageMin", defaults.ageMin),
    timeOfDay: d.timeOfDay === "day" || d.timeOfDay === "night" ? d.timeOfDay : defaults.timeOfDay,
    startsAt: text("startsAt", defaults.startsAt),
    endsAt: text("endsAt", defaults.endsAt),
    doorsAt: text("doorsAt", defaults.doorsAt),
    venueName: text("venueName", defaults.venueName),
    address: text("address", defaults.address),
    hideAddress: d.hideAddress === "on",
    state: text("state", defaults.state),
    city: text("city", defaults.city),
    lat: num("lat", defaults.lat),
    lng: num("lng", defaults.lng),
    links: parseList<LinkDraft>(d.links, defaults.links),
    tiers: parseList<TierDraft>(d.tiers, defaults.tiers),
  };

  // Only announce a restore if they had actually started writing.
  const restored = Boolean(values.title || values.description || values.venueName || values.startsAt);
  return { values, restored };
}
