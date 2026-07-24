import { prisma } from "@/lib/prisma";

/**
 * One-time (idempotent, upsert-based) seed: creates a ComplianceRuleset row for all 50
 * states + DC. Nevada is the only fully populated, isSupported:true record -- its values
 * are migrated directly from the hardcoded thresholds that previously lived in
 * app/dashboard/page.tsx, app/p/[publicSlug]/page.tsx, app/components/alerts-bell.tsx, and
 * the visit-completion CYA-freshness check. Every other state is a stub (isSupported:
 * false, name only) per multi-state-compliance-spec.md step 6 -- healthDepartmentName is
 * left blank except where the codebase already gave us a verified name (Nevada); every
 * other state's actual department name is unverified and deliberately not guessed at here.
 *
 * Usage:
 *   DATABASE_URL="<connection string>" npx tsx prisma/seed-compliance-rulesets.ts
 */

const STUB_STATES: { state: string; stateName: string }[] = [
  { state: "AL", stateName: "Alabama" },
  { state: "AK", stateName: "Alaska" },
  { state: "AZ", stateName: "Arizona" },
  { state: "AR", stateName: "Arkansas" },
  { state: "CA", stateName: "California" },
  { state: "CO", stateName: "Colorado" },
  { state: "CT", stateName: "Connecticut" },
  { state: "DE", stateName: "Delaware" },
  { state: "DC", stateName: "District of Columbia" },
  { state: "FL", stateName: "Florida" },
  { state: "GA", stateName: "Georgia" },
  { state: "HI", stateName: "Hawaii" },
  { state: "ID", stateName: "Idaho" },
  { state: "IL", stateName: "Illinois" },
  { state: "IN", stateName: "Indiana" },
  { state: "IA", stateName: "Iowa" },
  { state: "KS", stateName: "Kansas" },
  { state: "KY", stateName: "Kentucky" },
  { state: "LA", stateName: "Louisiana" },
  { state: "ME", stateName: "Maine" },
  { state: "MD", stateName: "Maryland" },
  { state: "MA", stateName: "Massachusetts" },
  { state: "MI", stateName: "Michigan" },
  { state: "MN", stateName: "Minnesota" },
  { state: "MS", stateName: "Mississippi" },
  { state: "MO", stateName: "Missouri" },
  { state: "MT", stateName: "Montana" },
  { state: "NE", stateName: "Nebraska" },
  { state: "NV", stateName: "Nevada" }, // populated separately below
  { state: "NH", stateName: "New Hampshire" },
  { state: "NJ", stateName: "New Jersey" },
  { state: "NM", stateName: "New Mexico" },
  { state: "NY", stateName: "New York" },
  { state: "NC", stateName: "North Carolina" },
  { state: "ND", stateName: "North Dakota" },
  { state: "OH", stateName: "Ohio" },
  { state: "OK", stateName: "Oklahoma" },
  { state: "OR", stateName: "Oregon" },
  { state: "PA", stateName: "Pennsylvania" },
  { state: "RI", stateName: "Rhode Island" },
  { state: "SC", stateName: "South Carolina" },
  { state: "SD", stateName: "South Dakota" },
  { state: "TN", stateName: "Tennessee" },
  { state: "TX", stateName: "Texas" },
  { state: "UT", stateName: "Utah" },
  { state: "VT", stateName: "Vermont" },
  { state: "VA", stateName: "Virginia" },
  { state: "WA", stateName: "Washington" },
  { state: "WV", stateName: "West Virginia" },
  { state: "WI", stateName: "Wisconsin" },
  { state: "WY", stateName: "Wyoming" },
];

// Migrated verbatim from the hardcoded values previously scattered across:
// - app/dashboard/page.tsx (issue/hazard thresholds)
// - app/p/[publicSlug]/page.tsx (chart target/hazard lines)
// - app/components/alerts-bell.tsx ($909 reopening fee)
// - app/dashboard/visits/[id]/page.tsx + app/api/visits/[id]/complete/route.ts (30-day CYA cycle)
const NEVADA_RULESET = {
  state: "NV",
  stateName: "Nevada",
  // Southern Nevada Health District is technically a Clark County entity, not a
  // statewide Nevada agency (see the `county` field's doc comment in schema.prisma) --
  // this is the only district AquaRunner has built rules for so far.
  healthDepartmentName: "Southern Nevada Health District",
  isSupported: true,
  cyaTestFrequencyDays: 30,
  freeChlorineMinPoolPpm: 2,
  freeChlorineMinSpaPpm: 3,
  freeChlorineMaxPpm: 10,
  phTargetMin: 7.2,
  phTargetMax: 7.8,
  phHazardMin: 6.5,
  phHazardMax: 8.0,
  alkalinityTargetMinPpm: 60,
  alkalinityTargetMaxPpm: 180,
  cyaTargetMinPpm: 30,
  cyaTargetMaxPpm: 50,
  cyaHazardMaxPpm: 100,
  closureFeeAmount: 909,
  closureFeeNote: "reopening fee",
  codeReferenceLabel: "Southern Nevada Health District — Pool & Spa Regulations",
  codeReferenceUrl: null,
  logSheetSourceLabel: "SNHD paper log format",
  logSheetSourceNotes:
    "AquaRunner's public QR inspector log mirrors the layout of SNHD's paper chemistry/equipment log sheets.",
  referenceContent: `AquaRunner enforces the following for commercial pools/spas under SNHD (Clark County). These
are the same thresholds already built into the app's closure-risk banners and inspector log --
this page documents them in one place rather than asserting new rules.

### Chemistry targets (routine range)
- **Free chlorine:** 2 ppm minimum (pools), 3 ppm minimum (spas), 10 ppm maximum
- **pH:** 7.2 – 7.8
- **Total alkalinity:** 60 – 180 ppm
- **Cyanuric acid:** 30 – 50 ppm, tested at least once every 30 days

### Closure-risk hazard thresholds
Readings outside these ranges are flagged as an imminent health hazard requiring closure
until resolved:
- **pH:** below 6.5 or above 8.0
- **Cyanuric acid:** above 100 ppm

A closure carries a $909 reopening fee once triggered.

### Log format
The public per-body-of-water inspector log mirrors SNHD's paper chemistry/equipment log
layout, so an inspector can review it the same way as a physical binder.

*This page reflects AquaRunner's built-in rule engine, not a substitute for SNHD's own
published code. Verify against the authoritative source for anything compliance-critical.*`,
};

async function main() {
  for (const stub of STUB_STATES) {
    if (stub.state === "NV") continue; // handled fully below
    await prisma.complianceRuleset.upsert({
      where: { state: stub.state },
      create: { state: stub.state, stateName: stub.stateName, isSupported: false },
      // Never overwrite a state that's since been populated -- this script only fills gaps.
      update: {},
    });
  }

  await prisma.complianceRuleset.upsert({
    where: { state: "NV" },
    create: NEVADA_RULESET,
    update: NEVADA_RULESET,
  });

  const count = await prisma.complianceRuleset.count();
  const supported = await prisma.complianceRuleset.count({ where: { isSupported: true } });
  console.log(`Done. ${count} ComplianceRuleset rows total, ${supported} fully supported.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
