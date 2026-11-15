import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A pay rate belongs to the VENUE, not to a technician.
 *
 * It used to be keyed on (technicianId, bodyOfWaterId), which had two costs the operator hit
 * in practice: an identical figure had to be re-entered for every technician who might ever
 * cover a stop (by 2026-11-14 production held 41 rows covering 25 venues, eight of them the
 * same amount entered twice under two names), and the first time somebody new covered a stop
 * it resolved to NO rate and silently paid nothing toward their estimated earnings.
 *
 * This guard exists because the old shape is the shape somebody would naturally reintroduce:
 * "whose rate is this?" is an obvious-sounding question, and answering it by adding a
 * technician back to the rate row would quietly restore both problems. The rate table is also
 * the one place a wrong answer turns into a wrong dollar figure in a payroll export, so the
 * invariant is asserted on the schema and on the lookup rather than left to review.
 */

const ROOT = process.cwd();
const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const payLib = fs.readFileSync(path.join(ROOT, "lib/technician-pay.ts"), "utf8");

function modelBody(name: string): string {
  const match = schema.match(new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`model ${name} not found in prisma/schema.prisma`);
  return match[1];
}

describe("VenuePayRate is keyed on the venue alone", () => {
  it("has no technician field or relation", () => {
    const body = modelBody("VenuePayRate");
    expect(body).toContain("bodyOfWaterId String");
    // `createdByUserId` is a different thing -- who typed the rate in, not who earns it --
    // so this looks for the technician specifically rather than for any User reference.
    expect(body).not.toMatch(/technicianId/);
    expect(body).not.toMatch(/technician\s+User/);
  });

  it("is the only pay-rate model -- the per-technician one is gone, not kept alongside", () => {
    expect(schema).not.toContain("model TechnicianPayRate");
  });

  it("resolves a visit's rate without being told who worked it", () => {
    const signature = payLib.match(/export async function resolveRateForVisit\(([\s\S]*?)\): Promise/);
    expect(signature, "resolveRateForVisit not found in lib/technician-pay.ts").not.toBeNull();
    expect(signature![1]).toContain("bodyOfWaterId: string");
    expect(signature![1]).not.toContain("technicianId");
  });

  it("loads one rate map for the org, not one per technician", () => {
    // The hot path: getTechnicianEarnings and getPayrollExportRows both read this. A
    // technicianId parameter here would mean the org's rate table had been split per person
    // again, whatever the schema said.
    const signature = payLib.match(/async function loadActiveRatesByBody\(([\s\S]*?)\): Promise/);
    expect(signature, "loadActiveRatesByBody not found in lib/technician-pay.ts").not.toBeNull();
    expect(signature![1]).not.toContain("technicianId");
  });
});
