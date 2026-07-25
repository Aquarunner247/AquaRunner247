import { prisma } from "@/lib/prisma";

/**
 * One-time (idempotent, upsert-based) seed: creates a bare ComplianceRuleset stub row
 * (isSupported: false, name only) for every state that doesn't yet have real regulatory
 * data. Run this first; prisma/seed-compliance-data.ts then upserts full structured data
 * (ChemistryThreshold/FrequencyRule/EventProtocol/ComplianceNote rows) for the states
 * that have it, using the same upsert-by-state-code pattern, so order between the two
 * scripts doesn't matter beyond "stubs exist for every state eventually."
 *
 * Nevada is NOT special-cased here anymore -- it gets the same bare-stub treatment as
 * every other state in this script; its full data now lives in
 * prisma/seed-compliance-data.ts alongside the other 8 states with real data, since it's
 * no longer a flat-field special case in the schema either (see
 * COMPLIANCE_RULESET_NOTES.md).
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
  { state: "NV", stateName: "Nevada" },
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

async function main() {
  for (const stub of STUB_STATES) {
    await prisma.complianceRuleset.upsert({
      where: { state: stub.state },
      create: { state: stub.state, stateName: stub.stateName, isSupported: false },
      // Never overwrite a state that's since been populated -- this script only fills gaps.
      update: {},
    });
  }

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
