import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { extractInspectionReportData } from "@/lib/inspection-report-extraction";

/** Builds a mock model whose single doGenerate call returns `fixture` as a JSON text
 * part -- generateObject's default (non-tool-calling) strategy parses the model's text
 * output as JSON against the schema, so this is the shape a real model response takes. */
function mockModelReturning(fixture: object) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(fixture) }],
      finishReason: "stop",
      usage: {
        inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: undefined, text: undefined, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

const DUMMY_BYTES = new Uint8Array([1, 2, 3]);

describe("extractInspectionReportData", () => {
  it("extracts a fully-populated report", async () => {
    const fixture = {
      inspectorName: "Dana Ruiz",
      inspectionDate: "2026-06-14",
      volumeGallons: 18000,
      maximumOccupancy: 45,
      equipment: [
        { kind: "PUMP", make: "Pentair", model: "WhisperFlo", serialNumber: "PF-2291-A" },
        { kind: "FILTER", make: "Sta-Rite", model: "System 3", serialNumber: null },
      ],
    };
    const result = await extractInspectionReportData(DUMMY_BYTES, "application/pdf", mockModelReturning(fixture));
    expect(result.inspectorName).toBe("Dana Ruiz");
    expect(result.inspectionDate).toBe("2026-06-14");
    expect(result.volumeGallons).toBe(18000);
    expect(result.maximumOccupancy).toBe(45);
    expect(result.equipment).toHaveLength(2);
    expect(result.equipment[0]).toMatchObject({ kind: "PUMP", make: "Pentair", model: "WhisperFlo", serialNumber: "PF-2291-A" });
  });

  it("falls back to OTHER for an equipment item that doesn't fit a known kind", async () => {
    const fixture = {
      inspectorName: "Marcus Webb",
      inspectionDate: null,
      volumeGallons: null,
      maximumOccupancy: null,
      equipment: [{ kind: "OTHER", make: "Generic Corp", model: "UV-500", serialNumber: null }],
    };
    const result = await extractInspectionReportData(DUMMY_BYTES, "image/jpeg", mockModelReturning(fixture));
    expect(result.equipment[0].kind).toBe("OTHER");
  });

  it("passes through nulls for fields genuinely not on the report, without fabricating values", async () => {
    const fixture = {
      inspectorName: null,
      inspectionDate: null,
      volumeGallons: 12000,
      maximumOccupancy: null,
      equipment: [],
    };
    const result = await extractInspectionReportData(DUMMY_BYTES, "application/pdf", mockModelReturning(fixture));
    expect(result.inspectorName).toBeNull();
    expect(result.inspectionDate).toBeNull();
    expect(result.maximumOccupancy).toBeNull();
    expect(result.volumeGallons).toBe(12000);
    expect(result.equipment).toEqual([]);
  });
});
