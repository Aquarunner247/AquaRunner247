import { haversineMiles } from "@/lib/geocode";

export type AnchorPoint = { latitude: number; longitude: number };

/**
 * How close a stop has to be to a start/end anchor to count as being THAT anchor.
 *
 * A pool gate, a geocoded street address and a dropped map pin for the same property routinely
 * disagree by tens of metres, so this is a "same place" tolerance, not an equality check. Forty
 * metres is about the width of a parking lot: wide enough to absorb that disagreement, far too
 * narrow to swallow a neighbouring property.
 */
export const ANCHOR_COINCIDENT_METERS = 40;

const METERS_PER_MILE = 1609.344;

export function metersBetween(a: AnchorPoint, b: AnchorPoint): number {
  return haversineMiles(a, b) * METERS_PER_MILE;
}

export type AnchorSplit<T> = { leading: T[]; middle: T[]; trailing: T[] };

/**
 * Separates the stops that ARE the day's start or finish from the ones in between.
 *
 * A start/end anchor is a bare coordinate, and the optimizer feeds it to the cost matrix as an
 * extra node pinned at one end. That is right when the anchor is somewhere nobody services -- a
 * technician's home, the yard -- but wrong when it is a customer who is also a stop that day: the
 * property then exists twice in the problem, once as the real stop and once as a phantom metres
 * away. Seen on Rich's Friday on 2026-10-16, where the finish was set to OYO and OYO is also two
 * stops on that route: greedy nearest-neighbour took both OYO pools second, because they sit near
 * the Tailgate start, and the pinned finish was then satisfied by a 19km leg from Paseo Del Prado
 * to a hotel that had been serviced hours earlier. Nothing could 2-opt its way out, since the
 * phantom was held fixed.
 *
 * So a stop sitting on an anchor is pinned INSTEAD of the phantom, and "end at OYO" means OYO is
 * serviced last rather than driven to afterwards. Every stop within the tolerance goes, not just
 * the nearest: a hotel with two pools is one arrival, and leaving one behind would strand it in
 * the middle of the day.
 *
 * An anchor with no stop on it is left alone and still becomes a phantom node, which is the
 * correct reading of "finish at home".
 *
 * Start wins a tie. A stop you are standing on at the start of the day is where you begin, even
 * if the day also finishes nearby.
 */
export function splitAnchorCoincidentStops<T extends AnchorPoint>(
  points: T[],
  start: AnchorPoint | null | undefined,
  end: AnchorPoint | null | undefined,
  toleranceMeters: number = ANCHOR_COINCIDENT_METERS,
): AnchorSplit<T> {
  const near = (anchor: AnchorPoint | null | undefined, point: T) =>
    anchor != null && metersBetween(anchor, point) <= toleranceMeters;

  const leading: T[] = [];
  const trailing: T[] = [];
  const middle: T[] = [];

  for (const point of points) {
    if (near(start, point)) leading.push(point);
    else if (near(end, point)) trailing.push(point);
    else middle.push(point);
  }

  return { leading, middle, trailing };
}
