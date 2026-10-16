/**
 * Applies a route's new stop order to a day that may hold more than that route.
 *
 * ServiceVisit.routeSequence is ONE sequence space per technician per day, shared by every visit
 * and every errand on it (see AdHocStop.routeSequence) -- not a per-route one. So a route's new
 * 0..N positions cannot simply be written onto a day: on a day that also holds other work those
 * numbers collide with the ones that work already occupies, and the order within each colliding
 * pair falls to whatever the tiebreak happens to be. That is exactly what happened to Rich's
 * Friday on 2026-10-16, which also carries Ritiro and Fifty101.
 *
 * So the whole day is rebuilt instead, and every item comes out with a distinct position.
 *
 * Two kinds of item:
 *
 *   - MOVABLE (`moveKey` set): a still-scheduled stop belonging to the route being reordered.
 *     These take the route's new order.
 *   - FIXED (`moveKey` null): everything else -- errands, visits from elsewhere, and anything
 *     already arrived at, finished, skipped or moved. A completed stop must not be shuffled into
 *     the middle of the day it was already serviced at the start of.
 *
 * A fixed item keeps the movable stop it currently sits behind, and travels with it. If Ritiro
 * follows Pacific Harbors today, it follows Pacific Harbors wherever Pacific Harbors lands --
 * adjacency is usually why it was put there. Fixed items ahead of every movable stop stay at the
 * front, which is where a morning's completed work belongs.
 */
export type DayOrderItem = {
  id: string;
  /** The route stop this item is, when it is one that may move. Null means pinned to its anchor. */
  moveKey: string | null;
};

export function mergeRouteOrderIntoDay(
  /** The day's items in the order they are currently shown. */
  current: DayOrderItem[],
  /** The route's stop ids, in the route's new order. May include stops not on this day. */
  newRouteOrder: string[],
): string[] {
  const leading: string[] = [];
  const trailers = new Map<string, string[]>();
  const movableOrder: string[] = [];

  let anchor: string | null = null;
  for (const item of current) {
    if (item.moveKey != null) {
      anchor = item.moveKey;
      movableOrder.push(item.moveKey);
      if (!trailers.has(item.moveKey)) trailers.set(item.moveKey, []);
      continue;
    }
    if (anchor == null) leading.push(item.id);
    else trailers.get(anchor)!.push(item.id);
  }

  const idByMoveKey = new Map(current.filter((i) => i.moveKey != null).map((i) => [i.moveKey!, i.id]));

  // The route's order first, then any movable stop the route no longer lists -- it is still on the
  // day and still has to come out somewhere, so it holds its existing relative place at the end
  // rather than vanishing from the sequence.
  const ordered = [
    ...newRouteOrder.filter((key) => idByMoveKey.has(key)),
    ...movableOrder.filter((key) => !newRouteOrder.includes(key)),
  ];

  const result = [...leading];
  for (const key of ordered) {
    result.push(idByMoveKey.get(key)!);
    result.push(...(trailers.get(key) ?? []));
  }
  return result;
}
