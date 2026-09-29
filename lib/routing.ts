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
import { sameEndpoint } from "@/lib/route-endpoints";
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
  // cap rather than finding out live against a real day's route. Note the caller counts
  // ad-hoc "extra stops" as points too, so a dense day reaches this ceiling sooner than its
  // visit count alone suggests; crossing it degrades to straight-line distance, not an error.
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
 * Without `options.start`, the first element of `points` is always kept first in the returned
 * order (same contract the previous per-component implementations had) -- only the rest get
 * reordered.
 *
 * With `options.start` -- typically the technician's home -- the whole day is optimized from
 * that point. The start is prepended for the cost matrix only and stripped from the result, so
 * callers still get exactly their own stops back, reordered. Every stop is then free to move,
 * including the first: nothing is pinned except the start point itself, which isn't one of the
 * caller's stops.
 *
 * `options.end` says where the day finishes when that isn't where it began. Three shapes:
 *
 *   - no end, or an end at the same place as the start -> a round trip, closing leg costed
 *   - a different end -> an open path with both ends pinned (appended, then stripped)
 *   - an end but no start -> the finish is pinned and points[0] stays first, as it does
 *     whenever there's no start point to optimize away from
 *
 * Note each anchor counts toward fetchDrivingDurationMatrix's point ceiling, the same way ad-hoc
 * "extra stops" do -- so a day with both a start and a distinct end spends two of them.
 */
export async function computeOptimizedStopOrder<T extends RoutePoint>(
  points: T[],
  options?: { start?: RoutePoint | null; end?: RoutePoint | null },
): Promise<T[]> {
  if (points.length < 2) return points;

  const start = options?.start ?? null;
  const rawEnd = options?.end ?? null;
  // An end equal to the start is the round trip, not an open path: a duplicate zero-cost node
  // would be slower and would give 2-opt a meaningless pair to shuffle.
  const end = rawEnd && sameEndpoint(start, rawEnd) ? null : rawEnd;

  const costs = async (pts: RoutePoint[]) =>
    (await fetchDrivingDurationMatrix(pts)) ?? pts.map((a) => pts.map((b) => haversineMiles(a, b)));

  if (!start && !end) {
    const order = orderByNearestNeighborWithTwoOpt(await costs(points));
    return order.map((i) => points[i]);
  }

  if (start && !end) {
    // Index 0 is the start point; indices 1..n map to points[0..n-1].
    const anchored: RoutePoint[] = [bare(start), ...points];
    const order = orderByNearestNeighborWithTwoOpt(await costs(anchored), { returnToStart: true });
    return order.filter((i) => i !== 0).map((i) => points[i - 1]);
  }

  if (!start && end) {
    // points[0] stays first (no origin to optimize away from) and the finish is pinned last.
    const anchored: RoutePoint[] = [...points, bare(end)];
    const endIndex = anchored.length - 1;
    const order = orderByNearestNeighborWithTwoOpt(await costs(anchored), { fixedLast: true });
    return order.filter((i) => i !== endIndex).map((i) => points[i]);
  }

  // Both pinned: index 0 is the start, indices 1..n the stops, index n+1 the finish.
  const anchored: RoutePoint[] = [bare(start!), ...points, bare(end!)];
  const endIndex = anchored.length - 1;
  const order = orderByNearestNeighborWithTwoOpt(await costs(anchored), { fixedLast: true });
  return order.filter((i) => i !== 0 && i !== endIndex).map((i) => points[i - 1]);
}

function bare(p: RoutePoint): RoutePoint {
  return { latitude: p.latitude, longitude: p.longitude };
}

