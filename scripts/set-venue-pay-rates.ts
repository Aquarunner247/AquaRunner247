/**
 * Fills in the pay rate for every venue that does not have one, from the rule the owner stated
 * on 2026-11-14: every venue pays $20, except Pacific Harbors at $30 and Tailgate Beach Club at
 * $50, and a spa's pay is bundled into the pool it is serviced with rather than paid separately.
 *
 * DRY RUN BY DEFAULT: prints the table it would write and changes nothing. Pass --apply to write.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/set-venue-pay-rates.ts --org=Lindley
 *   node --env-file=.env node_modules/.bin/tsx scripts/set-venue-pay-rates.ts --org=Lindley --apply
 *
 * ALWAYS PASS --org. The database is multi-tenant and holds demo and test organizations next to
 * the real one; without a filter this would invent pay rates for every one of them.
 *
 * `.env` points DATABASE_URL at the LOCAL Supabase stack, so the commands above act on your dev
 * database. To act on production, set it for the one command -- a shell value wins, because
 * node --env-file does not override an already-set variable:
 *
 *   DATABASE_URL="<production connection string>" npm run db:set-venue-pay-rates -- --org=Lindley --apply
 *
 * REQUIRES the 20261114230000_venue_pay_rates migration to be applied first; it writes
 * VenuePayRate, which does not exist under that name before it.
 *
 * It derives the rate from the rule instead of carrying a list of venue ids, so it stays correct
 * as venues are added and the printed table is evidence rather than something typed in by hand.
 *
 * SAFE TO RE-RUN. It only ever considers a venue with NO active rate, so an existing rate -- and
 * any rate an admin has since changed by hand -- is left exactly as it is. A second run with
 * nothing left to do reports that and writes nothing.
 *
 * WHY THE EFFECTIVE DATE MATTERS, and why it defaults to the start of the open pay period:
 * earnings are looked up by the rate in force on the visit's own completion date, so this date
 * decides how much already-completed work becomes visible in a technician's estimate. Dating the
 * rates to the start of the current period credits work that has not been paid out yet and leaves
 * every closed period exactly as the technicians already saw it. Pass --effective-date=YYYY-MM-DD
 * to choose differently -- a venue's first visit, say, to credit the whole history.
 */
import { prisma } from "@/lib/prisma";
import { createPayRateRow, getOrgPayrollSettings, getPayPeriodBounds } from "@/lib/technician-pay";
import { printDatabaseTarget } from "./db-target";

const APPLY = process.argv.includes("--apply");

/**
 * Limits the run to organizations whose name contains this, case-insensitively. Always pass it
 * when writing: this app is multi-tenant and holds demo and test organizations alongside the real
 * one, and a blanket run would quietly invent pay rates for all of them.
 */
const ORG_FILTER = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) ?? null;

/** Every venue pays this unless its property appears in RATE_BY_PROPERTY below. */
const DEFAULT_RATE = 20;

/**
 * Properties that pay something other than DEFAULT_RATE, keyed on the property name exactly as it
 * reads in the app. A name that matches no property is reported rather than ignored, so a rename
 * surfaces as a line to read instead of silently reverting that property to $20.
 */
const RATE_BY_PROPERTY: Record<string, number> = {
  "Pacific Harbors": 30,
  "Tailgate Beach Club": 50,
};

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function parseEffectiveDate(): Date | null {
  const arg = process.argv.find((a) => a.startsWith("--effective-date="));
  if (!arg) return null;
  const raw = arg.slice("--effective-date=".length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`--effective-date must be YYYY-MM-DD, got "${raw}"`);
  }
  // Midnight UTC, matching how the server actions build this @db.Date value.
  return new Date(`${raw}T00:00:00.000Z`);
}

type Plan = {
  bodyOfWaterId: string;
  property: string;
  venue: string;
  rateAmount: number;
  isBundled: boolean;
  bundledIntoBodyOfWaterId: string | null;
  bundledIntoLabel: string | null;
};

