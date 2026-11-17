/** Cookie holding the viewer's rounded location ("lat,lng"). Set by the Near me chip. */
export const GEO_COOKIE = "detty_geo";

export function parseGeoCookie(value: string | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  const [lat, lng] = value.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
