import { mergeRouteOrderIntoDay } from "@/lib/route-order-merge";

/**
 * One item on a technician's day, from either table that shares the sequence space.
 *
 * routeSequence is a single ordering per technician per day, spanning ServiceVisit and AdHocStop
 * alike (see AdHocStop.routeSequence). Anything that writes positions has to reason about the
 * whole day or it writes on top of numbers something else already holds.
 */
export type DaySequenceItem = {
  kind: "visit" | "adhoc";
  id: string;
  /** Current position. Null/absent sorts last, the same way the schedule reads it. */
  seq: number | null;
  /** Breaks ties between equal positions, as the schedule does: scheduledStart, then createdAt. */
  tiebreak: number;
  /** The route stop this is, when it may be moved into the route's order. Null pins it. */
  moveKey: string | null;
};

export type SequenceWrite = { kind: "visit" | "adhoc"; id: string; index: number };

/**
 * Works out the positions to write so a day matches a route's order.
 *
 * Returns ONLY the items whose position actually changes, so an already-correct day costs no
 * writes at all -- which matters because visit generation calls this on a path that runs whenever
 * somebody opens a schedule.
 *
 * Shared by the two things that reorder a day: an admin reordering the route, and visit generation
 * adding stops to a day that already exists. They had the same bug independently, so they now have
 * one implementation of the answer.
 */
export function resequenceDay(items: DaySequenceItem[], newRouteOrder: string[]): SequenceWrite[] {
  const sorted = [...items].sort(
    (a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER) || a.tiebreak - b.tiebreak,
  );
  const byId = new Map(sorted.map((item) => [item.id, item]));
  const merged = mergeRouteOrderIntoDay(
    sorted.map(({ id, moveKey }) => ({ id, moveKey })),
    newRouteOrder,
  );

  const writes: SequenceWrite[] = [];
  merged.forEach((id, index) => {
    const item = byId.get(id);
    if (!item || item.seq === index) return;
    writes.push({ kind: item.kind, id, index });
  });
  return writes;
}
