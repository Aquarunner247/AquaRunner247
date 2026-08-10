import { prisma } from "@/lib/prisma";
import {
  getOrganizationRuleset,
  isComplianceActive,
  chlorineFamilyThreshold,
  activeChemistryThresholds,
  type ComplianceRulesetWithRules,
} from "@/lib/compliance";
import type { ChemicalProductForm, ChemicalType, ComplianceTargetMode, DisinfectionMethod, DosingUnit } from "@/generated/prisma/enums";

/**
 * DosingCalculationService -- see dosing-calculator-spec.md for the full design. Runs
 * after a chemistry reading is saved (app/api/visits/[id]/reading/route.ts) and persists
 * its output to ChemistryRecommendation.payload (unique per visit), which the visit page's
 * "Recommended Dosing" card reads back.
 */

/** The six standard chemicals this feature covers (spec Overview). Distinct from the
 * ChemicalType enum, which splits pH into PH_UP/PH_DOWN by PRODUCT direction -- this key
 * is what's actually measured on a reading. Bromine is out of scope for v1 (see
 * ChemicalType's schema doc comment). */
export type DosingChemicalKey = "FREE_CHLORINE" | "PH" | "ALKALINITY" | "CYA" | "CALCIUM_HARDNESS" | "SALT";

const DOSING_CHEMICAL_KEYS: DosingChemicalKey[] = ["FREE_CHLORINE", "PH", "ALKALINITY", "CYA", "CALCIUM_HARDNESS", "SALT"];

export const CHEMICAL_LABELS: Record<DosingChemicalKey, string> = {
  FREE_CHLORINE: "Free Chlorine",
  PH: "pH",
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
  /** Null when no enabled+primary product is configured for this chemical/direction, or
   * when the correction is actionRequired (dilution) rather than a product dose. */
  productSettingId: string | null;
  productName: string | null;
  /** Drives the display-only unit conversion in DosingCard (oz->cups/qt/gal for LIQUID,
   * oz->lb for GRANULAR/TABLET/PUCK) -- fl-oz-to-volume only makes sense for a liquid;
   * doing it for a dry product would assume a bulk density this app doesn't have. */
  productForm: ChemicalProductForm | null;
  recommendedDose: number | null;
  dosingUnit: DosingUnit | null;
  capped: boolean;
  /** Set instead of a product dose when no chemical correction exists at all (CYA/Calcium
   * Hardness over-range -- spec Section 6: partial drain/refill, not a product). */
  actionRequired: "DILUTION" | null;
  note: string | null;
};

export type DosingResult = {
  visitId: string;
  bodyOfWaterId: string;
  recommendations: DosingRecommendation[];
  warnings: string[];
  computedAt: string;
};

/** Inverse of orgTargetChemicalType -- for grouping ChemicalProductCatalog rows (keyed by
 * the 7-value product ChemicalType) back to the 6-value measured-chemical key the Chemicals
 * admin page displays a target for. PH_DOWN maps to the same "PH" key as PH_UP since
 * they're one target either direction (see orgTargetChemicalType's doc comment). */
export function dosingChemicalKeyFor(chemicalType: ChemicalType): DosingChemicalKey {
  if (chemicalType === "PH_UP" || chemicalType === "PH_DOWN") return "PH";
  if (chemicalType === "ALKALINITY_UP") return "ALKALINITY";
  return chemicalType as DosingChemicalKey;
}

