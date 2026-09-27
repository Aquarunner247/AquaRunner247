import { prisma } from "@/lib/prisma";
import { timeZoneForState, ymdInTimeZone, localDayBounds } from "@/lib/timezone";

/**
 * Repairs AdHocStop.scheduledDate rows written before the timezone fix in
 * app/dashboard/actions.ts's addAdHocStop.
 *
 * The old code stored `new Date("<ymd>T00:00:00")`, which has no zone suffix and so parsed
 * in the server's zone -- always UTC on Vercel -- persisting midnight UTC. Every read
 * buckets these rows with localDayBounds in the ORG's zone, so for any org behind UTC the
 * stored instant lands in the PREVIOUS local day and the stop shows up a day early.
 *
 * This shifts each affected row to the org-local midnight of the day it was *meant* for:
 * the calendar date the old code was handed, which is the stored value's own UTC date.
 * Orgs in a zone at or ahead of UTC are unaffected and skipped.
 *
 * Idempotent: a row already sitting exactly on its org's local midnight is left alone, so
 * re-running shifts nothing a second time.
 *
 * Completed stops are skipped by default. A completed stop appeared to the technician on the
 * shifted day and was worked there, so its stored date is the truer record of when the work
 * happened -- re-dating it to the day originally picked would rewrite history to a day
 * nobody serviced. Pass --include-completed to move them anyway.
 *
 * Usage:
 *   npx tsx prisma/fix-adhoc-stop-timezone.ts                      # dry run, lists every change
 *   npx tsx prisma/fix-adhoc-stop-timezone.ts --apply              # writes
 *   npx tsx prisma/fix-adhoc-stop-timezone.ts --apply --org=<id>   # scope to one org
 *   npx tsx prisma/fix-adhoc-stop-timezone.ts --include-completed  # also re-date finished stops
 */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const orgArg = args.find((a) => a.startsWith("--org="));
  const organizationId = orgArg ? orgArg.slice("--org=".length) : undefined;
  const includeCompleted = args.includes("--include-completed");

  const stops = await prisma.adHocStop.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      ...(includeCompleted ? {} : { completed: false }),
    },
    orderBy: { scheduledDate: "asc" },
    select: {
      id: true,
      description: true,
      scheduledDate: true,
      organizationId: true,
      organization: { select: { state: true } },
      technician: { select: { name: true, email: true } },
    },
  });

  const planned: { id: string; from: Date; to: Date; label: string; shownBefore: string; shownAfter: string }[] = [];

  for (const stop of stops) {
    const timeZone = timeZoneForState(stop.organization.state);

    // The date the old code was handed is the stored instant's own UTC calendar date.
    const intendedYmd = stop.scheduledDate.toISOString().slice(0, 10);
    const correct = localDayBounds(intendedYmd, timeZone).start;
    if (correct.getTime() === stop.scheduledDate.getTime()) continue; // already right

    planned.push({
      id: stop.id,
      from: stop.scheduledDate,
      to: correct,
      label: `${stop.description.slice(0, 40)}${stop.description.length > 40 ? "…" : ""} [${
        stop.technician ? (stop.technician.name ?? stop.technician.email) : "unassigned"
      }]`,
      shownBefore: ymdInTimeZone(stop.scheduledDate, timeZone),
      shownAfter: ymdInTimeZone(correct, timeZone),
    });
  }

  if (planned.length === 0) {
    console.log(`No rows need fixing (${stops.length} checked).`);
    return;
  }

  console.log(
    `${planned.length} of ${stops.length} ad-hoc stop(s) would move${includeCompleted ? "" : " (completed stops excluded)"}:\n`,
  );
  for (const p of planned) {
    console.log(`  ${p.id}`);
    console.log(`    ${p.label}`);
    console.log(`    shows on ${p.shownBefore} -> ${p.shownAfter}   (${p.from.toISOString()} -> ${p.to.toISOString()})`);
  }

  if (!apply) {
    console.log("\nDry run only — nothing written. Re-run with --apply to make these changes.");
    return;
  }

  let updated = 0;
  for (const p of planned) {
    await prisma.adHocStop.update({ where: { id: p.id }, data: { scheduledDate: p.to } });
    updated += 1;
  }
  console.log(`\nUpdated ${updated} row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
