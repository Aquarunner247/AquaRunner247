/**
 * Gallons formulas -- dosing-calculator-spec.md Section 1a. Pure/shared so the client
 * tool's live preview and the server action's actual save use identical math.
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
};

function averageDepth(input: VolumeShapeInput): number | null {
  const shallow = input.shallowDepthFt ?? null;
  const deep = input.deepDepthFt ?? null;
  if (shallow != null && deep != null) return (shallow + deep) / 2;
  return shallow ?? deep ?? null;
}

/**
 * MULTI_DEPTH is a known v1 simplification: the spec's "split into shallow/deep sections,
 * calculate each as its own shape, sum the two" needs a second length/width per section,
 * which this tool's single dimension set doesn't carry -- treated identically to
 * RECTANGLE (whose avgDepth already averages shallow/deep) until a real per-section input
 * exists. Documented gap, not a silent wrong answer.
 */
export function calculateGallons(input: VolumeShapeInput): number | null {
  const depth = averageDepth(input);
  if (depth == null || depth <= 0) return null;

  switch (input.shape) {
    case "RECTANGLE":
    case "MULTI_DEPTH": {
      if (!input.lengthFt || !input.widthFt) return null;
      return input.lengthFt * input.widthFt * depth * 7.5;
    }
    case "CIRCLE": {
      if (!input.radiusFt) return null;
      return Math.PI * input.radiusFt ** 2 * depth * 7.5;
    }
    case "OVAL": {
      if (!input.lengthFt || !input.widthFt) return null;
      return input.lengthFt * input.widthFt * depth * 6.7;
    }
    case "KIDNEY_FREEFORM": {
      // Reuses widthFt as the formula's "W" term -- kidney/freeform doesn't get its own
      // dedicated width column, same shared-field convention as every other shape here.
      if (!input.freeformMeasurementA || !input.freeformMeasurementB || !input.widthFt) return null;
      return (input.freeformMeasurementA + input.freeformMeasurementB) * input.widthFt * depth * 6.7;
    }
  }
}
