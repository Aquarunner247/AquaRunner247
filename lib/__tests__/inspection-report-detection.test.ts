import { describe, it, expect } from "vitest";
import { looksLikeInspectionReport, pickInspectionReportTarget, type BodyOfWaterCandidate } from "@/lib/inspection-report-detection";

describe("looksLikeInspectionReport", () => {
  it("matches an explicit 'inspection' mention, case-insensitively", () => {
    expect(looksLikeInspectionReport("Pacific Harbor Pool Inspection 06.26.25_Part1.pdf")).toBe(true);
    expect(looksLikeInspectionReport("2026 INSPECTION report")).toBe(true);
  });

  it("does not match unrelated document names", () => {
    expect(looksLikeInspectionReport("W-9.pdf")).toBe(false);
    expect(looksLikeInspectionReport("Service Contract 2026.pdf")).toBe(false);
  });
});

describe("pickInspectionReportTarget", () => {
  const pool: BodyOfWaterCandidate = { id: "pool", name: "Pool", propertyName: "Pacific Harbors" };
  const spa: BodyOfWaterCandidate = { id: "spa", name: "Spa", propertyName: "Pacific Harbors" };

  it("returns null when the customer has no bodies of water at all", () => {
    expect(pickInspectionReportTarget([], "Some Inspection.pdf")).toBeNull();
  });

  it("picks the only body of water without needing a name match", () => {
    expect(pickInspectionReportTarget([pool], "Random Inspection Report.pdf")).toBe(pool);
  });

  it("matches by name when exactly one candidate's name appears in the filename", () => {
    expect(pickInspectionReportTarget([pool, spa], "Pacific Harbor Spa Inspection 06.26.25_Part2.pdf")).toBe(spa);
    expect(pickInspectionReportTarget([pool, spa], "Pacific Harbor Pool Inspection 06.26.25_Part1.pdf")).toBe(pool);
  });

  it("refuses to guess when more than one body's name matches", () => {
    const poolTwo: BodyOfWaterCandidate = { id: "pool2", name: "Pool 2", propertyName: "OYO" };
    // "Pool" is a substring of both "Pool" and "Pool 2" once the filename says "Pool 2".
    expect(pickInspectionReportTarget([pool, poolTwo], "Pool 2 Inspection.pdf")).toBeNull();
  });

  it("returns null when no candidate's name appears in the filename at all", () => {
    expect(pickInspectionReportTarget([pool, spa], "Building Inspection Report.pdf")).toBeNull();
  });
});
