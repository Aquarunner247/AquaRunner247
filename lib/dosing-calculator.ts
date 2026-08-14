import { prisma } from "@/lib/prisma";
import { getOrganizationRuleset, isComplianceActive, chlorineFamilyThreshold, activeChemistryThresholds } from "@/lib/compliance";
import type { ChemicalType, ChemicalProductForm, DosingUnit, DisinfectionMethod } from "@/generated/prisma/enums";

/**
 * The chemicals this calculator can automatically recommend a dose for -- every one of
 * these follows the same "current -> target -> linear dose" shape. pH is deliberately
 * NOT one of these keys: there is no ppm-delta formula for it (see computePhDose below),
 * only a titration a technician performs. Bromine is deliberately not one of these keys
 * either -- Taylor's own materials say to follow the sanitizer manufacturer's label, not
 * a chart; the Dosing Card renders a plain advisory note for it computed from nothing
 * here.
 */
export type DosingChemicalKey = "FREE_CHLORINE" | "ALKALINITY" | "CYA" | "CALCIUM_HARDNESS" | "SALT";

const DOSING_CHEMICAL_KEYS: DosingChemicalKey[] = ["FREE_CHLORINE", "ALKALINITY", "CYA", "CALCIUM_HARDNESS", "SALT"];

export const CHEMICAL_LABELS: Record<DosingChemicalKey, string> = {
  FREE_CHLORINE: "Free Chlorine",
  ALKALINITY: "Total Alkalinity",
  CYA: "Cyanuric Acid",
  CALCIUM_HARDNESS: "Calcium Hardness",
  SALT: "Salt",
};

export type DosingRecommendation = {
  chemicalKey: DosingChemicalKey;
  label: string;
  currentValue: number;
  targetValue: number;
  targetMin: number | null;
  targetMax: number | null;
  productName: string | null;
  formattedDose: string | null;
  note: string | null;
};

export type DosingResult = {
  visitId: string;
  bodyOfWaterId: string;
  recommendations: DosingRecommendation[];
  warnings: string[];
  computedAt: string;
};

