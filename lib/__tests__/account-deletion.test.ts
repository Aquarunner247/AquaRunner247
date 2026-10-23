import { describe, expect, it } from "vitest";

import { confirmationMatches, confirmationLabel, RETAINED_AFTER_DELETION } from "@/lib/account-deletion-confirm";

/**
 * The typed confirmation is the only thing between an admin and irreversible deletion of their
 * business's data, and it is checked on the SERVER -- a hand-rolled POST that skips the form
 * must not get through. These cover the two ways that gate could fail: too strict, so somebody
 * who meant it cannot delete and emails support instead; or too loose, which is unrecoverable.
 */

const ORG = "Lindley's Pool & Spa Service LLC";

describe("confirmationMatches", () => {
  it("accepts the name as it is shown", () => {
    expect(confirmationMatches(ORG, ORG)).toBe(true);
  });

  it("forgives the things a person types or pastes", () => {
    // A speed bump to make deletion deliberate, not a spelling test.
    expect(confirmationMatches(`  ${ORG}  `, ORG)).toBe(true);
    expect(confirmationMatches(ORG.toLowerCase(), ORG)).toBe(true);
    expect(confirmationMatches(ORG.toUpperCase(), ORG)).toBe(true);
    expect(confirmationMatches("Lindley's  Pool  & Spa Service LLC", ORG)).toBe(true);
    expect(confirmationMatches("Lindley's\tPool & Spa Service LLC", ORG)).toBe(true);
  });

  it("rejects a different name", () => {
    expect(confirmationMatches("Lindley's Pool", ORG)).toBe(false);
    expect(confirmationMatches("Lindleys Pool & Spa Service LLC", ORG)).toBe(false);
    expect(confirmationMatches("some other company", ORG)).toBe(false);
  });

  it("rejects an empty box", () => {
    // The failure that actually matters: a POST with no field at all, or a form submitted
    // blank, must never read as confirmation.
    expect(confirmationMatches("", ORG)).toBe(false);
    expect(confirmationMatches("   ", ORG)).toBe(false);
  });

  it("refuses to confirm an organization with no name rather than accepting anything", () => {
    // If the target normalized to "", an empty typed string would equal it and delete the
    // account. It has to fail closed instead.
    expect(confirmationMatches("", "")).toBe(false);
    expect(confirmationMatches("", null)).toBe(false);
    expect(confirmationMatches("   ", "   ")).toBe(false);
    expect(confirmationMatches("anything", null)).toBe(false);
  });
});

describe("confirmationLabel", () => {
  it("asks for the business name the dashboard shows", () => {
    expect(confirmationLabel({ businessName: ORG, name: "internal-slug" })).toBe(ORG);
  });

  it("falls back to name when there is no business name", () => {
    // The header shows `name` in that case, so asking for businessName would ask for something
    // the admin has never seen.
    expect(confirmationLabel({ businessName: null, name: "Acme Pools" })).toBe("Acme Pools");
  });

  it("produces a label its own matcher accepts", () => {
    for (const org of [
      { businessName: ORG, name: "x" },
      { businessName: null, name: "Acme Pools" },
    ]) {
      expect(confirmationMatches(confirmationLabel(org), confirmationLabel(org)), org.name).toBe(true);
    }
  });
});

describe("RETAINED_AFTER_DELETION", () => {
  it("names the three record types the scrub actually keeps", () => {
    // lib/org-scrub.ts keeps VisitWaterReading, ContaminationIncident and InspectionReport.
    // If that allowlist changes, this sentence -- shown in the delete dialog and echoed by the
    // Privacy Policy and DPA 9.5 -- has to change with it.
    expect(RETAINED_AFTER_DELETION).toContain("water-reading");
    expect(RETAINED_AFTER_DELETION).toContain("contamination incident");
    expect(RETAINED_AFTER_DELETION).toContain("inspection report");
  });
});
