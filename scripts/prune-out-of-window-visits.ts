/**
 * Clears SCHEDULED visits that fall outside their route's startsOn/endsOn service window.
 *
 * Why this exists: visits are generated ahead of the day they run, so a window set on a route
 * that had already generated visits leaves those earlier rows behind -- they keep showing on the
 * schedule and inflate the day's stop count. updateRouteWindow now clears them whenever a window
 * is saved, so this script is only needed for routes whose window was set BEFORE that fix
 * shipped. Re-saving each route's window in the UI does the same thing.
 *
 * DRY RUN BY DEFAULT: prints what it would delete and changes nothing. Pass --apply to delete.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/prune-out-of-window-visits.ts
 *   node --env-file=.env node_modules/.bin/tsx scripts/prune-out-of-window-visits.ts --apply
 *
 * Only SCHEDULED visits are ever touched, the same rule deleteRoute and removeRouteStop follow:
 * anything started or completed is the service record and stays under the customer, even if it
 * happened on a day the window now excludes. A visit with readings, photos or a completion is
 * therefore never at risk here regardless of which flag you pass.
 */
import { prisma } from "@/lib/prisma";
import { timeZoneForState, formatLocalDate, ymdInTimeZone } from "@/lib/timezone";
import { serviceWindowExclusionBounds, ymdOfDateColumn } from "@/lib/route-service-window";

const APPLY = process.argv.includes("--apply");

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function main() {
  const routes = await prisma.recurringRoute.findMany({
    where: { OR: [{ startsOn: { not: null } }, { endsOn: { not: null } }] },
    select: {
      id: true,
      name: true,
      dayOfWeek: true,
      startsOn: true,
      endsOn: true,
      technician: { select: { name: true, email: true } },
      organization: { select: { name: true, state: true } },
    },
    orderBy: [{ organizationId: "asc" }, { dayOfWeek: "asc" }],
  });

  if (routes.length === 0) {
    console.log("No routes have a service window set. Nothing to do.");
    return;
  }

  console.log(
    `${APPLY ? "APPLYING" : "DRY RUN"} — ${routes.length} route${routes.length === 1 ? "" : "s"} with a service window.\n`,
  );

  let totalStray = 0;
  let totalDeleted = 0;
  let totalProtected = 0;

  for (const route of routes) {
    const timeZone = timeZoneForState(route.organization.state);
    const { before, after } = serviceWindowExclusionBounds(route.startsOn, route.endsOn, timeZone);
    if (!before && !after) continue;

    const outsideWindow = [
      ...(before ? [{ scheduledStart: { lt: before } }] : []),
      ...(after ? [{ scheduledStart: { gte: after } }] : []),
    ];

    // Read every status, not just SCHEDULED, so the report can state plainly how many
    // out-of-window visits are being deliberately LEFT because they hold real service records.
    const stray = await prisma.serviceVisit.findMany({
      where: { recurringStop: { routeId: route.id }, OR: outsideWindow },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        property: { select: { name: true } },
        bodyOfWater: { select: { name: true } },
      },
      orderBy: { scheduledStart: "asc" },
    });
    if (stray.length === 0) continue;

    const scheduled = stray.filter((v) => v.status === "SCHEDULED");
    const protectedVisits = stray.filter((v) => v.status !== "SCHEDULED");
    totalStray += stray.length;
    totalProtected += protectedVisits.length;

    // dayOfWeek is nullable (a route need not be tied to a weekday), so it's only a fallback
    // for an unnamed route.
    const label = route.name.trim() || (route.dayOfWeek != null ? DAY_NAMES[route.dayOfWeek] : null) || "unnamed route";
    const tech = route.technician?.name ?? route.technician?.email ?? "unassigned";
    const window = [
      route.startsOn ? `starts ${ymdOfDateColumn(route.startsOn)}` : "no start",
      route.endsOn ? `ends ${ymdOfDateColumn(route.endsOn)}` : "never ends",
    ].join(", ");

    console.log(`${route.organization.name} — ${label} (${tech}) — ${window}`);

    const byDay = new Map<string, number>();
    for (const v of scheduled) {
      const ymd = ymdInTimeZone(v.scheduledStart, timeZone);
      byDay.set(ymd, (byDay.get(ymd) ?? 0) + 1);
    }
    for (const [ymd, count] of [...byDay.entries()].sort()) {
      console.log(`    ${ymd}: ${count} scheduled visit${count === 1 ? "" : "s"} outside the window`);
    }

    if (protectedVisits.length > 0) {
      console.log(
        `    KEEPING ${protectedVisits.length} visit${protectedVisits.length === 1 ? "" : "s"} with a service record:`,
      );
      for (const v of protectedVisits) {
        console.log(
          `      ${formatLocalDate(v.scheduledStart, timeZone)} ${v.property.name} — ${v.bodyOfWater?.name ?? "?"} (${v.status})`,
        );
      }
    }

    if (APPLY && scheduled.length > 0) {
      const result = await prisma.serviceVisit.deleteMany({
        where: { id: { in: scheduled.map((v) => v.id) }, status: "SCHEDULED" },
      });
      totalDeleted += result.count;
      console.log(`    deleted ${result.count}`);
    }
    console.log();
  }

  if (totalStray === 0) {
    console.log("Every route's generated visits already sit inside its window. Nothing to do.");
    return;
  }

  const deletable = totalStray - totalProtected;
  if (APPLY) {
    console.log(`Deleted ${totalDeleted} scheduled visit${totalDeleted === 1 ? "" : "s"}.`);
    if (totalProtected > 0) console.log(`Left ${totalProtected} with a service record untouched.`);
  } else {
    console.log(
      `Would delete ${deletable} scheduled visit${deletable === 1 ? "" : "s"}` +
        (totalProtected > 0 ? `, leaving ${totalProtected} with a service record untouched` : "") +
        ".\nNothing was changed. Re-run with --apply to delete them.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