function toNum(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function readingValueFor(key: DosingChemicalKey, reading: Record<string, unknown>): number | null {
  switch (key) {
    case "FREE_CHLORINE":
      return toNum(reading.freeChlorinePpm);
    case "ALKALINITY":
      return toNum(reading.alkalinityPpm);
    case "CYA":
      return toNum(reading.cyanuricAcidPpm);
    case "CALCIUM_HARDNESS":
      return toNum(reading.calciumHardnessPpm);
    case "SALT":
      return toNum(reading.saltPpm);
  }
}

// ---------------------------------------------------------------------------
// Unit display -- see AskUserQuestion decision: liquids auto-scale to cups/qt/gal
// (an exact unit conversion, no invented density), granular/dry stays in oz/lb
// (scale-measured, matching Taylor's own tables -- no invented scoop/cup conversion).
// ---------------------------------------------------------------------------

function roundTo(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function trimTrailingZeros(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/** flOz -> "X fl oz" / "X cups" / "X qt" / "X gal", auto-scaled per the thresholds fixed
 * with the user (8 fl oz = 1 cup, 32 fl oz = 1 qt, 128 fl oz = 1 gal). */
export function formatLiquidOz(flOz: number): string {
  if (flOz < 8) return `${trimTrailingZeros(roundTo(flOz, 0.5))} fl oz`;
  if (flOz < 32) {
    const cups = roundTo(flOz / 8, 0.25);
    return `${trimTrailingZeros(cups)} cup${cups === 1 ? "" : "s"}`;
  }
  if (flOz < 128) return `${trimTrailingZeros(roundTo(flOz / 32, 0.25))} qt`;
  return `${trimTrailingZeros(roundTo(flOz / 128, 0.25))} gal`;
}

/** oz -> "X oz" under 16, "X lb Y oz" at/above -- weight, scale-measured. */
export function formatWeightOz(oz: number): string {
  const rounded = roundTo(oz, 0.25);
  if (rounded < 16) return `${trimTrailingZeros(rounded)} oz`;
  const lb = Math.floor(rounded / 16);
  const remainderOz = roundTo(rounded - lb * 16, 0.25);
  return remainderOz === 0 ? `${lb} lb` : `${lb} lb ${trimTrailingZeros(remainderOz)} oz`;
}

function formatDose(amount: number, unit: DosingUnit): string {
  return unit === "FL_OZ" ? formatLiquidOz(amount) : formatWeightOz(amount);
}

// ---------------------------------------------------------------------------
// Target resolution -- reuses lib/compliance.ts's existing state-bound lookups
// (chlorineFamilyThreshold, activeChemistryThresholds) rather than duplicating them.
// Simplification vs. the prior version of this feature: no separate "legal vs. ideal"
// distinction is recreated here (that was removed along with the rest of the old dosing
// schema) -- the target/ideal range from lib/compliance.ts IS the bound an org override
// gets clamped against.
// ---------------------------------------------------------------------------

type Bounds = { min: number | null; max: number | null };

async function boundsFor(
  key: DosingChemicalKey,
  organizationId: string,
  bodyOfWaterType: string,
  disinfectionMethod: DisinfectionMethod,
): Promise<Bounds> {
  const ruleset = await getOrganizationRuleset(organizationId);
  if (!isComplianceActive(ruleset)) return { min: null, max: null };

  if (key === "FREE_CHLORINE") {
    if (disinfectionMethod !== "CHLORINE") return { min: null, max: null }; // bromine: no dose, see module doc comment
    const t = chlorineFamilyThreshold(ruleset, bodyOfWaterType, disinfectionMethod);
    return { min: t?.min ?? null, max: t?.max ?? null };
  }

  const thresholds = activeChemistryThresholds(ruleset);
  if (key === "ALKALINITY") return { min: thresholds.alkalinityTargetMinPpm, max: thresholds.alkalinityTargetMaxPpm };
  if (key === "CYA") return { min: thresholds.cyaTargetMinPpm, max: thresholds.cyaTargetMaxPpm };
  if (key === "CALCIUM_HARDNESS") return { min: thresholds.calciumHardnessTargetMinPpm, max: thresholds.calciumHardnessTargetMaxPpm };
  return { min: null, max: null }; // SALT: no ComplianceRuleset backing anywhere, see OrgComplianceTarget's doc comment
}

/** PH_DOWN/ALKALINITY_DOWN never have their own OrgComplianceTarget row -- pH and
 * Alkalinity are each one target range regardless of correction direction; the _UP
 * variant is canonical. See OrgComplianceTarget's schema doc comment. */
function orgTargetChemicalType(key: DosingChemicalKey): ChemicalType {
  if (key === "ALKALINITY") return "ALKALINITY_UP";
  return key;
}

type OrgTargetRow = { chemicalType: ChemicalType; orgTargetMin: unknown; orgTargetMax: unknown; orgTargetValue: unknown };

type ResolvedTarget = { targetValue: number; boundMin: number | null; boundMax: number | null };

function resolveTarget(key: DosingChemicalKey, bounds: Bounds, orgTarget: OrgTargetRow | null, warnings: string[]): ResolvedTarget | null {
  const boundMin = bounds.min;
  const boundMax = bounds.max;
  let targetValue: number | null = null;

  if (orgTarget) {
    const orgMin = toNum(orgTarget.orgTargetMin);
    const orgMax = toNum(orgTarget.orgTargetMax);
    const orgValue = toNum(orgTarget.orgTargetValue);
    let candidate = orgValue ?? (orgMin != null && orgMax != null ? (orgMin + orgMax) / 2 : (orgMin ?? orgMax));

    if (candidate != null) {
      if (boundMin != null && candidate < boundMin) {
        warnings.push(`${CHEMICAL_LABELS[key]} org target is below the compliance minimum -- clamped to ${boundMin}.`);
        candidate = boundMin;
      }
      if (boundMax != null && candidate > boundMax) {
        warnings.push(`${CHEMICAL_LABELS[key]} org target is above the compliance maximum -- clamped to ${boundMax}.`);
        candidate = boundMax;
      }
      targetValue = candidate;
    }
  }

  if (targetValue == null) {
    if (boundMin != null && boundMax != null) targetValue = (boundMin + boundMax) / 2;
    else if (boundMin != null) targetValue = boundMin;
    else if (boundMax != null) targetValue = boundMax;
  }

  if (targetValue == null) return null;
  return { targetValue, boundMin, boundMax };
}

/** UX-only tolerance (5%) for the rare chemical with no real min/max at all -- only a
 * single-point org target (Salt). Not a regulatory figure. */
const NO_RANGE_TOLERANCE_FRACTION = 0.05;

function isInRange(current: number, resolved: ResolvedTarget): boolean {
  if (resolved.boundMin != null || resolved.boundMax != null) {
    if (resolved.boundMin != null && current < resolved.boundMin) return false;
    if (resolved.boundMax != null && current > resolved.boundMax) return false;
    return true;
  }
  const tolerance = Math.abs(resolved.targetValue) * NO_RANGE_TOLERANCE_FRACTION;
  return Math.abs(current - resolved.targetValue) <= tolerance;
}

// ---------------------------------------------------------------------------
// Product selection
// ---------------------------------------------------------------------------

type CatalogRow = { id: string; name: string; chemicalType: ChemicalType; form: ChemicalProductForm; dosingUnit: DosingUnit; dosingConstant: unknown; isDemandBased: boolean };
type SettingWithCatalog = { id: string; isPrimary: boolean; catalogProduct: CatalogRow };

async function loadEnabledProductsByType(organizationId: string): Promise<Map<ChemicalType, SettingWithCatalog[]>> {
  const settings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId, isEnabled: true },
    include: { catalogProduct: true },
  });
  const byType = new Map<ChemicalType, SettingWithCatalog[]>();
  for (const s of settings as unknown as SettingWithCatalog[]) {
    const arr = byType.get(s.catalogProduct.chemicalType) ?? [];
    arr.push(s);
    byType.set(s.catalogProduct.chemicalType, arr);
  }
  return byType;
}

