/**
 * Who may do what to an event. Pure functions, enforced server-side in actions
 * and route handlers (never just in the UI). Unit tested.
 */
import { APP_CONFIG } from "@/config/app";
import { BRAND } from "@/config/brand";

export type Actor = { id: string; isPlug: boolean; plugStatus: string; suspended: boolean };
export type CollabRole = "co_host" | "promoter" | "vendor";

/** owner > co_host > promoter. Vendors only co-sign; they get no edit rights. */
export type EventAccess = "owner" | "co_host" | "promoter" | null;

export function eventAccess(
  userId: string,
  ownerId: string,
  collab?: { role: CollabRole; status: string } | null,
): EventAccess {
  if (userId === ownerId) return "owner";
  if (collab?.status !== "accepted") return null;
  if (collab.role === "co_host") return "co_host";
  if (collab.role === "promoter") return "promoter";
  return null;
}

export const canEditDetails = (a: EventAccess) => a === "owner" || a === "co_host";
export const canPostStories = (a: EventAccess) => a !== null;
/** Tiers, collaborators, publishing and anything about money stay with the Lead Plug. */
export const canManageMoney = (a: EventAccess) => a === "owner";

export type PublishCheck = { ok: true } | { ok: false; reason: string };

/**
 * Publishing rules (spec 4.2, 6.8, 6.9):
 *  - Only Plugs can publish at all.
 *  - A PAID event needs a fully verified Plug.
 *  - A FREE event may be published by a Plug who is still being verified; it
 *    then carries the amber "Unverified host" label.
 */
export function canPublish(
  actor: Actor,
  event: { startsAt: Date; endsAt: Date; flyerCount: number },
  tiers: { priceKobo: number; quantity: number }[],
  now: Date = new Date(),
): PublishCheck {
  const plug = BRAND.organiser.singular;
  if (actor.suspended || actor.plugStatus === "suspended") return { ok: false, reason: "Your account is suspended." };
  if (!actor.isPlug) return { ok: false, reason: `Become a ${plug} to publish events.` };
  if (tiers.length === 0) return { ok: false, reason: "Add at least one ticket tier." };
  if (tiers.some((t) => t.quantity < 1)) return { ok: false, reason: "Every ticket tier needs a quantity." };
  if (event.flyerCount < 1) return { ok: false, reason: "Add at least one flyer." };
  if (event.endsAt <= event.startsAt) return { ok: false, reason: "The event must end after it starts." };
  if (event.startsAt <= now) return { ok: false, reason: "The start time must be in the future." };
  const paid = tiers.some((t) => t.priceKobo > 0);
  if (paid && actor.plugStatus !== "verified") {
    return {
      ok: false,
      reason: `Finish ${plug} verification to sell tickets. You can publish free events in the meantime.`,
    };
  }
  return { ok: true };
}

/** Night events default to 18+, day events to all ages (spec 5.2). */
export function defaultAgeMin(timeOfDay: "day" | "night"): number {
  return timeOfDay === "night" ? APP_CONFIG.ADULT_AGE : 0;
}

/** Auto-suggest day/night from the Lagos start hour: 6am to 5pm counts as day. */
export function suggestTimeOfDay(startsAt: Date): "day" | "night" {
  const hour = (startsAt.getUTCHours() + 1) % 24;
  return hour >= 6 && hour < 17 ? "day" : "night";
}

export const MEDIA_LIMITS = {
  maxFlyers: 10,
  maxVideos: 3,
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  videoSeconds: 60,
  storyHours: 24,
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  videoTypes: ["video/mp4", "video/webm", "video/quicktime"],
} as const;
