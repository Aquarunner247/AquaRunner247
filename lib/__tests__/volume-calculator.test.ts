import { describe, expect, it } from "vitest";
import { calculateGallons } from "@/lib/volume-calculator";

/**
 * Volume is the multiplier under every chemical dose -- BodyOfWater.volumeGallons is what
 * lib/dosing-calculator.ts reads -- so a wrong shape formula is a wrong dose on every visit
 * for the life of that pool. These pin each shape to a hand-computed figure.
 */
describe("calculateGallons", () => {
  it("rectangle: length x width x depth x 7.5", () => {
    expect(calculateGallons({ shape: "RECTANGLE", lengthFt: 30, widthFt: 15, shallowDepthFt: 5 })).toBe(16_875);
  });

  it("averages a sloped floor rather than taking either end", () => {
    // 3ft and 7ft average to 5ft, so this must match the flat-5ft rectangle above.
    expect(
      calculateGallons({ shape: "RECTANGLE", lengthFt: 30, widthFt: 15, shallowDepthFt: 3, deepDepthFt: 7 }),
    ).toBe(16_875);
  });

  it("circle: pi r^2 x depth x 7.5", () => {
    expect(calculateGallons({ shape: "CIRCLE", radiusFt: 10, shallowDepthFt: 4 })).toBeCloseTo(9_424.78, 1);
  });

  it("oval uses 6.7, the rounded-rectangle approximation, not 7.5", () => {
    expect(calculateGallons({ shape: "OVAL", lengthFt: 30, widthFt: 15, shallowDepthFt: 5 })).toBe(15_075);
  });

  it("kidney applies the 0.45 shape factor", () => {
    // (12 + 18) x 20 x 5 x 0.45 x 7.5 = 10,125
    const gallons = calculateGallons({
      shape: "KIDNEY_FREEFORM",
      freeformMeasurementA: 12,
      freeformMeasurementB: 18,
      widthFt: 20,
      shallowDepthFt: 5,
    });
    expect(gallons).toBe(10_125);

    // Regression: the factor was missing, which returned 22,500 -- about 2.2x the real volume,
    // and therefore about 2.2x every chemical dose for that pool. Caught in the 2026-11-01
    // review while no pool had used the calculator yet.
    expect(gallons).not.toBe(22_500);
  });

  it("multi-depth sums two real sections rather than averaging them into one", () => {
    // 20x15x3 = 6,750 and 10x15x6 = 6,750.
    expect(
      calculateGallons({
        shape: "MULTI_DEPTH",
        shallowSectionLengthFt: 20,
        shallowSectionWidthFt: 15,
        shallowSectionDepthFt: 3,
        deepSectionLengthFt: 10,
        deepSectionWidthFt: 15,
        deepSectionDepthFt: 6,
      }),
    ).toBe(13_500);
  });

  it("returns null rather than a wrong number when a dimension is missing", () => {
    // Null is what lets the caller keep asking. A partial measurement silently treated as zero
    // would produce a confident, tiny volume and a correspondingly tiny dose.
    expect(calculateGallons({ shape: "RECTANGLE", lengthFt: 30, shallowDepthFt: 5 })).toBeNull();
    expect(calculateGallons({ shape: "CIRCLE", shallowDepthFt: 4 })).toBeNull();
    expect(
      calculateGallons({ shape: "KIDNEY_FREEFORM", freeformMeasurementA: 12, widthFt: 20, shallowDepthFt: 5 }),
    ).toBeNull();
    expect(calculateGallons({ shape: "MULTI_DEPTH", shallowSectionLengthFt: 20 })).toBeNull();
  });

  it("treats a zero or negative depth as missing, not as a pool of no water", () => {
    expect(calculateGallons({ shape: "RECTANGLE", lengthFt: 30, widthFt: 15, shallowDepthFt: 0 })).toBeNull();
    expect(calculateGallons({ shape: "RECTANGLE", lengthFt: 30, widthFt: 15, shallowDepthFt: -2 })).toBeNull();
  });
});
