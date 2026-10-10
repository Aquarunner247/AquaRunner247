/**
 * "Finish the stop you're on before you start another property."
 *
 * Kept pure (no Prisma client, no server-only) so the rules below can be unit-tested, same pattern
 * as lib/customer-tasks.ts and lib/plan-tiers-core.ts. The arrival route owns the query; this owns
 * what counts as blocking.
 */

export type OpenStop = {
  id: string;
  propertyId: string;
  propertyName: string;
  bodyName: string | null;
};

/**
 * Prisma `where` for the stops that could block this technician from starting somewhere else.
 *
 * Three conditions, and the last two matter more than they look:
 *
 *  - IN_PROGRESS, scoped to one technician. Two technicians working two properties at the same
 *    time is the normal shape of a work day, not something to prevent.
 *
 *  - `pushedAt: null`. The nightly sweep stamps pushedAt on anything still IN_PROGRESS after its
 *    own scheduled day ended (app/api/cron/send-pending-summaries). Those stops are abandoned, not
 *    active -- nobody is coming back to them.
 *
 *  - Started within the window, by `startedAt` -- NOT by `scheduledStart`.
 *
 *    This is the subtle one. Technicians here routinely work a stop days after the day it was
 *    scheduled for: Elkhorn Pointe was scheduled 2026-10-08 and arrived at 2026-10-09 15:16.
 *    Scoping by scheduled day got that exactly backwards in both directions -- a stop genuinely
 *    open on the technician's phone right now would not block, because its scheduled day was
 *    yesterday, while a stale stop from a catch-up day could block work that has nothing to do
 *    with it. "What did you start and not finish" is a question about when work began, which is
 *    what startedAt records. Every IN_PROGRESS visit has one, because arrival is the only thing
 *    that sets that status.
 *
 *    The window exists so a cron outage cannot lock a technician out: without it, one stop left
 *    open and never swept would refuse every future arrival, which is far worse than the problem
 *    this gate solves.
 */
export function openStopsBlockingStartWhere(technicianId: string, startedFrom: Date, startedBefore: Date) {
  return {
    technicianId,
    status: "IN_PROGRESS" as const,
    pushedAt: null,
    startedAt: { gte: startedFrom, lt: startedBefore },
  };
}

/**
 * The stop standing in the way of starting at `targetPropertyId`, or null if nothing is.
 *
 * A stop at the SAME property never blocks. One walk-up routinely holds a pool, a spa, and a
 * splash pad, and a technician is expected to have several of them open at once -- the whole
 * photo-bundling and shared-summary design assumes exactly that. The rule is about driving to a
 * different address with work left behind, not about working one property's water in parallel.
 *
 * Returns the first blocker rather than all of them: the technician only needs to be sent back to
 * one place, and it is the one they are standing furthest from finishing.
 */
export function blockingStopFor(openStops: OpenStop[], targetPropertyId: string): OpenStop | null {
  return openStops.find((stop) => stop.propertyId !== targetPropertyId) ?? null;
}

/** What the technician is told, naming the stop so they know where to go back to. */
export function blockedStartMessage(blocker: OpenStop): string {
  const where = blocker.bodyName ? `${blocker.propertyName} — ${blocker.bodyName}` : blocker.propertyName;
  return `Finish ${where} before starting another property. If you can't service it, skip it from the schedule first.`;
}
