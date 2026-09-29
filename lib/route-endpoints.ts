/**
 * Resolves where a route's day begins and finishes.
 *
 * Three layers, because the operator's reality has three: most technicians leave from and
 * return to the same place every day (a default on the technician), some days start or finish
 * somewhere else (an override on the route), and before any of this existed a route simply
 * began at whichever stop happened to be first (no point at all).
 *
 *   start = route.start ?? technician.start ?? none
 *   end   = route.end   ?? technician.end   ?? start      // i.e. a round trip
 *
 * The end chain falling through to `start` rather than to null is what makes every existing
 * row behave exactly as it did before the columns were added: nothing set anywhere means no
 * start point, and a start with no end means the round trip "Optimize stop order" already did.
 *
 * Note the two chains are independent: a route that overrides only its start still finishes at
 * the technician's default end. That's deliberate — "Thursday I leave from the warehouse" says
 * nothing about where Thursday ends.
 */

/** Prisma hands Decimal columns back as Decimal objects, and JSON props as numbers or strings. */
type CoordValue = number | string | { toString(): string } | null | undefined;

export type RouteEndpoint = { latitude: number; longitude: number; label: string | null };

export type EndpointColumns = {
  startLatitude?: CoordValue;
  startLongitude?: CoordValue;
  startAddress?: string | null;
  endLatitude?: CoordValue;
  endLongitude?: CoordValue;
  endAddress?: string | null;
};

/** null/undefined stays null; anything unparseable also becomes null rather than NaN, so a
 *  corrupt column degrades to "not set" instead of poisoning a cost matrix. */
function coord(value: CoordValue): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function pointFrom(lat: CoordValue, lng: CoordValue, label: string | null | undefined): RouteEndpoint | null {
  const latitude = coord(lat);
  const longitude = coord(lng);
  // Both or neither: a half-set pair is not a place.
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude, label: label ?? null };
}

export function resolveRouteEndpoints(input: {
  route?: EndpointColumns | null;
  technician?: EndpointColumns | null;
}): { start: RouteEndpoint | null; end: RouteEndpoint | null } {
  const { route, technician } = input;

  const start =
    pointFrom(route?.startLatitude, route?.startLongitude, route?.startAddress) ??
    pointFrom(technician?.startLatitude, technician?.startLongitude, technician?.startAddress);

  const end =
    pointFrom(route?.endLatitude, route?.endLongitude, route?.endAddress) ??
    pointFrom(technician?.endLatitude, technician?.endLongitude, technician?.endAddress) ??
    start;

  return { start, end };
}

/**
 * Whether two endpoints are the same place. ~1e-6 degrees is around 10cm, far below the
 * precision of a dropped map pin, so this is "the same place" not "identical decimals".
 *
 * The optimizer needs this: a distinct finish makes the day an open path with two pinned ends,
 * but a finish equal to the start is the cheaper round-trip case, and feeding a duplicate
 * zero-cost node into 2-opt instead would be both slower and needlessly confusing.
 */
type CoordsOnly = { latitude: number; longitude: number; label?: string | null };

export function sameEndpoint(a: CoordsOnly | null | undefined, b: CoordsOnly | null | undefined): boolean {
  // Coordinates are all that matter, so a label is accepted and ignored rather than required:
  // the optimizer and the map both hold points without one, while a resolved RouteEndpoint has
  // one, and neither should need converting to ask this question.
  if (!a || !b) return Boolean(!a && !b);
  return Math.abs(a.latitude - b.latitude) < 1e-6 && Math.abs(a.longitude - b.longitude) < 1e-6;
}
