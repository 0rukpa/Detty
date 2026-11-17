import "server-only";
import { cookies } from "next/headers";
import { getState } from "@/config/nigeria";
import { isDbConfigured } from "@/db";
import { getAuthUser, getCurrentProfile } from "@/features/auth/session";
import { ageOn } from "@/features/profiles/validation";
import { parseFilters, type DiscoveryFilters } from "./filters";
import { GEO_COOKIE, parseGeoCookie } from "./geo";
import { listFeedEvents, type FeedEvent } from "./queries";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export type Discovery =
  | { status: "no_db" | "db_error" }
  | {
      status: "ok";
      events: FeedEvent[];
      filters: DiscoveryFilters;
      signedIn: boolean;
      needsOnboarding: boolean;
      hasGeo: boolean;
      /** Where distances are measured from, and how we know it. */
      origin: { lat: number; lng: number; source: "geo" | "home" } | null;
    };

/**
 * Shared loader for the Feed and Explore pages: reads filters from the URL,
 * works out the viewer's origin (geolocation cookie, else home state) and
 * applies the under-18 age gate server-side.
 */
export async function loadDiscovery(searchParams: SearchParams, defaults: Partial<DiscoveryFilters> = {}): Promise<Discovery> {
  const [params, authUser, profile, cookieStore] = await Promise.all([
    searchParams,
    getAuthUser(),
    getCurrentProfile(),
    cookies(),
  ]);
  if (!isDbConfigured()) return { status: "no_db" };

  const filters = { ...defaults, ...stripUndefined(parseFilters(params)) } as DiscoveryFilters;
  const geo = parseGeoCookie(cookieStore.get(GEO_COOKIE)?.value);
  const home = profile ? getState(profile.homeState) : undefined;
  const origin = geo
    ? { ...geo, source: "geo" as const }
    : home
      ? { lat: home.lat, lng: home.lng, source: "home" as const }
      : null;

  try {
    const events = await listFeedEvents({
      filters,
      viewerAge: profile ? ageOn(profile.dob) : undefined,
      viewerId: profile?.id,
      origin: origin ?? undefined,
    });
    return {
      status: "ok",
      events,
      filters,
      signedIn: Boolean(profile),
      needsOnboarding: Boolean(authUser && !profile),
      hasGeo: Boolean(geo),
      origin,
    };
  } catch (err) {
    console.error("discovery query failed", err);
    return { status: "db_error" };
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== false)) as Partial<T>;
}
