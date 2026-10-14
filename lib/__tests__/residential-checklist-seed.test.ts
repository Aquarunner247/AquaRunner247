import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENTIAL_CHECKLIST, RESIDENTIAL_CHECKLIST_CATEGORIES } from "../default-residential-checklist";

/**
 * The migration seeds the residential list as literal SQL, because a migration cannot import
 * TypeScript. That duplication is the same shape that let the Open Graph palette go stale, so it is
 * pinned here rather than trusted.
 *
 * The VALUES rows are parsed into objects and compared structurally. Matching them with a regex per
 * label was how the first version of this test failed -- "Cyanuric Acid (stabilizer)" has
 * parentheses in it, and the escaping was wrong rather than the migration.
 */
describe("the residential checklist seed", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "prisma", "migrations", "20261014060000_residential_checklist", "migration.sql"),
    "utf8",
  );

  const seeded = [...sql.matchAll(/\n\s{4}\('((?:[^']|'')+)',\s*'((?:[^']|'')+)',\s*(true|false),\s*(\d+)\)/g)].map((m) => ({
    label: m[1].replace(/''/g, "'"),
    category: m[2].replace(/''/g, "'"),
    billable: m[3] === "true",
    sortOrder: Number(m[4]),
  }));

  it("seeds exactly the list, in order, with the same labels, groups and billable flags", () => {
    expect(seeded.map(({ label, category, billable }) => ({ label, category, billable }))).toEqual(
      DEFAULT_RESIDENTIAL_CHECKLIST.map(({ label, category, billable }) => ({ label, category, billable })),
    );
  });

  it("keeps the supplied order, so the technician sees daily before weekly before seasonal", () => {
    expect(seeded.map((i) => i.sortOrder)).toEqual(seeded.map((_, i) => i));
  });

  it("marks the six chargeable items billable and nothing else", () => {
    expect(seeded.filter((i) => i.billable).map((i) => i.label)).toEqual([
      "Shock treatment",
      "Filter deep cleaning",
      "Calcium Hardness testing and adjustment",
      "Cyanuric Acid (stabilizer) testing and adjustment",
      "Salt cell scale inspection",
      "O-ring and gasket lubrication",
    ]);
  });

  it("uses only the three agreed groups", () => {
    for (const item of seeded) {
      expect(RESIDENTIAL_CHECKLIST_CATEGORIES).toContain(item.category as (typeof RESIDENTIAL_CHECKLIST_CATEGORIES)[number]);
    }
  });

  it("inserts no `required` or `chargeAmount` -- blocking a technician and what to charge are both the company's call", () => {
    const insertColumns = sql.slice(sql.indexOf('INSERT INTO "ChecklistItemDefinition"'), sql.indexOf("SELECT"));
    expect(insertColumns).not.toContain('"required"');
    expect(insertColumns).not.toContain('"chargeAmount"');
  });

  it("seeds residential scope only, leaving commercial items alone", () => {
    expect(sql).toContain("'RESIDENTIAL'");
    expect(sql).toContain(`ADD COLUMN     "scope" "ChecklistScope" NOT NULL DEFAULT 'COMMERCIAL'`);
  });

  it("is idempotent, so re-running the migration cannot duplicate the list", () => {
    expect(sql).toContain("WHERE NOT EXISTS");
  });
});

/**
 * Every place that creates an organization has to seed BOTH checklists.
 *
 * Added after exactly that was missed: app/portal/subscribe/actions.ts seeded only the commercial
 * list, so an org created through the portal upgrade path got no residential checklist at all and
 * its technicians saw an empty list on every house. The migration covers orgs that already exist
 * and each signup path covers its own, which means the knowledge is in four files at once.
 *
 * Source-level on purpose. These are all inside transactions that create a Stripe customer and an
 * auth user, so the cheap thing to assert is that the file knows about the list -- which is the
 * shape of the mistake.
 */
describe("every org-creating path seeds the residential checklist", () => {
  const seedingFiles = [
    "app/signup/actions.ts",
    "app/portal/subscribe/actions.ts",
    "app/api/stripe/webhook/route.ts",
  ];

  it.each(seedingFiles)("%s seeds it", (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toContain("DEFAULT_RESIDENTIAL_CHECKLIST");
  });

  it("finds no other file creating checklist definitions in bulk", () => {
    // ':!' excludes this test, which names the call itself and would otherwise match.
    const found = execFileSync(
      "git",
      ["grep", "-l", "checklistItemDefinition.createMany", "--", "app", "lib", ":!lib/__tests__"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .sort();
    // Fails when a fifth signup path appears, which is the moment to seed it and add it above.
    expect(found).toEqual([...seedingFiles].sort());
  });
});