async function main() {
  printDatabaseTarget(APPLY);

  const override = parseEffectiveDate();

  const organizations = await prisma.organization.findMany({
    where: ORG_FILTER ? { name: { contains: ORG_FILTER, mode: "insensitive" } } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (ORG_FILTER) {
    console.log(`Organizations matching "${ORG_FILTER}": ${organizations.length || "none"}`);
    if (organizations.length > 0) console.log(`  ${organizations.map((o) => o.name).join(", ")}`);
  } else {
    console.log(`ALL ${organizations.length} organizations -- pass --org=<name> to narrow this.`);
  }
  console.log();

  let written = 0;
  const skipped: string[] = [];

  for (const org of organizations) {
    const bodies = await prisma.bodyOfWater.findMany({
      where: { property: { organizationId: org.id } },
      select: {
        id: true,
        name: true,
        type: true,
        serviceGroup: true,
        propertyId: true,
        property: { select: { name: true } },
      },
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
    });
    if (bodies.length === 0) continue;

    const rated = new Set(
      (
        await prisma.venuePayRate.findMany({
          where: { organizationId: org.id, isActive: true },
          select: { bodyOfWaterId: true },
        })
      ).map((r) => r.bodyOfWaterId),
    );

    const unrated = bodies.filter((b) => !rated.has(b.id));
    if (unrated.length === 0) continue;

    // The effective date comes from THIS org's own pay cycle, not a global assumption -- the app
    // is white-labeled and another org may be weekly or monthly.
    let effectiveDate = override;
    if (!effectiveDate) {
      const settings = await getOrgPayrollSettings(org.id);
      const { start } = getPayPeriodBounds(settings, new Date());
      // getPayPeriodBounds works in local time; the column is a @db.Date, so take the calendar
      // day it landed on and pin it to midnight UTC rather than letting a timezone shift it.
      effectiveDate = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    }

    const plans: Plan[] = [];
    for (const body of unrated) {
      // A spa is paid through the pool it is serviced alongside. serviceGroup is the existing,
      // technician-facing notion of "these are done together" (see scripts/backfill-service-groups.ts),
      // so the pairing is read from the data rather than guessed from the names.
      if (body.type === "SPA") {
        const pairedPool = body.serviceGroup
          ? bodies.find(
              (b) =>
                b.propertyId === body.propertyId &&
                b.id !== body.id &&
                b.type === "POOL" &&
                b.serviceGroup === body.serviceGroup,
            )
          : undefined;
        if (!pairedPool) {
          // Never guessed. A spa with no same-group pool is left for a person to decide, because
          // the wrong pairing writes a $0 rate and quietly pays the technician nothing for it.
          skipped.push(
            `${org.name}: ${body.property.name} -- ${body.name} is a spa with ` +
              (body.serviceGroup
                ? `no pool in service group "${body.serviceGroup}"`
                : "no service group") +
              ", so there is nothing to bundle it into. Set this one by hand.",
          );
          continue;
        }
        plans.push({
          bodyOfWaterId: body.id,
          property: body.property.name,
          venue: body.name,
          rateAmount: 0,
          isBundled: true,
          bundledIntoBodyOfWaterId: pairedPool.id,
          bundledIntoLabel: pairedPool.name,
        });
        continue;
      }

      plans.push({
        bodyOfWaterId: body.id,
        property: body.property.name,
        venue: body.name,
        rateAmount: RATE_BY_PROPERTY[body.property.name] ?? DEFAULT_RATE,
        isBundled: false,
        bundledIntoBodyOfWaterId: null,
        bundledIntoLabel: null,
      });
    }

    if (plans.length === 0) continue;

    console.log(`${org.name} -- ${plans.length} venue(s) without a rate, effective ${effectiveDate.toISOString().slice(0, 10)}:`);
    for (const p of plans) {
      const detail = p.isBundled ? `bundled into ${p.bundledIntoLabel}` : money(p.rateAmount);
      console.log(`  ${p.property} -- ${p.venue}: ${detail}`);
    }

    if (APPLY) {
      for (const p of plans) {
        await createPayRateRow({
          organizationId: org.id,
          bodyOfWaterId: p.bodyOfWaterId,
          rateAmount: p.rateAmount,
          isBundled: p.isBundled,
          bundledIntoBodyOfWaterId: p.bundledIntoBodyOfWaterId,
          effectiveDate,
          createdByUserId: null,
        });
        written++;
      }
    }
    console.log();
  }

  // Reported after the table, so a renamed property is noticed rather than buried mid-list.
  const propertyNames = new Set(
    (
      await prisma.property.findMany({
        where: { organizationId: { in: organizations.map((o) => o.id) } },
        select: { name: true },
      })
    ).map((p) => p.name),
  );
  for (const name of Object.keys(RATE_BY_PROPERTY)) {
    if (!propertyNames.has(name)) {
      skipped.push(
        `No property is named "${name}", so its ${money(RATE_BY_PROPERTY[name])} rate matched nothing. ` +
          "If it was renamed, update RATE_BY_PROPERTY in this script.",
      );
    }
  }

  if (skipped.length > 0) {
    console.log("Needs a person:");
    for (const line of skipped) console.log(`  - ${line}`);
    console.log();
  }

  if (APPLY) {
    console.log(`Wrote ${written} pay rate(s).`);
  } else {
    console.log("Dry run -- nothing was written. Re-run with --apply to write these rates.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
