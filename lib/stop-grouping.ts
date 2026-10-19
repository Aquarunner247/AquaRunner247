/**
 * Groups a technician's stops into "one place you park once" bundles, so a pool and its spa read
 * as a single card rather than two rows that look like two separate drives.
 *
 * Pure and Prisma-free so the rules are testable, same as lib/route-ordering.ts and
 * lib/route-projection.ts. The component keeps only the DOM-shaped work.
 *
 * DECLARED, not inferred, as of 2026-10-19. Two stops are one bundle when they are contiguous in
 * route order, at the same property, with the same technician, and share a non-null serviceGroup.
 * A body with no group is its own stop, always.
 *
 * What this replaces: bundling by pin distance (within 40m) and differing body type. That read
 * this org's thirteen multi-body properties correctly in all but one case, so it was not wrong so
 * much as unanswerable -- it decided something visible by means nobody could see. Nudging a pin a
 * few metres could merge or split a card with no edit to show for it, a property whose pin was
 * badly geocoded bundled nothing, and OYO's two pools -- one arrival, 16m apart, both POOL --
 * could never bundle at all, because the type rule existed to stop two lookalike pools being
 * confused in photos. Declaring it keeps that protection where it belongs: as the operator's
 * decision about one specific property, not a rule applied to every property at once.
 *
 * metersBetween stays exported: the distance is still what the backfill reasons about, and the
 * route map still measures.
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
   * BodyOfWater.type ("POOL", "SPA", "OTHER", ...). No longer decides bundling -- kept because the
   * card still labels its members by kind, and the backfill reasons about it.
   */
  bodyType: string | null;
  /**
   * BodyOfWater.serviceGroup. Null means this stop is its own bundle, always. Two stops bundle
   * only by sharing this, which is why nothing here measures a distance any more.
   */
  serviceGroup?: string | null;
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
 * Contiguous runs of stops at the same property, same technician, sharing a declared serviceGroup.
 *
 * Contiguity is still required. A bundle is one card at one position in the day, so its members
 * have to be adjacent in route order for that position to mean anything; two stops of the same
 * group with another property's stop between them are two visits to the same place, and the card
 * should say so by not existing.
 *
 * A stop with no serviceGroup gets its own group, as does an errand -- which, as before, also
 * BREAKS a run: bodies either side of a supply-house run were not serviced on one walk-up.
 *
 * `radiusMeters` is accepted and ignored, so existing callers keep compiling while the parameter
 * is removed from them; it will go once they have.
 */
export function groupNearbyStops(stops: GroupableStop[], _radiusMeters = BUNDLE_RADIUS_METERS): StopGroup[] {
  const groups: StopGroup[] = [];
  let counter = 0;
  let current: StopGroup | null = null;
  let runGroup: string | null = null;
  let runTechnicianId: string | null | undefined;

  for (const stop of stops) {
    if (stop.ignored) continue;

    if (stop.propertyId == null) {
      // An errand: not a member, and it ends whatever run was open.
      current = null;
      runGroup = null;
      continue;
    }

    const group = stop.serviceGroup?.trim() || null;
    const joins =
      current !== null &&
      group !== null &&
      runGroup === group &&
      current.propertyId === stop.propertyId &&
      runTechnicianId === stop.technicianId;

    if (joins && current !== null) {
      current.memberIds.push(stop.id);
      continue;
    }

    current = { groupId: `g${counter++}`, propertyId: stop.propertyId, memberIds: [stop.id] };
    groups.push(current);
    runGroup = group;
    runTechnicianId = stop.technicianId;
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
 * Only ever moves a stop to just after one it shares a serviceGroup with, which the operator has
 * declared to be the same walk-up -- so the move is by definition within one arrival, never a
 * re-route. Stable otherwise: the relative order of the groups themselves is exactly what came in,
 * so the optimizer's decisions stand.
 */
export function coalesceBundleMembers<T extends GroupableStop>(stops: T[], _radiusMeters = BUNDLE_RADIUS_METERS): T[] {
  const out: T[] = [];
  const taken = new Set<number>();

  for (let i = 0; i < stops.length; i++) {
    if (taken.has(i)) continue;
    const anchor = stops[i];
    out.push(anchor);
    taken.add(i);

    // An anchor that cannot bundle at all -- an errand, a skipped stop, or a body nobody grouped
    // -- takes nothing with it.
    const anchorGroup = anchor.serviceGroup?.trim() || null;
    if (anchor.propertyId == null || anchor.ignored || anchorGroup == null) continue;

    for (let j = i + 1; j < stops.length; j++) {
      if (taken.has(j)) continue;
      const candidate = stops[j];
      if (
        candidate.propertyId !== anchor.propertyId ||
        candidate.technicianId !== anchor.technicianId ||
        candidate.ignored ||
        (candidate.serviceGroup?.trim() || null) !== anchorGroup
      ) {
        continue;
      }
      out.push(candidate);
      taken.add(j);
    }
  }

  return out;
}