function toNum(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function readingValueFor(key: DosingChemicalKey, reading: Record<string, unknown>): number | null {
  switch (key) {
    case "FREE_CHLORINE":
      return toNum(reading.freeChlorinePpm);
    case "PH":
      return toNum(reading.ph);
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

export type LegalBounds = { min: number | null; max: number | null };

/** Legal min/max from the org's own ComplianceRuleset, per dosing-calculator-spec.md
 * Section 1c step 1. Returns {null, null} whenever compliance isn't active for this
 * account (unsupported state, no ruleset) or this chemical has no compliance basis at all
 * (Calcium Hardness, Salt) -- never a fabricated number, per isComplianceActive's gating
 * contract in lib/compliance.ts. */
export function legalBoundsFor(
  key: DosingChemicalKey,
  ruleset: ComplianceRulesetWithRules | null,
  bodyOfWaterType: string,
  disinfectionMethod: DisinfectionMethod,
): LegalBounds {
  if (!isComplianceActive(ruleset)) return { min: null, max: null };

  if (key === "FREE_CHLORINE") {
    // Bromine dosing is out of scope for v1 -- see ChemicalType's schema doc comment.
    if (disinfectionMethod !== "CHLORINE") return { min: null, max: null };
    const t = chlorineFamilyThreshold(ruleset, bodyOfWaterType, disinfectionMethod);
    return { min: t?.min ?? null, max: t?.max ?? null };
  }

  // Uses the *legal* bound fields, not phTargetMin/Max et al -- those track the state's
  // narrower "ideal" sub-range where one exists (see activeChemistryThresholds's doc
  // comment), which is the wrong thing to clamp an org's custom target against here: a
  // target between the legal bound and the ideal sub-range is still legally compliant.
  const thresholds = activeChemistryThresholds(ruleset);
  if (key === "PH") return { min: thresholds.phLegalMin, max: thresholds.phLegalMax };
  if (key === "ALKALINITY") return { min: thresholds.alkalinityLegalMinPpm, max: thresholds.alkalinityLegalMaxPpm };
  if (key === "CYA") return { min: thresholds.cyaLegalMinPpm, max: thresholds.cyaLegalMaxPpm };
  // CALCIUM_HARDNESS, SALT: no health department regulates these -- OrgComplianceTarget
  // (ORG_CUSTOM) is the only way to get a target; see OrgComplianceTarget's schema doc.
  return { min: null, max: null };
}

type OrgTargetRow = { state: string; chemicalType: ChemicalType; targetMode: ComplianceTargetMode; orgTargetMin: unknown; orgTargetMax: unknown; orgTargetValue: unknown };

/** OrgComplianceTarget.chemicalType reuses the product-direction ChemicalType enum
 * (PH_UP/PH_DOWN), but a pH target is one range regardless of direction -- PH_UP is
 * treated as the canonical row for pH overrides; a PH_DOWN-only override row is ignored
 * for target resolution (a org should only ever set PH_UP). Documented convention, not a
 * schema bug -- see dosing-calculator-spec.md Section 1c. */
function orgTargetChemicalType(key: DosingChemicalKey): ChemicalType {
  if (key === "PH") return "PH_UP";
  if (key === "ALKALINITY") return "ALKALINITY_UP";
  return key;
}

function findOrgTarget(key: DosingChemicalKey, state: string | null, orgTargets: OrgTargetRow[]): OrgTargetRow | null {
  if (!state) return null;
  const chemicalType = orgTargetChemicalType(key);
  return orgTargets.find((t) => t.state === state && t.chemicalType === chemicalType) ?? null;
}

type ResolvedTarget = { targetValue: number; boundMin: number | null; boundMax: number | null };

/** Resolution order per dosing-calculator-spec.md Section 1c: legal bounds first, then an
 * ORG_CUSTOM override clamped within them (or the plain legal midpoint if no usable
 * override exists). Returns null only when there's truly nothing to act on -- no legal
 * bounds AND no usable org override -- rather than ever inventing a number. */
function resolveTarget(
  key: DosingChemicalKey,
  legal: LegalBounds,
  orgTarget: OrgTargetRow | null,
  warnings: string[],
): ResolvedTarget | null {
  const boundMin = legal.min;
  const boundMax = legal.max;
  let targetValue: number | null = null;

  if (orgTarget && orgTarget.targetMode === "ORG_CUSTOM") {
    const orgMin = toNum(orgTarget.orgTargetMin);
    const orgMax = toNum(orgTarget.orgTargetMax);
    const orgValue = toNum(orgTarget.orgTargetValue);
    let candidate = orgValue ?? (orgMin != null && orgMax != null ? (orgMin + orgMax) / 2 : (orgMin ?? orgMax));

    if (candidate != null) {
      if (boundMin != null && candidate < boundMin) {
        warnings.push(`${CHEMICAL_LABELS[key]} org target is below the legal minimum -- clamped to ${boundMin}.`);
        candidate = boundMin;
      }
      if (boundMax != null && candidate > boundMax) {
        warnings.push(`${CHEMICAL_LABELS[key]} org target is above the legal maximum -- clamped to ${boundMax}.`);
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

/** A UX tolerance default (5%) for the rare case a chemical has no real min/max at all --
 * only a single-point org target (e.g. Salt, generator-specified ppm). NOT a regulatory
 * figure; documented here so it's never mistaken for one. */
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

function roundToIncrement(value: number, increment: number): number {
  if (!increment || increment <= 0) return value;
  const rounded = Math.round(value / increment) * increment;
  const decimals = Math.min(6, (increment.toString().split(".")[1] || "").length);
  return Number(rounded.toFixed(decimals));
}

/** Which ChemicalType catalog products actually apply for this chemical + direction. Null
 * means no chemical correction exists in this direction -- caller decides whether that's
 * a DILUTION actionRequired (CYA/Calcium Hardness, per spec Section 6), a warnings-only
 * note (Alkalinity -- "defer to pH-down guidance rather than get its own product"), or a
 * silent skip (Free Chlorine/Salt too-high -- no spec guidance given, not fabricated). */
function productChemicalTypeFor(key: DosingChemicalKey, direction: "UP" | "DOWN"): ChemicalType | null {
  if (direction === "DOWN" && key !== "PH") return null;
  switch (key) {
    case "FREE_CHLORINE":
      return "FREE_CHLORINE";
    case "PH":
      return direction === "UP" ? "PH_UP" : "PH_DOWN";
    case "ALKALINITY":
      return "ALKALINITY_UP";
    case "CYA":
      return "CYA";
    case "CALCIUM_HARDNESS":
      return "CALCIUM_HARDNESS";
    case "SALT":
      return "SALT";
  }
}

type CatalogRow = {
  id: string;
  name: string;
  chemicalType: ChemicalType;
  form: ChemicalProductForm;
  dosingUnit: DosingUnit;
  dosingFactor: unknown;
  defaultMaxDosePerVisit: unknown;
  defaultRoundingIncrement: unknown;
  cyaAddedPerFcPpm: unknown;
};
type SettingWithCatalog = {
  id: string;
  isPrimary: boolean;
  maxDosePerVisit: unknown;
  roundingIncrement: unknown;
  catalogProduct: CatalogRow;
};

/** Every enabled product this org could possibly need for this body's pool-vs-spa scale,
 * across all 7 product chemical types, fetched once instead of once per chemical (up to 6
 * sequential round trips previously -- see pickPrimaryProduct's caller). Scoped by
 * poolOrSpa (schema's documented isPrimary invariant is per (chemicalType, poolOrSpa), not
 * chemicalType alone) so a POOL- or SPA-specific catalog row is never handed to the wrong
 * body type; a BOTH-scoped row (every current v1 seed row) matches either. */
async function loadEnabledProductsByType(
  organizationId: string,
  poolOrSpa: "POOL" | "SPA",
): Promise<Map<ChemicalType, SettingWithCatalog[]>> {
  const settings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId, isEnabled: true, catalogProduct: { poolOrSpa: { in: [poolOrSpa, "BOTH"] } } },
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

/** Fills in every DosingRecommendation field with its "nothing to report" default, so each
 * of the three call sites (dilution, no-product-configured, product dose) only has to state
 * what's actually different about that case. A field added later only needs to be added
 * here once, instead of independently to three near-identical literals. */
function buildRecommendation(input: {
  chemicalKey: DosingChemicalKey;
  currentValue: number;
  targetValue: number;
  targetMin: number | null;
  targetMax: number | null;
  productSettingId?: string | null;
  productName?: string | null;
  productForm?: ChemicalProductForm | null;
  recommendedDose?: number | null;
  dosingUnit?: DosingUnit | null;
  capped?: boolean;
  actionRequired?: "DILUTION" | null;
  note?: string | null;
}): DosingRecommendation {
  return {
    chemicalKey: input.chemicalKey,
    label: CHEMICAL_LABELS[input.chemicalKey],
    currentValue: input.currentValue,
    targetValue: input.targetValue,
    targetMin: input.targetMin,
    targetMax: input.targetMax,
    productSettingId: input.productSettingId ?? null,
    productName: input.productName ?? null,
    productForm: input.productForm ?? null,
    recommendedDose: input.recommendedDose ?? null,
    dosingUnit: input.dosingUnit ?? null,
    capped: input.capped ?? false,
    actionRequired: input.actionRequired ?? null,
    note: input.note ?? null,
  };
}

/**
 * Computes dosing recommendations for a visit's just-saved reading and persists the
 * result to ChemistryRecommendation. Returns null when there's no reading yet or the body
 * of water has no configured volume -- nothing to compute against. Safe to call on every
 * reading save; org accounts with no products enabled and no compliance targets simply
 * get an empty recommendations[] (still saved, so the card can say "not configured yet"
 * instead of showing nothing).
 */
export async function computeAndSaveDosingRecommendation(visitId: string): Promise<DosingResult | null> {
  const visit = await prisma.serviceVisit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { state: true } },
      bodyOfWater: { select: { id: true, type: true, disinfectionMethod: true, volumeGallons: true } },
      reading: true,
    },
  });
  if (!visit || !visit.reading || visit.bodyOfWater.volumeGallons == null) return null;

  const gallons = Number(visit.bodyOfWater.volumeGallons);
  const state = visit.organization.state;
  const poolOrSpa: "POOL" | "SPA" = visit.bodyOfWater.type === "SPA" ? "SPA" : "POOL";

  const [ruleset, orgTargets, enabledProductsByType] = await Promise.all([
    getOrganizationRuleset(visit.organizationId),
    prisma.orgComplianceTarget.findMany({ where: { organizationId: visit.organizationId } }),
    loadEnabledProductsByType(visit.organizationId, poolOrSpa),
  ]);

  const warnings: string[] = [];
  const recommendations: DosingRecommendation[] = [];
  /** Tracks whether a CYA-raising recommendation and a stabilizer-adding FC product were
   * both selected this pass, for the cross-effect sequencing warning below. */
  let cyaRecommended = false;
  let fcProductAddsCya = false;
  let alkalinityRecommended = false;
  let phRecommended = false;

  for (const key of DOSING_CHEMICAL_KEYS) {
    const current = readingValueFor(key, visit.reading as unknown as Record<string, unknown>);
    if (current == null) continue; // chemical not read this visit -- nothing to act on

    const legal = legalBoundsFor(key, ruleset, visit.bodyOfWater.type, visit.bodyOfWater.disinfectionMethod);
    const orgTarget = findOrgTarget(key, state, orgTargets as unknown as OrgTargetRow[]);
    const resolved = resolveTarget(key, legal, orgTarget, warnings);
    if (!resolved) continue; // no legal bounds and no usable org override -- nothing to compare against

    if (isInRange(current, resolved)) continue;

    const direction: "UP" | "DOWN" = current < resolved.targetValue ? "UP" : "DOWN";
    const productChemicalType = productChemicalTypeFor(key, direction);

    if (!productChemicalType) {
      if ((key === "CYA" || key === "CALCIUM_HARDNESS") && direction === "DOWN") {
        recommendations.push(
          buildRecommendation({
            chemicalKey: key,
            currentValue: current,
            targetValue: resolved.targetValue,
            targetMin: resolved.boundMin,
            targetMax: resolved.boundMax,
            actionRequired: "DILUTION",
            note: `${CHEMICAL_LABELS[key]} is above range -- no chemical lowers it. Partial drain and refill, then recheck.`,
          }),
        );
      } else if (key === "ALKALINITY" && direction === "DOWN") {
        warnings.push(
          "Total Alkalinity is above range -- there's no dedicated lowering product; it's normally corrected via pH-down (muriatic acid) plus aeration. Recheck next visit.",
        );
      }
      // FREE_CHLORINE/SALT too-high: no spec guidance for a correction action -- skipped
      // silently rather than inventing one (see productChemicalTypeFor's doc comment).
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
      if (key === "CYA") cyaRecommended = true;
      if (key === "ALKALINITY") alkalinityRecommended = true;
      if (key === "PH") phRecommended = true;
      continue;
    }

    const catalog = setting.catalogProduct;
    const delta = Math.abs(resolved.targetValue - current);
    const dosingFactor = Number(catalog.dosingFactor);
    const rawDose = dosingFactor * delta * (gallons / 10000);
    const increment = Number(setting.roundingIncrement ?? catalog.defaultRoundingIncrement);
    const roundedDose = roundToIncrement(rawDose, increment);
    const maxDose = setting.maxDosePerVisit != null ? Number(setting.maxDosePerVisit) : catalog.defaultMaxDosePerVisit != null ? Number(catalog.defaultMaxDosePerVisit) : null;
    const capped = maxDose != null && roundedDose > maxDose;

    let note: string | null = capped ? "Max safe dose applied -- recheck next visit." : null;
    // pH acid-demand caveat (Section 6): the muriatic/soda-ash constants assume TA in the
    // 80-120 ppm range; outside it, actual demand is TA-dependent and this is an estimate.
    if (key === "PH") {
      const ta = toNum((visit.reading as unknown as Record<string, unknown>).alkalinityPpm);
      if (ta != null && (ta < 80 || ta > 120)) {
        note = [note, "Estimate -- Total Alkalinity is outside the normal 80-120 ppm range this formula assumes; verify with an acid demand test."]
          .filter(Boolean)
          .join(" ");
      }
    }

    recommendations.push(
      buildRecommendation({
        chemicalKey: key,
        currentValue: current,
        targetValue: resolved.targetValue,
        targetMin: resolved.boundMin,
        targetMax: resolved.boundMax,
        productSettingId: setting.id,
        productName: catalog.name,
        productForm: catalog.form,
        recommendedDose: capped ? maxDose : roundedDose,
        dosingUnit: catalog.dosingUnit,
        capped,
        note,
      }),
    );

    if (key === "CYA") cyaRecommended = true;
    if (key === "ALKALINITY") alkalinityRecommended = true;
    if (key === "PH") phRecommended = true;
    if (key === "FREE_CHLORINE" && catalog.cyaAddedPerFcPpm != null) fcProductAddsCya = true;
  }

  if (alkalinityRecommended && phRecommended) {
    warnings.push("Adjust alkalinity before pH for best results.");
  }
  if (fcProductAddsCya && cyaRecommended) {
    warnings.push("Avoid adding stabilizer this visit -- the recommended chlorine product already raises CYA.");
  }

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

/**
 * Read-only counterpart to computeAndSaveDosingRecommendation -- returns whatever was last
 * persisted for this visit without recomputing or overwriting it. Use this (not the
 * compute-and-save version) anywhere a visit is only being viewed, not actively serviced --
 * e.g. a completed visit's page, which should stay a point-in-time record of what was true
 * when the visit was serviced rather than get silently replaced by today's product/target
 * configuration on every later view (an audit, a customer looking back at history, etc).
 */
export async function getSavedDosingRecommendation(visitId: string): Promise<DosingResult | null> {
  const row = await prisma.chemistryRecommendation.findUnique({ where: { visitId } });
  return row ? (row.payload as unknown as DosingResult) : null;
}
