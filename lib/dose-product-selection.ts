import type { ChemicalProductForm, ChemicalType, DosingUnit } from "@/generated/prisma/enums";

/**
 * Which configured product a dose should use.
 *
 * Split out of lib/dosing-calculator.ts, which imports a Prisma client and therefore cannot be
 * loaded without a database. This logic decides what chemical a technician is told to pour into a
 * pool, so it needs to be unit-testable on its own.
 */

export type CatalogRow = {
  id: string;
  name: string;
  chemicalType: ChemicalType;
  form: ChemicalProductForm;
  dosingUnit: DosingUnit;
  dosingConstant: unknown;
  isDemandBased: boolean;
  /** See ChemicalProductCatalog.lowersValue -- required, not optional, so a query that forgets to
   *  select it fails to compile rather than silently treating a reducer as a raiser. */
  lowersValue: boolean;
};
export type LinkedBillingProduct = { id: string; unit: string; active: boolean };
export type SettingWithCatalog = { id: string; isPrimary: boolean; catalogProduct: CatalogRow; linkedBillingProduct: LinkedBillingProduct | null };

/** Excludes TABLET-form products: erosion feeders release chlorine continuously, not as a
 * batch ppm-delta dose -- Taylor's tables have no dosing constant for that (see
 * seed-chemical-product-catalog.ts), so recommending "add N tablets now" would be the same
 * kind of dishonest guess convertToBillingUnit already refuses to make. A tablet product can
 * still be enabled/priced for billing (feeder refills logged manually), it just never gets
 * auto-selected for the computed recommendation. */
export function pickPrimaryProduct(
  byType: Map<ChemicalType, SettingWithCatalog[]>,
  chemicalType: ChemicalType,
  direction: "UP" | "DOWN",
): SettingWithCatalog | null {
  const settings = byType
    .get(chemicalType)
    ?.filter((s) => s.catalogProduct.form !== "TABLET")
    // The product has to move the reading the way it needs to move. Without this, a free-chlorine
    // reading ABOVE target picked the primary chlorine RAISER -- chemicalType FREE_CHLORINE holds
    // both ten raisers and sodium thiosulfate, and isPrimary alone cannot tell them apart. Returning
    // null here is the safe outcome: the caller then gives advice instead of a dose.
    .filter((s) => s.catalogProduct.lowersValue === (direction === "DOWN"));
  if (!settings || settings.length === 0) return null;
  return settings.find((s) => s.isPrimary) ?? settings[0];
}
