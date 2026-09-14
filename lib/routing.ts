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

import { haversineMiles } from "@/lib/geocode";
import { orderByNearestNeighborWithTwoOpt } from "@/lib/route-ordering";

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

/**
 * Real driving-DURATION matrix for a set of points, via OSRM's /table service -- one HTTP
 * request returns every pairwise duration at once, instead of points.length^2 separate
 * /route calls. Same demo server and same fair-use caveat as fetchDrivingRoute above:
 * returns null on any failure (network, rate limit, too many points for the demo server's
 * unpublished table-size cap) so callers can fall back to straight-line distance.
 *
 * Durations (seconds), not distance -- for sequencing a route, minimizing total drive TIME
 * is the actual goal (a longer highway leg can beat a shorter surface-street one).
 */
export async function fetchDrivingDurationMatrix(points: RoutePoint[]): Promise<number[][] | null> {
  if (points.length < 2) return null;
  // The demo server's table-size limit isn't published -- stay well under any plausible
  // cap rather than finding out live against a real day's route.
  if (points.length > 50) return null;

  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const durations = data?.durations;
    if (!Array.isArray(durations) || durations.length !== points.length) return null;
    for (const row of durations) {
      if (!Array.isArray(row) || row.length !== points.length || row.some((v: unknown) => typeof v !== "number")) return null;
    }
    return durations as number[][];
  } catch {
    return null;
  }
}

/**
 * Shared "Optimize stop order" implementation for both the day-of schedule
 * (RouteDayView) and the route builder (RouteStopsList) -- reorders `points` by real
 * driving duration when OSRM's table service is reachable, falling back to straight-line
 * (haversine) distance otherwise so the button still does *something* useful if the demo
 * server is down or rate-limited, exactly like fetchDrivingRoute's own fallback contract.
 *
 * The first element of `points` is always kept first in the returned order (same contract
 * the previous per-component implementations had) -- only the rest get reordered.
 */
export async function computeOptimizedStopOrder<T extends RoutePoint>(points: T[]): Promise<T[]> {
  if (points.length < 2) return points;

  const matrix = (await fetchDrivingDurationMatrix(points)) ?? points.map((a) => points.map((b) => haversineMiles(a, b)));
  const order = orderByNearestNeighborWithTwoOpt(matrix);
  return order.map((i) => points[i]);
}
