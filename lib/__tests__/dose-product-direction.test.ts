import { describe, expect, it } from "vitest";
import { pickPrimaryProduct } from "@/lib/dose-product-selection";

/** Shapes mirror the real catalog: ten free-chlorine RAISERS and one reducer, all sharing
 *  chemicalType FREE_CHLORINE, and thiosulfate sharing form GRANULAR with the Cal-Hypos -- which is
 *  why nothing but lowersValue can tell them apart. */
function setting(
  name: string,
  opts: { lowersValue?: boolean; form?: string; isPrimary?: boolean } = {},
) {
  return {
    id: `s-${name}`,
    isPrimary: opts.isPrimary ?? false,
    catalogProduct: {
      id: `c-${name}`,
      name,
      chemicalType: "FREE_CHLORINE",
      form: opts.form ?? "LIQUID",
      dosingUnit: "FL_OZ",
      dosingConstant: 10.7,
      isDemandBased: false,
      lowersValue: opts.lowersValue ?? false,
    },
    linkedBillingProduct: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byType = (...rows: ReturnType<typeof setting>[]) => new Map<any, any>([["FREE_CHLORINE", rows]]);

describe("pickPrimaryProduct direction filtering", () => {
  const liquid = setting("Liquid Chlorine 12%", { isPrimary: true });
  const calHypo = setting("Cal-Hypo 60%", { form: "GRANULAR" });
  const thiosulfate = setting("Sodium Thiosulfate 100%", { form: "GRANULAR", lowersValue: true });

  it("picks the primary raiser when the reading is below target", () => {
    const picked = pickPrimaryProduct(byType(liquid, calHypo, thiosulfate) as never, "FREE_CHLORINE" as never, "UP");
    expect(picked?.catalogProduct.name).toBe("Liquid Chlorine 12%");
  });

  /**
   * The incident. Fifty101's pool read 12ppm against a 10ppm ceiling and was recommended 1.25
   * gallons of Liquid Chlorine 12%, which the technician added. With only raisers enabled, a
   * too-high reading must select NOTHING so the caller gives advice instead of a dose.
   */
  it("picks nothing for a too-high reading when only raisers are enabled", () => {
    const picked = pickPrimaryProduct(byType(liquid, calHypo) as never, "FREE_CHLORINE" as never, "DOWN");
    expect(picked).toBeNull();
  });

  it("never returns a raiser for a too-high reading, even as the only option", () => {
    expect(pickPrimaryProduct(byType(liquid) as never, "FREE_CHLORINE" as never, "DOWN")).toBeNull();
  });

  it("picks the reducer for a too-high reading when it is enabled", () => {
    const picked = pickPrimaryProduct(byType(liquid, thiosulfate) as never, "FREE_CHLORINE" as never, "DOWN");
    expect(picked?.catalogProduct.name).toBe("Sodium Thiosulfate 100%");
  });

  it("never returns the reducer for a too-low reading", () => {
    expect(pickPrimaryProduct(byType(thiosulfate) as never, "FREE_CHLORINE" as never, "UP")).toBeNull();
  });

  it("still excludes tablet products, which release continuously rather than as a batch dose", () => {
    const tablet = setting("Trichlor Tablets 90%", { form: "TABLET", isPrimary: true });
    const picked = pickPrimaryProduct(byType(tablet, calHypo) as never, "FREE_CHLORINE" as never, "UP");
    expect(picked?.catalogProduct.name).toBe("Cal-Hypo 60%");
  });

  it("honours isPrimary within the matching direction, not across all products", () => {
    // The primary is a raiser; a DOWN pick must ignore it rather than preferring it.
    const picked = pickPrimaryProduct(byType(liquid, thiosulfate) as never, "FREE_CHLORINE" as never, "DOWN");
    expect(picked?.isPrimary).toBe(false);
    expect(picked?.catalogProduct.lowersValue).toBe(true);
  });

  it("returns null for a chemical type with nothing enabled", () => {
    expect(pickPrimaryProduct(new Map() as never, "FREE_CHLORINE" as never, "UP")).toBeNull();
  });
});
