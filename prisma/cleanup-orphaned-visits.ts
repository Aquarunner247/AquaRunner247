import { prisma } from "@/lib/prisma";

/**
 * One-time cleanup for visits orphaned by route/stop deletions made before the
 * fix in app/dashboard/routes/actions.ts (deleteRoute/removeRouteStop now
 * remove these themselves going forward).
 *
 * A SCHEDULED visit with no recurringStopId can only exist here because its
 * originating RecurringStop was deleted out from under it — every other
 * ServiceVisit.create() call site either sets recurringStopId or creates the
 * visit as COMPLETED (historical import), never SCHEDULED + unlinked.
 *
 * Usage:
 *   npx tsx prisma/cleanup-orphaned-visits.ts            # dry run, lists what would be deleted
 *   npx tsx prisma/cleanup-orphaned-visits.ts --apply     # actually deletes
 *   npx tsx prisma/cleanup-orphaned-visits.ts --apply --org=<organizationId>  # scope to one org
 */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const orgArg = args.find((a) => a.startsWith("--org="));
  const organizationId = orgArg ? orgArg.slice("--org=".length) : undefined;

  const where = {
    status: "SCHEDULED" as const,
    recurringStopId: null,
    ...(organizationId ? { organizationId } : {}),
  };

  const orphans = await prisma.serviceVisit.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      scheduledStart: true,
      technician: { select: { name: true, email: true } },
      property: { select: { name: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  if (orphans.length === 0) {
    console.log("No orphaned scheduled visits found.");
    return;
  }

  console.log(`Found ${orphans.length} orphaned scheduled visit(s):\n`);
  for (const v of orphans) {
    const tech = v.technician ? `${v.technician.name} <${v.technician.email}>` : "(unassigned)";
    console.log(
      `  ${v.id}  org=${v.organizationId}  ${v.scheduledStart.toISOString()}  ${v.property.name}  tech=${tech}`,
    );
  }

  if (!apply) {
    console.log("\nDry run only — re-run with --apply to delete these.");
    return;
  }

  const { count } = await prisma.serviceVisit.deleteMany({ where });
  console.log(`\nDeleted ${count} orphaned visit(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
