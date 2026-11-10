import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// lib/org-scrub.ts reaches the database and Supabase storage at import time, through
// lib/prisma.ts (which throws without DATABASE_URL). Nothing under test here calls either
// -- PROPERTY_FIELDS_CLEARED_ON_SCRUB is a plain object -- so the chain is stubbed rather
// than stood up, the same way lib/__tests__/recording-notice.test.ts does it.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));

import { PROPERTY_FIELDS_CLEARED_ON_SCRUB } from "@/lib/org-scrub";

/**
 * A Property row outlives the organization that created it, with no end date, so that the
 * public compliance log at /p/[publicSlug] keeps resolving after a pool company cancels.
 * That makes Property the one model where "we forgot to clear this field" means "we hold a
 * named individual's personal phone number forever."
 *
 * The failure mode is silent and it is a schema edit, not a code edit: someone adds
 * `secondaryContactEmail` to model Property, every test still passes, and the field is
 * retained indefinitely because runOrgScrub never knew about it. So this reads the schema
 * and insists every scalar on Property is a deliberate decision -- either in
 * PROPERTY_FIELDS_CLEARED_ON_SCRUB or in the keep-list below, never merely absent.
 *
 * Adding a field to Property fails this test on purpose. Put it in one list or the other.
 */

/**
 * Scalars deliberately retained on a scrubbed Property, and why each is defensible:
 *
 * - The identity/address group is what the public log actually renders -- `name`,
 *   `propertyType`, `addressLine1`, `city`, `region` (app/p/[publicSlug]/page.tsx), plus
 *   `addressLine2`/`postalCode`/`country` as the rest of the same postal address.
 * - `latitude`/`longitude`/`geofenceMeters` locate the body of water the log belongs to.
 * - `isHOA`/`hasDog` are attributes of the property with no contact value once the four
 *   contact blocks are cleared.
 * - The id/FK/timestamp group is structural: without it the log cannot be resolved at all.
 */
const RETAINED_ON_PURPOSE = new Set([
  "id",
  "organizationId",
  "customerId",
  "managementCompanyId",
  "name",
  "propertyType",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
  "latitude",
  "longitude",
  "geofenceMeters",
  "isHOA",
  "hasDog",
  "createdAt",
  "updatedAt",
]);

/** Scalar field names on `model Property`, read from the schema rather than from the
 * generated client -- the schema is what a contributor edits, so it is what should fail. */
function propertyScalarFields(): string[] {
  const schema = fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf-8");
  const block = /^model Property \{$([\s\S]*?)^\}$/m.exec(schema);
  if (!block) throw new Error("model Property not found in prisma/schema.prisma");

  const relationModels = new Set<string>();
  for (const m of schema.matchAll(/^model (\w+) \{$/gm)) relationModels.add(m[1]);

  const fields: string[] = [];
  for (const rawLine of block[1].split("\n")) {
    const line = rawLine.trim();
    // Skip blank lines, `///` doc comments, `//` comments and block-level attributes (@@).
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const match = /^(\w+)\s+(\w+)/.exec(line);
    if (!match) continue;
    const [, fieldName, fieldType] = match;
    // A field whose type is another model is a relation, not stored data on this row.
    if (relationModels.has(fieldType)) continue;
    fields.push(fieldName);
  }
  return fields;
}

describe("Property fields retained after an organization is scrubbed", () => {
  const cleared = new Set(Object.keys(PROPERTY_FIELDS_CLEARED_ON_SCRUB));

  it("accounts for every scalar on model Property", () => {
    const unaccounted = propertyScalarFields().filter((f) => !cleared.has(f) && !RETAINED_ON_PURPOSE.has(f));
    expect(
      unaccounted,
      "New Property scalar(s) are neither cleared on scrub nor listed as deliberately retained. " +
        "A Property row is kept forever, so an unlisted field is retained forever. Add each to " +
        "PROPERTY_FIELDS_CLEARED_ON_SCRUB in lib/org-scrub.ts, or to RETAINED_ON_PURPOSE here with a reason.",
    ).toEqual([]);
  });

  it("does not claim to clear a field that no longer exists", () => {
    // A renamed or dropped column would otherwise leave a stale key that Prisma rejects
    // at runtime, in a cron job whose failure nobody is watching.
    const schemaFields = new Set(propertyScalarFields());
    const stale = [...cleared].filter((f) => !schemaFields.has(f));
    expect(stale, "PROPERTY_FIELDS_CLEARED_ON_SCRUB names field(s) that are not on model Property").toEqual([]);
  });

  it("clears every contact field, so no named individual's details are retained", () => {
    // Spelled out rather than pattern-matched: these are the four contact blocks and the
    // two free-text fields, and each one is a person's details or a way into the property.
    for (const field of [
      "managerName",
      "managerBusinessPhone",
      "managerMobilePhone",
      "managerPhone",
      "managerEmail",
      "maintenanceName",
      "maintenanceCellPhone",
      "maintenanceEmail",
      "hoaManagerName",
      "hoaManagerPhone",
      "hoaManagerEmail",
      "ownerName",
      "ownerMobilePhone",
      "ownerHomePhone",
      "ownerEmail",
      "accessNotes",
      "notes",
    ]) {
      expect(cleared.has(field), `${field} must be cleared on scrub`).toBe(true);
    }
  });

  it("never clears a field the public compliance log renders", () => {
    // The whole justification for keeping the row is that this page still resolves.
    for (const field of ["name", "propertyType", "addressLine1", "city", "region"]) {
      expect(cleared.has(field), `${field} is rendered by /p/[publicSlug] and must survive`).toBe(false);
    }
  });

  it("sets every cleared field to null", () => {
    // `notes: ""` would satisfy a "cleared" reading while leaving the column non-null and
    // the row looking deliberately blanked rather than empty.
    for (const [field, value] of Object.entries(PROPERTY_FIELDS_CLEARED_ON_SCRUB)) {
      expect(value, `${field} should be cleared to null`).toBeNull();
    }
  });
});