function pickPrimaryProduct(byType: Map<ChemicalType, SettingWithCatalog[]>, chemicalType: ChemicalType): SettingWithCatalog | null {
  const settings = byType.get(chemicalType);
  if (!settings || settings.length === 0) return null;
  return settings.find((s) => s.isPrimary) ?? settings[0];
}

/** FREE_CHLORINE only ever raises via a product in this calculator (no "too high"
 * guidance existed in the prior version either, beyond what Table C -- sodium thiosulfate
 * -- now actually provides, so FC-too-high IS handled, unlike Salt-too-high which still
 * has no product). ALKALINITY/CYA/CALCIUM_HARDNESS/SALT map to their own *_DOWN type only
 * where Taylor's tables provide one. */
function productChemicalTypeFor(key: DosingChemicalKey, direction: "UP" | "DOWN"): ChemicalType | null {
  if (key === "FREE_CHLORINE") return "FREE_CHLORINE"; // Table A (raise) or Table C (lower, sodium thiosulfate) -- same product family either way, see seed
  if (key === "ALKALINITY") return direction === "UP" ? "ALKALINITY_UP" : "ALKALINITY_DOWN";
  if (direction === "DOWN") return null; // CYA/Calcium Hardness too-high: no chemical corrects it, dilution only -- see below
  return key;
}

function buildRecommendation(input: {
  chemicalKey: DosingChemicalKey;
  currentValue: number;
  targetValue: number;
  targetMin: number | null;
  targetMax: number | null;
  productName?: string | null;
  formattedDose?: string | null;
  note?: string | null;
}): DosingRecommendation {
  return {
    chemicalKey: input.chemicalKey,
    label: CHEMICAL_LABELS[input.chemicalKey],
    currentValue: input.currentValue,
    targetValue: input.targetValue,
    targetMin: input.targetMin,
    targetMax: input.targetMax,
    productName: input.productName ?? null,
    formattedDose: input.formattedDose ?? null,
    note: input.note ?? null,
  };
}

/**
 * Computes dosing recommendations for a visit's just-saved reading and persists the
 * result to ChemistryRecommendation (the same generic JSON-payload model the prior
 * version of this feature used, which survived that removal since it isn't
 * dosing-schema-specific). Returns null when there's no reading yet or the body of water
 * has no configured volume. Safe to call on every reading save.
 */
