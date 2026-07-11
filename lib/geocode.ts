/**
 * Free geocoding via OpenStreetMap's Nominatim service. No API key needed,
 * but usage policy requires a descriptive User-Agent and reasonable rate
 * limiting (max ~1 request/sec). Fine for our low-volume, one-time-per
 * property use case.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

export type GeocodeResult = { latitude: number; longitude: number };

function userAgent(): string {
  return process.env.NOMINATIM_USER_AGENT || "AquaRunner24-7Pro/1.0 (internal route tool)";
}

export async function geocodeAddress(addressLine: string): Promise<GeocodeResult | null> {
  const trimmed = addressLine.trim();
  if (!trimmed) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;

  const response = await fetch(url, {
    headers: { "User-Agent": userAgent() },
  });
  if (!response.ok) return null;

  const data = (await response.json()) as Array<{ lat: string; lon: string }>;
  const first = data[0];
  if (!first) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

/**
 * Reads coordinates stamped by the AddressFields autocomplete component's hidden
 * latitude/longitude inputs, if the admin picked a suggestion. Lets callers skip their own
 * geocode lookup when exact coordinates are already known.
 */
export function readAutocompleteCoords(formData: FormData): GeocodeResult | null {
  const latRaw = String(formData.get("latitude") ?? "").trim();
  const lngRaw = String(formData.get("longitude") ?? "").trim();
  if (!latRaw || !lngRaw) return null;
  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export function buildFullAddress(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  return [parts.addressLine1, parts.addressLine2, parts.city, parts.region, parts.postalCode, parts.country ?? "US"]
    .filter(Boolean)
    .join(", ");
}

/** Straight-line distance in miles between two lat/long points (haversine). */
export function haversineMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
