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
/** Rounded-rectangle oval/kidney approximation constant -- not a true ellipse (~5.9),
 * this is the standard published pool-industry figure for these two shapes. */
const OVAL_KIDNEY_CONSTANT = 6.7;

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
      return input.lengthFt * input.widthFt * depth * OVAL_KIDNEY_CONSTANT;
    }
    case "KIDNEY_FREEFORM": {
      const depth = averageDepth(input.shallowDepthFt, input.deepDepthFt);
      if (!input.freeformMeasurementA || !input.freeformMeasurementB || !input.widthFt || depth == null || depth <= 0) return null;
      return (input.freeformMeasurementA + input.freeformMeasurementB) * input.widthFt * depth * CUBIC_FT_TO_GALLONS;
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