export async function computeAndSaveDosingRecommendation(visitId: string): Promise<DosingResult | null> {
  const visit = await prisma.serviceVisit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      organizationId: true,
      bodyOfWater: { select: { id: true, type: true, disinfectionMethod: true, volumeGallons: true } },
      reading: true,
    },
  });
  if (!visit || !visit.reading || visit.bodyOfWater.volumeGallons == null) return null;

  const gallons = Number(visit.bodyOfWater.volumeGallons);

  const [orgTargets, enabledProductsByType] = await Promise.all([
    prisma.orgComplianceTarget.findMany({ where: { organizationId: visit.organizationId } }),
    loadEnabledProductsByType(visit.organizationId),
  ]);
  const orgTargetByType = new Map((orgTargets as unknown as OrgTargetRow[]).map((t) => [t.chemicalType, t]));

  const warnings: string[] = [];
  const recommendations: DosingRecommendation[] = [];
  let cyaOutOfRange = false;
  let alkalinityRecommended = false;

  for (const key of DOSING_CHEMICAL_KEYS) {
    const current = readingValueFor(key, visit.reading as unknown as Record<string, unknown>);
    if (current == null) continue; // chemical not read this visit -- nothing to act on

    const bounds = await boundsFor(key, visit.organizationId, visit.bodyOfWater.type, visit.bodyOfWater.disinfectionMethod);
    const orgTarget = orgTargetByType.get(orgTargetChemicalType(key)) ?? null;
    const resolved = resolveTarget(key, bounds, orgTarget, warnings);
    if (!resolved) continue; // no compliance bounds and no usable org override -- nothing to compare against

    if (isInRange(current, resolved)) continue;

    const direction: "UP" | "DOWN" = current < resolved.targetValue ? "UP" : "DOWN";
    const productChemicalType = productChemicalTypeFor(key, direction);

    if (!productChemicalType) {
      // CYA/Calcium Hardness too-high: no chemical corrects either -- partial drain/
      // refill only, same as the prior version of this feature (Taylor's tables have no
      // "lower CYA" or "lower Calcium Hardness" entry -- dilution is the only real fix).
      recommendations.push(
        buildRecommendation({
          chemicalKey: key,
          currentValue: current,
          targetValue: resolved.targetValue,
          targetMin: resolved.boundMin,
          targetMax: resolved.boundMax,
          note: `${CHEMICAL_LABELS[key]} is above range -- no chemical lowers it. Partial drain and refill, then recheck.`,
        }),
      );
      if (key === "CYA") cyaOutOfRange = true;
      continue;
    }

    const setting = pickPrimaryProduct(enabledProductsByType, productChemicalType);
    if (!setting) {
      recommendations.push(
        buildRecommendation({
          chemicalKey: key,
          currentValue: current,
          targetValue: resolved.targetValue,
          targetMin: resolved.boundMin,
          targetMax: resolved.boundMax,
          note: `No enabled primary product configured for ${CHEMICAL_LABELS[key]} -- set one on the Chemicals admin page.`,
        }),
      );
      if (key === "CYA") cyaOutOfRange = true;
      if (key === "ALKALINITY") alkalinityRecommended = true;
      continue;
    }

    const catalog = setting.catalogProduct;
    const delta = Math.abs(resolved.targetValue - current);
    const rawDose = Number(catalog.dosingConstant) * delta * (gallons / 10000);

    recommendations.push(
      buildRecommendation({
        chemicalKey: key,
        currentValue: current,
        targetValue: resolved.targetValue,
        targetMin: resolved.boundMin,
        targetMax: resolved.boundMax,
        productName: catalog.name,
        formattedDose: formatDose(rawDose, catalog.dosingUnit),
      }),
    );

    if (key === "CYA") cyaOutOfRange = true;
    if (key === "ALKALINITY") alkalinityRecommended = true;
  }

  if (alkalinityRecommended) {
    const phCurrent = toNum((visit.reading as unknown as Record<string, unknown>).ph);
    if (phCurrent != null) warnings.push("Adjust alkalinity before pH for best results.");
  }
  void cyaOutOfRange; // reserved for a future stabilizer-cross-effect warning if a product ever carries one again

  const result: DosingResult = {
    visitId,
    bodyOfWaterId: visit.bodyOfWater.id,
    recommendations,
    warnings,
    computedAt: new Date().toISOString(),
  };

  await prisma.chemistryRecommendation.upsert({
    where: { visitId },
    create: { visitId, payload: result },
    update: { payload: result },
  });

  return result;
}

/** Read-only counterpart -- returns whatever was last persisted without recomputing, for
 * viewing a completed visit (which should stay a point-in-time record, not get silently
 * replaced by today's product/target configuration on every later view). */
export async function getSavedDosingRecommendation(visitId: string): Promise<DosingResult | null> {
  const row = await prisma.chemistryRecommendation.findUnique({ where: { visitId } });
  return row ? (row.payload as unknown as DosingResult) : null;
}

// ---------------------------------------------------------------------------
// pH -- titration-based, not part of the automatic pass above. See ChemicalProductCatalog
// and PhDoseInput's doc comments. The drop count is never persisted (product decision --
// transient calculator input only).
// ---------------------------------------------------------------------------

export type PhDoseResult = {
  productName: string;
  formattedDose: string;
};

/** Computes a pH correction dose from a technician-entered Base/Acid Demand drop count --
 * the ONLY valid input for a pH dose, since acid/base demand isn't derivable from a pH
 * reading itself. Returns null if drops <= 0 or gallons is missing/invalid -- caller
 * should show nothing (not a fabricated dose) in that case. */
export function computePhDose(drops: number, product: { name: string; dosingConstant: unknown; dosingUnit: DosingUnit }, gallons: number | null): PhDoseResult | null {
  if (!drops || drops <= 0 || !gallons || gallons <= 0) return null;
  const rawDose = Number(product.dosingConstant) * drops * (gallons / 10000);
  return { productName: product.name, formattedDose: formatDose(rawDose, product.dosingUnit) };
}
