/**
 * Repairs stop ORDER, in both places it lives.
 *
 * Two faults, found 2026-10-19 after declared bundling made them visible:
 *
 *   1. RecurringStop.sortOrder collisions. addRouteStop used to assign the stop COUNT as the
 *      position, which collides with an existing one after any removal (fixed in 39b2665, but the
 *      rows it already wrote are still wrong).
 *   2. ServiceVisit.routeSequence on generated days drifting out of the route's order -- from the
 *      same inherited collisions, and from this week's bugs in reorder propagation and generation.
 *
 * The visible symptom was bundles silently not bundling: a declared walk-up has to be CONTIGUOUS
 * to be one card, so one stop landing between a pool and its spa splits them, and if that stop is
 * itself half of another walk-up it splits two at once.
 *
 * What it does:
 *   - Gathers each route's declared walk-ups together, then renumbers 0..N-1. Two walk-ups can be
 *     INTERLEAVED without any collision at all -- Rodrigo's Thursday runs Borgata Gym Spa, both
 *     Clarkson venues, then Borgata Gym Pool -- and a bundle has to be contiguous, so that alone
 *     stops it being one card. coalesceBundleMembers does the gathering: it only ever moves a stop
 *     to just after one it already shares a walk-up with, so the route's plan is untouched.
 *   - For each technician-day from today forward that is out of step, rebuilds routeSequence from
 *     the route's order via resequenceDay -- the same function the reorder endpoint uses, with the
 *     same rules about what may move (a still-SCHEDULED stop of that route) and what is pinned
 *     (anything arrived at, finished, skipped, moved, or not on the route, plus every errand).
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   npx tsx scripts/repair-stop-order.ts
 *   npx tsx scripts/repair-stop-order.ts --apply
 */
import { prisma } from "@/lib/prisma";
import { resequenceDay, type DaySequenceItem } from "@/lib/day-resequence";
import { coalesceBundleMembers } from "@/lib/stop-grouping";
import { localDayBounds, timeZoneForState, ymdInTimeZone } from "@/lib/timezone";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLYING\n" : "DRY RUN — nothing will be written. Pass --apply to write.\n");

  // ---- 1. route templates ----
  const routes = await prisma.recurringRoute.findMany({
    include: {
      technician: { select: { id: true, name: true } },
      stops: {
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        sortOrder: true,
        propertyId: true,
        bodyOfWater: { select: { type: true, serviceGroup: true } },
      },
    },
      organization: { select: { state: true } },
    },
  });

  let templateWrites = 0;
  /** The order each route SHOULD be in, kept so pass 2 resequences days against the repaired plan. */
  const repairedOrderByRoute = new Map<string, string[]>();

  for (const route of routes) {
    const gathered = coalesceBundleMembers(
      route.stops.map((stop) => ({
        id: stop.id,
        propertyId: stop.propertyId,
        latitude: null,
        longitude: null,
        bodyType: stop.bodyOfWater?.type ?? null,
        serviceGroup: stop.bodyOfWater?.serviceGroup ?? null,
      })),
    );
    repairedOrderByRoute.set(route.id, gathered.map((stop) => stop.id));

    const positionNow = new Map(route.stops.map((stop) => [stop.id, stop.sortOrder]));
    const needed = gathered.filter((stop, index) => positionNow.get(stop.id) !== index);
    if (needed.length === 0) continue;

    const movedByGathering = gathered.some((stop, index) => route.stops[index]?.id !== stop.id);
    console.log(
      `route ${route.name} (${route.technician?.name ?? "unassigned"}): ${needed.length} of ${route.stops.length} stops` +
        (movedByGathering ? " — walk-ups gathered" : " — renumbered only"),
    );
    templateWrites += needed.length;
    if (apply) {
      for (const [index, stop] of gathered.entries()) {
        if (positionNow.get(stop.id) === index) continue;
        await prisma.recurringStop.update({ where: { id: stop.id }, data: { sortOrder: index } });
      }
    }
  }
  console.log(`\n${templateWrites} route-stop positions ${apply ? "renumbered" : "would be renumbered"}.\n`);

  // ---- 2. generated days ----
  const now = new Date();
  let dayWrites = 0;

  for (const route of routes) {
    if (!route.technicianId || route.stops.length === 0) continue;
    const timeZone = timeZoneForState(route.organization.state);
    const todayStart = localDayBounds(ymdInTimeZone(now, timeZone), timeZone).start;

    // The repaired order from pass 1, so a dry run reports the end state rather than the old one.
    const stopIdsInOrder = repairedOrderByRoute.get(route.id) ?? route.stops.map((stop) => stop.id);

    const visits = await prisma.serviceVisit.findMany({
      where: { recurringStopId: { in: stopIdsInOrder }, scheduledStart: { gte: todayStart } },
      select: { scheduledStart: true, technicianId: true },
    });
    const days = [...new Set(visits.map((v) => ymdInTimeZone(v.scheduledStart, timeZone)))];

    for (const ymd of days) {
      const { start, end } = localDayBounds(ymd, timeZone);
      const [dayVisits, dayErrands] = await Promise.all([
        prisma.serviceVisit.findMany({
          where: { technicianId: route.technicianId, scheduledStart: { gte: start, lt: end } },
          select: { id: true, recurringStopId: true, routeSequence: true, scheduledStart: true, status: true },
        }),
        prisma.adHocStop.findMany({
          where: { technicianId: route.technicianId, scheduledDate: { gte: start, lt: end } },
          select: { id: true, routeSequence: true, createdAt: true },
        }),
      ]);

      const stopIdSet = new Set(stopIdsInOrder);
      const items: DaySequenceItem[] = [
        ...dayVisits.map((v) => ({
          kind: "visit" as const,
          id: v.id,
          seq: v.routeSequence,
          tiebreak: v.scheduledStart.getTime(),
          moveKey:
            v.status === "SCHEDULED" && v.recurringStopId != null && stopIdSet.has(v.recurringStopId)
              ? v.recurringStopId
              : null,
        })),
        ...dayErrands.map((e) => ({
          kind: "adhoc" as const,
          id: e.id,
          seq: e.routeSequence,
          tiebreak: e.createdAt.getTime(),
          moveKey: null,
        })),
      ];

      const writes = resequenceDay(items, stopIdsInOrder);
      if (writes.length === 0) continue;

      console.log(`${route.technician?.name ?? "unassigned"} ${ymd}: ${writes.length} of ${items.length} stops move`);
      dayWrites += writes.length;
      if (apply) {
        for (const write of writes) {
          if (write.kind === "adhoc") {
            await prisma.adHocStop.update({ where: { id: write.id }, data: { routeSequence: write.index } });
          } else {
            await prisma.serviceVisit.update({ where: { id: write.id }, data: { routeSequence: write.index } });
          }
        }
      }
    }
  }

  console.log(`\n${dayWrites} day positions ${apply ? "rewritten" : "would be rewritten"}.`);
  if (!apply) console.log("\nNothing was written. Re-run with --apply once this looks right.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
