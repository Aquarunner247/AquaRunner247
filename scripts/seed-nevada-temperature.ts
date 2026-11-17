/**
 * Adds Nevada's spa water-temperature rule to the live ComplianceRuleset.
 *
 * Why this is a script and not a seed run: prisma/seed-compliance-data.ts is the source of
 * truth for new environments, but it deletes and recreates every child row of the state it
 * seeds, and its own header says it must never run against production. This touches the four
 * things that actually changed and nothing else.
 *
 * What it writes, all scoped to the NV ruleset:
 *   1. a ChemistryThreshold row -- TEMPERATURE, SPA, max 104 degF, hazard above 104 degF
 *   2. the existing closure EventProtocol's trigger label and reopening condition, so they
 *      name spa temperature alongside pH and cyanuric acid
 *   3. the ruleset's referenceContent, which is the rules page an admin reads in the app
 *   4. a ComplianceNote recording that 104 is the standard figure and the operator's own log
 *      sheet rather than a cited SNHD section number
 *
 * It does NOT touch any reading, visit or body of water -- only this state's rule rows. The
 * assumption behind it is that SNHD caps spa water at 104 degF and sets no pool maximum. If
 * that is wrong, the visible effect is a closure-risk banner on a spa above 104 that SNHD
 * would not actually close, and the fix is to delete the one row this adds.
 *
 * Idempotent: it skips any of the four that is already in place, so re-running is safe.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   npm run db:seed-nevada-temperature            # prints what it would do, changes nothing
 *   npm run db:seed-nevada-temperature -- --apply
 */
import { prisma } from "@/lib/prisma";
import { printDatabaseTarget } from "./db-target";

const STATE = "NV";
const SPA_MAX_F = 104;

const TRIGGER_LABEL = "pH, cyanuric acid, or spa temperature outside the hazard range";
const REOPENING_CONDITION = "Return pH to 6.5–8.0, cyanuric acid to ≤100 ppm, and spa temperature to ≤104°F.";

const NOTE_SUMMARY =
  "Clark County's 104 °F spa temperature ceiling is the standard figure and the operator's own log sheet, not a cited SNHD section number.";
const NOTE_DETAIL =
  "104 °F is seeded as Clark County's spa ceiling and closure trigger on two grounds: it is the figure 17 of the 19 states with a spa-scoped TEMPERATURE row in prisma/seed-compliance-data.ts publish, and the operator confirms SNHD's paper log sheet carries a Temp column. No SNHD section number is cited for it here, unlike the chlorine, pH, alkalinity and CYA numbers, which is why sourceConfidence is 'assumption'. Pools are deliberately left with no maximum rather than given a guessed one.";

/** The lines added to referenceContent, anchored on text that is already there so a second
 * run cannot append them twice and a reworded page fails loudly instead of being mangled. */
const TARGET_ANCHOR = "- **Cyanuric acid:** 30 – 50 ppm, tested at least once every 30 days";
const TARGET_ADDITION = `
- **Spa water temperature:** maximum 104°F. Pools have no maximum; the temperature is
  still logged, because SNHD's log sheet has a column for it`;
const HAZARD_ANCHOR = "- **Cyanuric acid:** above 100 ppm";
const HAZARD_ADDITION = `
- **Spa water temperature:** above 104°F`;

