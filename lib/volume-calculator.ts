/**
 * Pure pool/spa volume math -- no `prisma` import, so a "use client" component can import
 * these functions directly (not just types) for a live preview as the technician types,
 * same reasoning as lib/dosing-units.ts being split out from lib/dosing-calculator.ts.
 *
 * Constant: 1 cubic foot = 7.5 gallons (pool-industry-standard rounding of the exact 7.48).
 */

export type VolumeShapeKey = "RECTANGLE" | "CIRCLE" | "OVAL" | "KIDNEY_FREEFORM" | "MULTI_DEPTH";

export type VolumeShapeInput = {
  shape: VolumeShapeKey;
  lengthFt?: number | null;
  widthFt?: number | null;
  radiusFt?: number | null;
  shallowDepthFt?: number | null;
  deepDepthFt?: number | null;
  freeformMeasurementA?: number | null;
  freeformMeasurementB?: number | null;
  shallowSectionLengthFt?: number | null;
  shallowSectionWidthFt?: number | null;
  shallowSectionDepthFt?: number | null;
  deepSectionLengthFt?: number | null;
  deepSectionWidthFt?: number | null;
  deepSectionDepthFt?: number | null;
};

const CUBIC_FT_TO_GALLONS = 7.5;
/** Rounded-rectangle oval approximation constant -- not a true ellipse (~5.9), this is the
 *  standard published pool-industry figure. Named OVAL_KIDNEY_CONSTANT when kidney was
 *  expected to share it; kidney does not, and uses KIDNEY_SHAPE_FACTOR below instead. */
const OVAL_CONSTANT = 6.7;

/**
 * The shape factor in the published kidney/freeform formula:
 *
 *     (A + B) x length x average depth x 0.45 x 7.5
 *
 * It accounts for a kidney being substantially narrower than the rectangle its two width
 * measurements would otherwise describe. It was missing, so the calculator returned roughly
 * 1 / 0.45 = 2.2x the real volume -- and since BodyOfWater.volumeGallons is what dosing reads,
 * every chemical recommendation for such a pool would have been about 2.2x too large.
 *
 * Caught in the 2026-11-01 code review. Latent rather than harmful: there were no
 * VolumeCalculation rows in production when this was fixed, so every volume in use had been
 * typed in by hand and no dose was ever computed from it.
 */
const KIDNEY_SHAPE_FACTOR = 0.45;

function averageDepth(shallow?: number | null, deep?: number | null): number | null {
  if (shallow != null && deep != null) return (shallow + deep) / 2;
  return shallow ?? deep ?? null;
}

/**
 * MULTI_DEPTH gets two independent rectangular sections (each its own length/width/depth),
 * summed after converting each to gallons -- a real per-section calculation, not the
 * averaged-single-rectangle simplification a prior version of this tool used.
 */
export function calculateGallons(input: VolumeShapeInput): number | null {
  switch (input.shape) {
    case "RECTANGLE": {
      const depth = averageDepth(input.shallowDepthFt, input.deepDepthFt);
      if (!input.lengthFt || !input.widthFt || depth == null || depth <= 0) return null;
      return input.lengthFt * input.widthFt * depth * CUBIC_FT_TO_GALLONS;
    }
    case "CIRCLE": {
      const depth = averageDepth(input.shallowDepthFt, input.deepDepthFt);
      if (!input.radiusFt || depth == null || depth <= 0) return null;
      return Math.PI * input.radiusFt ** 2 * depth * CUBIC_FT_TO_GALLONS;
    }
    case "OVAL": {
      const depth = averageDepth(input.shallowDepthFt, input.deepDepthFt);
      if (!input.lengthFt || !input.widthFt || depth == null || depth <= 0) return null;
      return input.lengthFt * input.widthFt * depth * OVAL_CONSTANT;
    }
    case "KIDNEY_FREEFORM": {
      const depth = averageDepth(input.shallowDepthFt, input.deepDepthFt);
      if (!input.freeformMeasurementA || !input.freeformMeasurementB || !input.widthFt || depth == null || depth <= 0) return null;
      return (
        (input.freeformMeasurementA + input.freeformMeasurementB) *
        input.widthFt *
        depth *
        KIDNEY_SHAPE_FACTOR *
        CUBIC_FT_TO_GALLONS
      );
    }
    case "MULTI_DEPTH": {
      const { shallowSectionLengthFt: sL, shallowSectionWidthFt: sW, shallowSectionDepthFt: sD } = input;
      const { deepSectionLengthFt: dL, deepSectionWidthFt: dW, deepSectionDepthFt: dD } = input;
      if (!sL || !sW || !sD || sD <= 0 || !dL || !dW || !dD || dD <= 0) return null;
      const shallowGallons = sL * sW * sD * CUBIC_FT_TO_GALLONS;
      const deepGallons = dL * dW * dD * CUBIC_FT_TO_GALLONS;
      return shallowGallons + deepGallons;
    }
  }
}
