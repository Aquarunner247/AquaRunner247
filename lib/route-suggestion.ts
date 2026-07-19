import { haversineMiles } from "@/lib/geocode";

export type NewCustomerLocation = { latitude: number; longitude: number };

export type CandidateRouteInput = {
  routeId: string;
  technicianLabel: string;
  maxCapacity: number | null;
  /** ALL stops on the route, including ones whose property isn't geocoded yet — used for capacity/display only. */
  totalStopCount: number;
  /** Only stops with resolved coordinates — used for the distance calculation. */
  geocodedStops: { propertyId: string; latitude: number; longitude: number }[];
};

export type RouteSuggestion = {
  routeId: string;
  technicianLabel: string;
  distanceMiles: number;
  nearestPropertyId: string;
  currentStopCount: number;
  maxCapacity: number | null;
};

/**
 * Nearest-fit route suggestion (v1) — no DB access, pure function. For each candidate
 * route not at capacity and with at least one geocoded stop to measure against, finds
 * the closest stop and ranks routes by that distance. A route with stops that are all
 * ungeocoded (or zero stops at all — a real, currently-active case: one of Lindley's
 * routes has none) is excluded rather than ranked with an undefined "nearest stop".
 */
export function suggestRouteForNewCustomer(
  newCustomer: NewCustomerLocation,
  routes: CandidateRouteInput[],
  limit = 3,
): RouteSuggestion[] {
  const suggestions: RouteSuggestion[] = [];

  for (const route of routes) {
    if (route.maxCapacity != null && route.totalStopCount >= route.maxCapacity) continue;
    if (route.geocodedStops.length === 0) continue;

    let nearest = route.geocodedStops[0];
    let nearestDistance = haversineMiles(newCustomer, nearest);
    for (const stop of route.geocodedStops.slice(1)) {
      const distance = haversineMiles(newCustomer, stop);
      if (distance < nearestDistance) {
        nearest = stop;
        nearestDistance = distance;
      }
    }

    suggestions.push({
      routeId: route.routeId,
      technicianLabel: route.technicianLabel,
      distanceMiles: nearestDistance,
      nearestPropertyId: nearest.propertyId,
      currentStopCount: route.totalStopCount,
      maxCapacity: route.maxCapacity,
    });
  }

  suggestions.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return suggestions.slice(0, limit);
}
