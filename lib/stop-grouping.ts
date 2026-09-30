/**
 * Groups a technician's stops into "one place you park once" bundles, so a pool and its spa read
 * as a single card rather than two rows that look like two separate drives.
 *
 * Pure and Prisma-free so the rules are testable, same as lib/route-ordering.ts and
 * lib/route-projection.ts. The component keeps only the DOM-shaped work.
 *
 * Two conditions, and a stop needs both: close enough to have been serviced on one walk-up, AND a
 * different KIND of water from everything already in the bundle.
 *
 * Distance is measured, never inferred from names. Names were the obvious first idea and they get
 * real cases wrong: "Clubhouse Pool" and "Gym (NE) Pool" at Borgata are 88m apart in different
 * buildings, while a pool and its spa are typically under 20m. No name rule distinguishes those;
 * coordinates do.
 *
 * The type condition came from the field, not from design. OYO's "Pool 1 (North)" and
 * "Pool 2 (South)" are 16m apart on one deck, so distance alone bundled them -- and they turned out
 * to be where photos got misfiled over and over, because two similar pools 16m apart are genuinely
 * hard to tell apart in a photo, in a list, and from a GPS fix. A pool and a spa never have that
 * problem. So a bundle now holds at most one body of each type, which keeps every member of a card
 * distinguishable by the thing a technician can actually see.
 */
import { haversineMiles } from "@/lib/geocode";

const MILES_TO_METERS = 1609.344;

/**
 * Two stops belong to the same bundle within this many metres of each other.
 *
 * Measured against every multi-venue property this customer has, rather than guessed. The widest
 * pair that clearly belongs together is 19.2m (Ritiro's pool and spa); the closest pair that
 * clearly does not is 87.6m (Borgata's Clubhouse spa to its Gym spa). 40m sits with roughly 2x
 * headroom either side, so it isn't sensitive to a sloppily-dropped pin.
 */
export const BUNDLE_RADIUS_METERS = 40;

export type GroupableStop = {
  id: string;
  /** Null for a stop that can't belong to a bundle at all -- an ad-hoc errand. It also BREAKS a
   * run: bodies of water either side of an errand were not serviced on one walk-up. */
  propertyId: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * BodyOfWater.type ("POOL", "SPA", "OTHER", ...). Required rather than optional so a caller
   * cannot omit it and silently get the old any-two-bodies-bundle behaviour back. Null means the
   * kind is unknown, which neither joins a bundle nor accepts one -- an unlabelled card is the
   * exact ambiguity this prevents.
   */
  bodyType: string | null;
  /** Multi-technician mode only; a change here always starts a new group. */
  technicianId?: string | null;
  /** True for a stop that neither joins a bundle nor breaks one -- a skipped visit. Preserves
   * today's tolerance of a CANCELLED stop sitting between two bodies of the same occasion. */
  ignored?: boolean;
};

export type StopGroup = {
  groupId: string;
  propertyId: string;
  /** In route order, always at least one. */
  memberIds: string[];
};

export function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  return haversineMiles(a, b) * MILES_TO_METERS;
}

/**
 * Contiguous runs of stops at the same property, same technician, within `radiusMeters` of the
 * run's FIRST member.
 *
 * Measured against the first member rather than the previous one deliberately: chaining
 * neighbour-to-neighbour would let a string of 30m hops bundle two ends of a property that are
 * 150m apart, which is exactly the "front and back read as one place" problem this fixes.
 *
 * A stop with no coordinates at all (its venue isn't pinned AND its property isn't geocoded)
 * can't be measured, so it gets its own group rather than being assumed nearby.
 */