async function main() {
  const apply = process.argv.includes("--apply");
  // First, before any query: .env points DATABASE_URL at the LOCAL stack, so an unqualified
  // `npm run db:seed-nevada-temperature -- --apply` writes to localhost and reports success.
  printDatabaseTarget(apply, "Nevada's temperature rule will be written");

  const ruleset = await prisma.complianceRuleset.findUnique({
    where: { state: STATE },
    select: {
      id: true,
      stateName: true,
      referenceContent: true,
      chemistryThresholds: {
        where: { parameter: "TEMPERATURE" },
        select: { id: true, bodyOfWaterCategory: true, maxValue: true, hazardMax: true },
      },
      eventProtocols: { select: { id: true, triggerLabel: true, reopeningCondition: true } },
      complianceNotes: { select: { id: true, summary: true } },
    },
  });

  if (!ruleset) {
    console.error(`No ComplianceRuleset row for state "${STATE}". Run prisma/seed-compliance-rulesets.ts first.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${STATE} (${ruleset.stateName}):\n`);

  const planned: string[] = [];
  const skipped: string[] = [];

  // 1. The threshold row.
  const existingSpaRow = ruleset.chemistryThresholds.find((t) => t.bodyOfWaterCategory === "SPA");
  if (existingSpaRow) {
    skipped.push(
      `TEMPERATURE/SPA row already exists (max ${existingSpaRow.maxValue ?? "none"}, hazard ${existingSpaRow.hazardMax ?? "none"})`,
    );
  } else {
    planned.push(`create ChemistryThreshold TEMPERATURE/SPA: max ${SPA_MAX_F}°F, hazardMax ${SPA_MAX_F}°F, sourceConfidence "assumption"`);
  }

  // 2. The closure protocol's wording. Only the one that actually carries the closure rule;
  // an org with none is a seeding problem, not something to invent a protocol for.
  const protocol = ruleset.eventProtocols.find((e) => e.triggerLabel?.includes("cyanuric acid"));
  if (!protocol) {
    skipped.push("no closure EventProtocol mentioning cyanuric acid -- trigger wording left alone");
  } else if (protocol.triggerLabel === TRIGGER_LABEL && protocol.reopeningCondition === REOPENING_CONDITION) {
    skipped.push("EventProtocol wording already names spa temperature");
  } else {
    planned.push(`update EventProtocol ${protocol.id}: trigger label and reopening condition name spa temperature`);
  }

  // 3. The in-app rules page.
  const reference = ruleset.referenceContent;
  let nextReference: string | null = null;
  if (reference == null) {
    skipped.push("ruleset has no referenceContent -- nothing to amend");
  } else if (reference.includes("Spa water temperature")) {
    skipped.push("referenceContent already documents spa temperature");
  } else if (!reference.includes(TARGET_ANCHOR) || !reference.includes(HAZARD_ANCHOR)) {
    skipped.push("referenceContent has been reworded -- expected anchors missing, left alone (edit it by hand)");
  } else {
    nextReference = reference
      .replace(TARGET_ANCHOR, TARGET_ANCHOR + TARGET_ADDITION)
      .replace(HAZARD_ANCHOR, HAZARD_ANCHOR + HAZARD_ADDITION);
    planned.push("update referenceContent: spa temperature in both the targets and the hazard list");
  }

  // 4. The provenance note.
  if (ruleset.complianceNotes.some((n) => n.summary === NOTE_SUMMARY)) {
    skipped.push("ComplianceNote already recorded");
  } else {
    planned.push('create ComplianceNote (ASSUMPTION) recording where the 104°F figure comes from');
  }

  for (const line of planned) console.log(`  WILL  ${line}`);
  for (const line of skipped) console.log(`  skip  ${line}`);

  if (planned.length === 0) {
    console.log("\nNothing to do -- everything is already in place.");
    return;
  }

  if (!apply) {
    console.log(`\n${planned.length} change(s) pending. Re-run with --apply to write them.`);
    return;
  }

  // One transaction: a half-applied rule set is worse than none, because the banner and the
  // rules page an admin reads would disagree about what the rule is.
  await prisma.$transaction(async (tx) => {
    if (!existingSpaRow) {
      await tx.chemistryThreshold.create({
        data: {
          complianceRulesetId: ruleset.id,
          parameter: "TEMPERATURE",
          bodyOfWaterCategory: "SPA",
          maxValue: SPA_MAX_F,
          hazardMax: SPA_MAX_F,
          unit: "°F",
          sourceConfidence: "assumption",
        },
      });
    }
    if (protocol && (protocol.triggerLabel !== TRIGGER_LABEL || protocol.reopeningCondition !== REOPENING_CONDITION)) {
      await tx.eventProtocol.update({
        where: { id: protocol.id },
        data: { triggerLabel: TRIGGER_LABEL, reopeningCondition: REOPENING_CONDITION },
      });
    }
    if (nextReference != null) {
      await tx.complianceRuleset.update({ where: { id: ruleset.id }, data: { referenceContent: nextReference } });
    }
    if (!ruleset.complianceNotes.some((n) => n.summary === NOTE_SUMMARY)) {
      await tx.complianceNote.create({
        data: { complianceRulesetId: ruleset.id, kind: "ASSUMPTION", summary: NOTE_SUMMARY, detail: NOTE_DETAIL },
      });
    }
  });

  console.log(`\nApplied ${planned.length} change(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
