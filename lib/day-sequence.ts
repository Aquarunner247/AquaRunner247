import type { Prisma } from "@/generated/prisma/client";

/**
 * Where a stop goes when it joins a day it was not generated onto.
 *
 * `routeSequence` is ONE sequence space per technician per day, shared by `ServiceVisit` and
 * `AdHocStop` -- position 4 on Thursday is a different place from position 4 on Wednesday, and a
 * number only means something relative to the other stops on its own day.
 *
 * That is the rule the move-to-next-working-day path broke: it copied the source day's
 * `routeSequence` onto the target day verbatim. On 2026-10-22 Fifty101's Spa and Pool were moved
 * from Wednesday carrying positions 4 and 6, which on Thursday collided with Cornerstone Park's
 * Office Spa (already 4) and left Office Pool (5) wedged between the two Fifty101 bodies. Two
 * walk-ups that should have been one card each rendered as four, because grouping requires the
 * bodies of a service group to be CONTIGUOUS -- see lib/stop-grouping.ts.
 *
 * Anything adding a stop to a day computes its position here instead.
 */

/** The positions already taken on a day, from both tables that share the sequence space. */
export type TakenPositions = {
  visits: { routeSequence: number | null }[];
  adHocStops: { routeSequence: number | null }[];
};

/**
 * The next free position at the end of a day.
 *
 * Appending, deliberately, rather than inserting next to a stop's bundle siblings: inserting
 * mid-day means renumbering every stop after the insert point, under a technician who may be
 * part-way through that list. A stop moved onto a day is new work at the end of it. Moving both
 * bodies of a walk-up still lands them adjacent, because the second append follows the first.
 *
 * The one case this does not cover is moving ONE body onto a day where its sibling is already
 * scheduled from the route -- that pair stays split, and renumbering to join them is a deliberate
 * reorder the operator should make by dragging.
 */
export function nextRouteSequence({ visits, adHocStops }: TakenPositions): number {
  let highest = -1;
  for (const row of [...visits, ...adHocStops]) {
    if (row.routeSequence != null && row.routeSequence > highest) highest = row.routeSequence;
  }
  return highest + 1;
}

/**
 * `nextRouteSequence` against the database, for one technician's day.
 *
 * `dayStart`/`dayEnd` must come from `localDayBounds` in the ORG's zone, end exclusive -- the same
 * window every read of these rows uses. Bracketing the day with the server's own clock is a
 * separate bug this repo has already fixed once.
 *
 * Takes a client so a caller inside `$transaction` can pass its `tx` and have the read and the
 * write that depends on it see the same snapshot.
 */
export async function nextRouteSequenceForDay(
  client: Prisma.TransactionClient,
  params: { organizationId: string; technicianId: string; dayStart: Date; dayEnd: Date },
): Promise<number> {
  const { organizationId, technicianId, dayStart, dayEnd } = params;
  const [visits, adHocStops] = await Promise.all([
    client.serviceVisit.findMany({
      where: { organizationId, technicianId, scheduledStart: { gte: dayStart, lt: dayEnd } },
      select: { routeSequence: true },
    }),
    client.adHocStop.findMany({
      where: { organizationId, technicianId, scheduledDate: { gte: dayStart, lt: dayEnd } },
      select: { routeSequence: true },
    }),
  ]);
  return nextRouteSequence({ visits, adHocStops });
}