export function groupNearbyStops(stops: GroupableStop[], radiusMeters = BUNDLE_RADIUS_METERS): StopGroup[] {
  const groups: StopGroup[] = [];
  let counter = 0;
  // Assigned only in this loop -- a helper closure that reassigned `current` would defeat
  // TypeScript's narrowing of it below.
  let current: StopGroup | null = null;
  let anchor: { latitude: number; longitude: number } | null = null;
  let anchorTechnicianId: string | null | undefined;
  /** Types already in the open run. A bundle holds at most one body of each kind. */
  let typesInRun = new Set<string>();
  /** True once the run contains a body whose kind is unknown. Such a run accepts nothing further:
   *  an unknown kind cannot be shown to differ from anything, so pairing it would produce exactly
   *  the card whose members can't be told apart. */
  let runKindUnknown = false;

  for (const stop of stops) {
    if (stop.ignored) continue;

    if (stop.propertyId == null) {
      // An errand: not a member, and it ends whatever run was open.
      current = null;
      anchor = null;
      typesInRun = new Set();
      runKindUnknown = false;
      continue;
    }

    const coords =
      stop.latitude != null && stop.longitude != null ? { latitude: stop.latitude, longitude: stop.longitude } : null;

    const joins =
      current !== null &&
      current.propertyId === stop.propertyId &&
      anchorTechnicianId === stop.technicianId &&
      anchor !== null &&
      coords !== null &&
      metersBetween(anchor, coords) <= radiusMeters &&
      // One body of each kind per bundle, and an unknown kind on either side never pairs.
      !runKindUnknown &&
      stop.bodyType != null &&
      !typesInRun.has(stop.bodyType);

    if (joins && current !== null) {
      current.memberIds.push(stop.id);
      if (stop.bodyType != null) typesInRun.add(stop.bodyType);
      continue;
    }

    current = { groupId: `g${counter++}`, propertyId: stop.propertyId, memberIds: [stop.id] };
    groups.push(current);
    anchor = coords;
    anchorTechnicianId = stop.technicianId;
    typesInRun = new Set(stop.bodyType != null ? [stop.bodyType] : []);
    runKindUnknown = stop.bodyType == null;
  }

  return groups;
}

/** 1-based positions as a compact label: [4,5,6] -> "4–6", [4,6] -> "4, 6", [4] -> "4". */
export function formatSequenceRange(positions: number[]): string {
  if (positions.length === 0) return "";
  const sorted = [...positions].sort((a, b) => a - b);
  const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (sorted.length === 1) return String(sorted[0]);
  return consecutive ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(", ");
}

/**
 * Reorders an already-optimized sequence so that stops which belong to the same bundle sit next to
 * each other, without disturbing anything else.
 *
 * Why this is needed: the optimizer treats every body of water as an independent point, and two
 * bodies at one property are typically 6-19m apart. When two PROPERTIES are also close together,
 * interleaving them (pool A, pool B, spa A, spa B) costs essentially no drive time, so nothing in
 * the cost function prefers the grouped order -- and 2-opt has no reason to undo it. Observed live:
 * Pacific Harbors and Paseo Del Prado came out as spa, spa, pool, pool, so neither property's pair
 * was contiguous and neither could be shown as one card.
 *
 * Only ever moves a stop to just after a stop it would BUNDLE with, so the move is bounded by
 * radiusMeters -- at most a few metres of walking, never a re-route. Stable otherwise: the relative
 * order of the groups themselves is exactly what came in, so the optimizer's decisions stand.
 */
export function coalesceBundleMembers<T extends GroupableStop>(
  stops: T[],
  radiusMeters = BUNDLE_RADIUS_METERS,
): T[] {
  const out: T[] = [];
  const taken = new Set<number>();

  for (let i = 0; i < stops.length; i++) {
    if (taken.has(i)) continue;
    const anchor = stops[i];
    out.push(anchor);
    taken.add(i);

    // An anchor that can't bundle at all (an errand, or no pin) takes nothing with it.
    if (anchor.propertyId == null || anchor.latitude == null || anchor.longitude == null) continue;
    if (anchor.ignored || anchor.bodyType == null) continue;

    const anchorCoords = { latitude: anchor.latitude, longitude: anchor.longitude };
    const typesTaken = new Set<string>([anchor.bodyType]);

    for (let j = i + 1; j < stops.length; j++) {
      if (taken.has(j)) continue;
      const candidate = stops[j];
      if (
        candidate.propertyId !== anchor.propertyId ||
        candidate.technicianId !== anchor.technicianId ||
        candidate.ignored ||
        candidate.bodyType == null ||
        typesTaken.has(candidate.bodyType) ||
        candidate.latitude == null ||
        candidate.longitude == null
      ) {
        continue;
      }
      if (metersBetween(anchorCoords, { latitude: candidate.latitude, longitude: candidate.longitude }) > radiusMeters) {
        continue;
      }
      out.push(candidate);
      taken.add(j);
      typesTaken.add(candidate.bodyType);
    }
  }

  return out;
}
