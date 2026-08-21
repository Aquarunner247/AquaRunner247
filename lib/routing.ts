/**
 * Real driving-route geometry via OSRM's free public demo routing server -- no API key,
 * same "no paid mapping account" approach this app already uses for OSM tiles and
 * Nominatim geocoding (see lib/geocode.ts). Runs client-side (called from route-day-view's
 * Leaflet map), since fetch to router.project-osrm.org works cross-origin from the browser.
 *
 * The public demo server is explicitly documented as light-use-only, not a production SLA
 * -- returns null on any failure (network, rate limit, no route found) so callers can fall
 * back to a straight line rather than erroring. If usage ever outgrows the demo server's
 * fair-use limits, this is the one place to swap in a paid provider (Mapbox Directions,
 * Google Directions) or a self-hosted OSRM instance.
 * http://project-osrm.org/docs/v5.24.0/api/#general-options
 */

export type RoutePoint = { latitude: number; longitude: number };

export async function fetchDrivingRoute(points: RoutePoint[]): Promise<[number, number][] | null> {
  if (points.length < 2) return null;

  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const coordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) return null;

    // GeoJSON coordinates are [lng, lat]; Leaflet wants [lat, lng].
    return coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
  } catch {
    return null;
  }
}
