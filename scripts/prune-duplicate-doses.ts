/**
 * Removes chemical-dose rows that are duplicates of one another -- the same dose logged two or three
 * times because a request was repeated, not because the technician poured twice.
 *
 * DRY RUN BY DEFAULT: prints what it would delete and changes nothing. Pass --apply to delete.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/prune-duplicate-doses.ts
 *   node --env-file=.env node_modules/.bin/tsx scripts/prune-duplicate-doses.ts --apply
 *
 * The cause is fixed going forward (the Add dose button now disables while in flight, and
 * app/api/visits/[id]/doses/route.ts returns the existing row for an identical dose inside a minute
 * rather than creating another). This exists for the rows written before that.
 *
 * It finds duplicates rather than taking a hardcoded list, so it stays useful if the pattern ever
 * reappears -- and so the report is the evidence, not something typed in by hand.
 *
 * What counts as a duplicate, deliberately narrow:
 *   - same visit, same chemical product, same quantity, AND
 *   - every row in the group created within WINDOW_SECONDS of the first.
 *
 * A genuine second pour is never caught by that: a technician adding more chlorine enters a larger
 * quantity, not the same amount twice inside a minute. The EARLIEST row of each group is always kept,
 * so the dose itself, its cost and its charge survive exactly as first recorded.
 */
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

/** Matches the server-side idempotency window in app/api/visits/[id]/doses/route.ts. */
const WINDOW_SECONDS = 60;

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

async function main() {
  const doses = await prisma.visitChemicalDose.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      visitId: true,
      chemicalProductId: true,
      productName: true,
      quantity: true,
      unit: true,
      unitCharge: true,
      createdAt: true,
      visit: {
        select: {
          completedAt: true,
          scheduledStart: true,
          property: { select: { name: true } },
          bodyOfWater: { select: { name: true } },
        },
      },
    },
  });

  // Key on the things that must all match for this to be the same dose. A null product id is keyed
  // on the snapshotted name instead, so a dose whose product was later deleted still groups.
  const groups = new Map<string, typeof doses>();
  for (const d of doses) {
    const key = [d.visitId, d.chemicalProductId ?? `name:${d.productName}`, d.quantity.toString(), d.unit].join("|");
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }

  let groupsAffected = 0;
  let rowsToDelete = 0;
  let overcharge = 0;
  const idsToDelete: string[] = [];

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    // Already ordered by createdAt ascending.
    const first = rows[0];
    const last = rows[rows.length - 1];
    const spanSeconds = (last.createdAt.getTime() - first.createdAt.getTime()) / 1000;
    if (spanSeconds > WINDOW_SECONDS) continue; // spread out: treat as real, separate doses

    const extras = rows.slice(1);
    const qty = Number(first.quantity);
    const charge = first.unitCharge != null ? Number(first.unitCharge) : 0;
    const perRow = qty * charge;

    groupsAffected++;
    rowsToDelete += extras.length;
    overcharge += perRow * extras.length;
    idsToDelete.push(...extras.map((e) => e.id));

    const day = (first.visit.completedAt ?? first.visit.scheduledStart).toISOString().slice(0, 10);
    const where = `${first.visit.property.name}${first.visit.bodyOfWater ? ` — ${first.visit.bodyOfWater.name}` : ""}`;
    console.log(`${day}  ${where}`);
    console.log(
      `    ${first.productName}: ${qty} ${first.unit} logged ${rows.length}x within ${Math.round(spanSeconds)}s`,
    );
    console.log(
      `    charged ${money(perRow * rows.length)} → should be ${money(perRow)}  (over by ${money(perRow * extras.length)})`,
    );
    console.log(`    keeping  ${first.id}  (${first.createdAt.toISOString()})`);
    for (const e of extras) {
      console.log(`    ${APPLY ? "deleting" : "would delete"}  ${e.id}  (${e.createdAt.toISOString()})`);
    }
    console.log();
  }

  if (groupsAffected === 0) {
    console.log("No duplicate doses found. Nothing to do.");
    return;
  }

  console.log(
    `${groupsAffected} duplicated dose${groupsAffected === 1 ? "" : "s"} across ${rowsToDelete} extra row${rowsToDelete === 1 ? "" : "s"}, ${money(overcharge)} overcharged.`,
  );

  if (!APPLY) {
    console.log("\nNothing was changed. Re-run with --apply to delete the extra rows.");
    return;
  }

  const result = await prisma.visitChemicalDose.deleteMany({ where: { id: { in: idsToDelete } } });
  console.log(`\nDeleted ${result.count} row${result.count === 1 ? "" : "s"}.`);
  console.log(
    "The chemical usage & billing report on the dashboard recalculates from these rows on every load,\n" +
      "so it is correct immediately. Service summary emails already sent are unchanged -- they were\n" +
      "rendered at the time and are not re-sent.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
