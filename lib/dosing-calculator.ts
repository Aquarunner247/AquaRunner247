import { prisma } from "@/lib/prisma";
import { getOrganizationRuleset, isComplianceActive, chlorineFamilyThreshold, activeChemistryThresholds } from "@/lib/compliance";
import { formatDose, convertToBillingUnit, daysUntilNextWeekday, computeTabletRecommendation, buildTabletNote } from "@/lib/dosing-units";
import type { ChemicalType, DosingUnit, DisinfectionMethod, ChlorineFeedMechanism } from "@/generated/prisma/enums";
import {
  pickPrimaryProduct,
  type LinkedBillingProduct,
  type SettingWithCatalog,
} from "@/lib/dose-product-selection";
import {
  estimateChlorineDemand,
  buildDecayIntervals,
  projectCarryTarget,
  needsCarryTopUp,
  buildCarryNote,
  DEMAND_LOOKBACK_DAYS,
  TABLET_FEEDER_CARRY_ACTION,
  type ChlorineDemand,
  type CarryProjection,
  type DemandReading,
} from "@/lib/chlorine-demand";

export { formatLiquidOz, formatWeightOz, convertToBillingUnit, daysUntilNextWeekday, computeTabletRecommendation } from "@/lib/dosing-units";

/**
 * The chemicals this calculator can automatically recommend a dose for -- every one of
 * these follows the same "current -> target -> linear dose" shape. pH is deliberately
 * NOT one of these keys: there is no ppm-delta formula for it (see computePhDose below),
 * only a titration a technician performs. Bromine is deliberately not one of these keys
 * either -- Taylor's own materials say to follow the sanitizer manufacturer's label, not
 * a chart; the Dosing Card renders a plain advisory note for it computed from nothing
 * here.
 */
export type DosingChemicalKey = "FREE_CHLORINE" | "ALKALINITY" | "CYA" | "CALCIUM_HARDNESS" | "SALT" | "PH";

const DOSING_CHEMICAL_KEYS: Exclude<DosingChemicalKey, "PH">[] = ["FREE_CHLORINE", "ALKALINITY", "CYA", "CALCIUM_HARDNESS", "SALT"];

export const CHEMICAL_LABELS: Record<DosingChemicalKey, string> = {
  FREE_CHLORINE: "Free Chlorine",
  ALKALINITY: "Total Alkalinity",
  CYA: "Cyanuric Acid",
  CALCIUM_HARDNESS: "Calcium Hardness",
  SALT: "Salt",
  PH: "pH",
};

/** pH's out-of-range status -- NOT a dose, since there's no ppm-delta formula for pH (see
 * computePhDose below). This just tells the UI whether/which-direction to prompt a
 * technician to run a demand test, computed server-side from the same target-resolution
 * logic every other chemical uses, instead of the UI showing a generic always-there button
 * regardless of whether pH actually needs correcting. */
export type PhRangeStatus = {
  currentValue: number;
  targetValue: number;
  targetMin: number | null;
  targetMax: number | null;
  direction: "RAISE" | "LOWER";
};

/** Present only when a computed dose has a usable link to the org's own billing catalog
 * (see OrgChemicalProductSetting.linkedBillingProductId). `convertedQuantity` is null when
 * a link exists but its unit isn't one convertToBillingUnit recognizes (e.g. "tablet") --
 * still worth exposing chemicalProductId in that case so the UI can pre-select the right
 * product in the manual-entry fallback even though it can't prefill the quantity. */
export type DosingBillingLink = {
  chemicalProductId: string;
  unit: string;
  convertedQuantity: number | null;
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
  /** Raw amount + unit backing `formattedDose`, needed by the client to convert into
   * whatever billing unit the technician ultimately applies this as. Null whenever
   * formattedDose is (no product chosen, or dilution-only). */
  rawAmount: number | null;
  dosingUnit: DosingUnit | null;
  billingLink: DosingBillingLink | null;
};

export type DosingResult = {
  visitId: string;
  bodyOfWaterId: string;
  recommendations: DosingRecommendation[];
  phStatus: PhRangeStatus | null;
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
    case "PH":
      return toNum(reading.ph);
  }
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
  if (key === "PH") return { min: thresholds.phTargetMin, max: thresholds.phTargetMax };
  return { min: null, max: null }; // SALT: no ComplianceRuleset backing anywhere, see OrgComplianceTarget's doc comment
}

/** PH_DOWN/ALKALINITY_DOWN never have their own OrgComplianceTarget row -- pH and
 * Alkalinity are each one target range regardless of correction direction; the _UP
 * variant is canonical. See OrgComplianceTarget's schema doc comment. */
function orgTargetChemicalType(key: DosingChemicalKey): ChemicalType {
  if (key === "ALKALINITY") return "ALKALINITY_UP";
  if (key === "PH") return "PH_UP";
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

/**
 * Where the acid recommendation starts, regardless of how wide the state's own pH band is.
 *
 * A state's band answers "is this water acceptable", which is not the question the Dosing Card
 * asks -- that one is "should the technician add acid today". Nevada's seeded band is 7.0-7.8,
 * so a pool at exactly 7.8 sat inside the range and the card said nothing: 203 of this org's
 * readings in the 90 days to 2026-11-17 were exactly 7.80, every one of them silent, against 81
 * at 8.00 that did prompt. The operator asked for acid above 7.6 that day.
 *
 * This does not invent a standard. Connecticut, Colorado, Oklahoma and five others already
 * publish 7.4-7.6 as their own ideal, activeChemistryThresholds prefers an ideal band over the
 * legal one, and those states have therefore always prompted above 7.6. The cap gives the
 * wide-band states the behaviour the narrow-band ones already had.
 *
 * ONLY THE CEILING MOVES. Tightening the floor to 7.4 would be the symmetric change, and it
 * would start asking for a Base Demand test on 121 readings in those same 90 days (7.0-7.3).
 * That is a different judgement the operator did not make -- a pool at 7.2 carrying 140 ppm
 * alkalinity is usually left alone -- so the floor stays whatever the state says.
 */
export const PH_ACID_CEILING = 7.6;

/**
 * What to aim for once acid is going in: the endpoint a Taylor Acid Demand titration is run to,
 * and the middle of the industry's 7.4-7.6. Display and direction only -- the dose itself comes
 * from the technician's drop count (see computePhDose) and never from this number.
 */
export const PH_AIM = 7.5;

/**
 * Narrows a state-derived pH band to the aim band above. Never raises a ceiling (a state
 * tighter than 7.6 keeps its own), never pushes the ceiling below the floor, and is applied
 * only when the org has not set its own pH target -- an operator who states a band has
 * answered this question themselves.
 *
 * Exported for lib/__tests__/ph-aim-band.test.ts -- the band decides whether a technician is
 * told to add acid at all, which is worth asserting on directly rather than only through the
 * Prisma-bound calculator around it.
 */
export function applyPhAimBand(resolved: ResolvedTarget): ResolvedTarget {
  const capped = resolved.boundMax != null ? Math.min(resolved.boundMax, PH_ACID_CEILING) : PH_ACID_CEILING;
  const boundMax = resolved.boundMin != null ? Math.max(capped, resolved.boundMin) : capped;
  let targetValue = PH_AIM;
  if (resolved.boundMin != null && targetValue < resolved.boundMin) targetValue = resolved.boundMin;
  if (targetValue > boundMax) targetValue = boundMax;
  return { targetValue, boundMin: resolved.boundMin, boundMax };
}

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

/** Builds the billingLink for a computed dose, or null if unlinked or the link points at a
 * since-deactivated billing product. Shared by both the ppm-based pass below and
 * computePhDose, so the two stay consistent. */
function buildBillingLink(linkedBillingProduct: LinkedBillingProduct | null, rawAmount: number, dosingUnit: DosingUnit): DosingBillingLink | null {
  if (!linkedBillingProduct || !linkedBillingProduct.active) return null;
  return {
    chemicalProductId: linkedBillingProduct.id,
    unit: linkedBillingProduct.unit,
    convertedQuantity: convertToBillingUnit(rawAmount, dosingUnit, linkedBillingProduct.unit),
  };
}

async function loadEnabledProductsByType(organizationId: string): Promise<Map<ChemicalType, SettingWithCatalog[]>> {
  const settings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId, isEnabled: true },
    include: { catalogProduct: true, linkedBillingProduct: { select: { id: true, unit: true, active: true } } },
  });
  const byType = new Map<ChemicalType, SettingWithCatalog[]>();
  for (const s of settings as unknown as SettingWithCatalog[]) {
    const arr = byType.get(s.catalogProduct.chemicalType) ?? [];
    arr.push(s);
    byType.set(s.catalogProduct.chemicalType, arr);
  }
  return byType;
}

/** Prefixes a FREE_CHLORINE recommendation's note with mechanism-specific guidance -- a low
 * reading at a feeder- or pump-fed body usually means "check/refill it," not "here's how
 * much to pour in right now." Empty for MANUAL, which keeps today's behavior unchanged. */
function feedMechanismPrefix(mechanism: ChlorineFeedMechanism): string {
  if (mechanism === "TABLET_FEEDER") {
    return "This body uses a tablet feeder for chlorine -- check/refill the feeder first. If FC is still low after that, ";
  }
  if (mechanism === "TABLET_FLOATER") {
    return "This body uses a floating tablet dispenser -- check it is not empty or stuck in a corner first. If FC is still low after that, ";
  }
  if (mechanism === "LIQUID_FEED_PUMP") {
    return "This body uses a liquid chlorine feed pump -- check the tank level and pump operation first. If FC is still low after that, ";
  }
  return "";
}

/** Resolves how many days until this body of water's next regularly-scheduled visit, used
 * to project a tablet-feeder maintenance dose (see computeTabletRecommendation).
 * Deliberately reads the recurring pattern directly (RecurringStop -> RecurringRoute.dayOfWeek)
 * rather than querying ServiceVisit for "the next scheduled visit" the way
 * lib/phone-agent-status.ts's nextVisitAnswer does -- those rows only exist once someone
 * has actually loaded that day's schedule (see ensureVisitsGeneratedForDate), so a future
 * date nobody has browsed to yet may have no row at all. RecurringRoute.frequency
 * (WEEKLY/BIWEEKLY/CUSTOM) isn't read here because it isn't read anywhere in visit
 * generation either -- every active route matching today's weekday generates a visit
 * every week regardless of its frequency value, so there's no biweekly cadence to account
 * for today. Null when the body has no active recurring stop at all (ad-hoc-only, or not
 * yet routed). The actual weekday-distance arithmetic is daysUntilNextWeekday in
 * lib/dosing-units.ts (kept Prisma-free and unit-tested there); this is just the DB lookup
 * feeding it.
 */
async function daysUntilNextVisit(bodyOfWaterId: string, organizationId: string): Promise<number | null> {
  const stops = await prisma.recurringStop.findMany({
    where: { bodyOfWaterId, route: { organizationId, active: true } },
    select: { route: { select: { dayOfWeek: true } } },
  });
  const weekdays = stops.map((s) => s.route.dayOfWeek).filter((d): d is number => d != null);

  // JS getDay(): Sun=0..Sat=6 -> ISO weekday Mon=1..Sun=7, same conversion visit-generation.ts uses.
  const todayIso = ((new Date().getDay() + 6) % 7) + 1;
  return daysUntilNextWeekday(todayIso, weekdays);
}

/** Matches a logged dose to chlorine by name when it has no link into the dosing catalog.
 * "Shock" is the real case here -- 14 of this org's logged doses are an unlinked product by
 * that name -- and missing it would count a shocked interval as pure decay and overstate the
 * pool's standing demand. */
const CHLORINE_PRODUCT_NAME = /chlor|shock|tablet|trichlor|cal.?hypo|bleach|dichlor/i;

/**
 * This body of water's own free-chlorine demand, measured from its recent service history.
 *
 * Only intervals that OPEN on a visit where no chlorine was logged are measured: with nothing
 * added, the drop between two readings is decay and nothing else, so no assumption about what
 * the technician poured has to be modelled. Chlorine is identified by a link into the dosing
 * catalog where one exists and by name otherwise (see CHLORINE_PRODUCT_NAME).
 *
 * logOnlyRecord is passed through to buildDecayIntervals, which is where the rule that a
 * log-only record may close an interval but never open one is stated and tested. It matters
 * because those records carry no dose rows by construction: all 1,299 of this org's have zero
 * doses against 252 of 764 real visits, so an empty dose list there means "unrecorded", not
 * "none". This org's uploads turn out to be benign -- excluding them moves the four affected
 * bodies by at most 2.4 percentage points, and only Borgata's Gym (NE) Pool loses its measured
 * status (4 usable intervals to 2). The next org to upload a year of history for a pool it was
 * shocking weekly is the one this protects.
 *
 * The intervals this discards are not wasted -- they are what the decay law was validated
 * against, since a dosed interval is a prediction the model never trained on. See the measured
 * comparison in chlorine-demand.ts's header.
 *
 * Every interval in range is passed through, including ones ending at 0 ppm: the estimator
 * drops those from its median itself but needs to see them to report floorCensored.
 *
 * Returns the documented default when the pool has too little history -- a new property, or one
 * whose readings mostly lack free chlorine -- so a brand-new body of water still gets a
 * carry-aware dose rather than the old bring-to-target-and-hope one.
 */
async function loadChlorineDemand(bodyOfWaterId: string, organizationId: string): Promise<ChlorineDemand> {
  const since = new Date(Date.now() - DEMAND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [visits, chlorineSettings] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: {
        bodyOfWaterId,
        organizationId,
        status: "COMPLETED",
        completedAt: { gte: since },
        reading: { freeChlorinePpm: { not: null } },
      },
      orderBy: { completedAt: "asc" },
      select: {
        completedAt: true,
        logOnlyRecord: true,
        reading: { select: { freeChlorinePpm: true } },
        doses: { select: { productName: true, chemicalProductId: true } },
      },
    }),
    prisma.orgChemicalProductSetting.findMany({
      where: { organizationId, catalogProduct: { chemicalType: "FREE_CHLORINE" }, linkedBillingProductId: { not: null } },
      select: { linkedBillingProductId: true },
    }),
  ]);

  const chlorineBillingIds = new Set(
    chlorineSettings.map((s) => s.linkedBillingProductId).filter((id): id is string => id != null),
  );

  const readings: DemandReading[] = visits
    .filter((v) => v.completedAt != null && v.reading?.freeChlorinePpm != null)
    .map((v) => ({
      at: v.completedAt as Date,
      fc: Number(v.reading!.freeChlorinePpm),
      chlorineAdded: v.doses.some(
        (d) =>
          (d.chemicalProductId != null && chlorineBillingIds.has(d.chemicalProductId)) ||
          CHLORINE_PRODUCT_NAME.test(d.productName),
      ),
      doseDataMissing: v.logOnlyRecord,
    }));

  return estimateChlorineDemand(buildDecayIntervals(readings));
}

/** FREE_CHLORINE only ever raises via a product in this calculator (no "too high"
 * guidance existed in the prior version either, beyond what Table C -- sodium thiosulfate
 * -- now actually provides, so FC-too-high IS handled, unlike Salt-too-high which still
 * has no product). ALKALINITY/CYA/CALCIUM_HARDNESS/SALT map to their own *_DOWN type only
 * where Taylor's tables provide one. */
function productChemicalTypeFor(key: Exclude<DosingChemicalKey, "PH">, direction: "UP" | "DOWN"): ChemicalType | null {
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
  rawAmount?: number | null;
  dosingUnit?: DosingUnit | null;
  billingLink?: DosingBillingLink | null;
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
    rawAmount: input.rawAmount ?? null,
    dosingUnit: input.dosingUnit ?? null,
    billingLink: input.billingLink ?? null,
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
      bodyOfWater: { select: { id: true, type: true, disinfectionMethod: true, chlorineFeedMechanism: true, volumeGallons: true } },
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

  // How much cyanuric acid room is left, for the chlorine note to reason with. Trichlor brings
  // stabiliser in with it, so on a tablet-fed body this is the difference between "raise CYA so
  // UV stops burning the chlorine off" being the fix and being impossible. Null when CYA was not
  // read this visit or nothing caps it.
  const cyaCurrent = readingValueFor("CYA", visit.reading as unknown as Record<string, unknown>);
  const cyaBounds = await boundsFor("CYA", visit.organizationId, visit.bodyOfWater.type, visit.bodyOfWater.disinfectionMethod);
  const cyaOrgMax = toNum(orgTargetByType.get("CYA")?.orgTargetMax ?? null);
  const cyaCeiling = Math.min(cyaBounds.max ?? Number.POSITIVE_INFINITY, cyaOrgMax ?? Number.POSITIVE_INFINITY);
  const cyaHeadroomPpm = cyaCurrent != null && Number.isFinite(cyaCeiling) ? cyaCeiling - cyaCurrent : null;

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

    // Tablet-fed bodies are decided before the in-range check below, because a tablet
    // recommendation already carries its own maintenance projection and must not also get the
    // carry-aware handling added for liquid and granular.
    const onTablets =
      visit.bodyOfWater.chlorineFeedMechanism === "TABLET_FEEDER" ||
      visit.bodyOfWater.chlorineFeedMechanism === "TABLET_FLOATER";

    // CHLORINE THAT HAS TO LAST UNTIL THE NEXT VISIT.
    //
    // Every other chemical here is stable between visits: alkalinity does not evaporate and
    // calcium does not get used up, so "bring it to target" is the whole job. Free chlorine is
    // consumed continuously, which makes a dose correct at the moment of mixing and worthless
    // four days later -- measured on this org's own history, a pool the calculator told a
    // technician to chlorinate came back under the minimum 46.4% of the time. See
    // lib/chlorine-demand.ts for the measurement and the arithmetic.
    //
    // PROJECTED FOR EVERY CHLORINE BODY, including tablet-fed ones -- but it changes the DOSE
    // only for liquid and granular. That split is measured rather than assumed: tablet-fed
    // bodies are 30 of this org's 42 and carry 224 of the 239 observed failures (43.8% of
    // tablet recommendations came back under the minimum), so excluding them would have fixed
    // the smaller half of the problem. What they get is the diagnosis and the right advice, not
    // a bigger number: tablets already project a maintenance amount, how fast a puck dissolves
    // is set by the feeder and not by how full it is, and CYA on these bodies already averages
    // 38 ppm against a 40 ppm ceiling -- there is no room to push more trichlor through.
    let carry: CarryProjection | null = null;
    let demand: ChlorineDemand | null = null;
    let carryTopUp = false;
    let fcDaysUntilNextVisit: number | null = null;

    if (key === "FREE_CHLORINE" && resolved.boundMin != null) {
      // The ceiling is the LOWER of the regulatory maximum and this org's own band -- Nevada
      // allows 10 ppm where Lindley's asks for 2-8, and the org's own standard is the one to
      // respect. Dosing past what the operator asked for would be legal and still wrong.
      const orgCeiling = toNum(orgTarget?.orgTargetMax ?? null);
      const ceiling = Math.min(resolved.boundMax ?? Number.POSITIVE_INFINITY, orgCeiling ?? Number.POSITIVE_INFINITY);

      // No usable ceiling means nothing bounds a projected dose, and an unbounded chlorine
      // recommendation is not something to guess at -- fall through to the old behaviour.
      if (Number.isFinite(ceiling)) {
        const days = await daysUntilNextVisit(visit.bodyOfWater.id, visit.organizationId);
        fcDaysUntilNextVisit = days;
        if (days != null) {
          demand = await loadChlorineDemand(visit.bodyOfWater.id, visit.organizationId);
          carry = projectCarryTarget({
            baselineTargetPpm: resolved.targetValue,
            floorPpm: resolved.boundMin,
            maxPpm: ceiling,
            decayConstantPerDay: demand.decayConstantPerDay,
            daysUntilNextVisit: days,
          });
          carryTopUp = needsCarryTopUp({
            currentPpm: current,
            floorPpm: resolved.boundMin,
            decayConstantPerDay: demand.decayConstantPerDay,
            daysUntilNextVisit: days,
            maxPpm: ceiling,
          });
        }
      }
    }

    // A reading inside the range still earns a recommendation when it will not survive the gap.
    // This is where most of the failures were: 144 of the 239 pools that came back under the
    // minimum were in range when the technician last stood over them, and the card said nothing.
    const inRange = isInRange(current, resolved);
    if (inRange && !carryTopUp) continue;

    // "In range today, short by the next visit" -- the case that needs explaining rather than
    // correcting. needsCarryTopUp is also true for a reading that is simply too low, so the
    // in-range part has to be asked separately.
    const carryShortfallOnly = inRange && carryTopUp;

    // Direction comes from the BASELINE target so the too-high path (sodium thiosulfate) behaves
    // exactly as before; a carry top-up is a raise by definition.
    const direction: "UP" | "DOWN" = carryTopUp ? "UP" : current < resolved.targetValue ? "UP" : "DOWN";

    // Carry can only ever raise a target, only on a raise, and never on a tablet body (see the
    // projection block above). Nothing here can reduce a dose the calculator already recommended.
    const effectiveTarget = direction === "UP" && carry && !onTablets ? carry.targetPpm : resolved.targetValue;

    const productChemicalType = productChemicalTypeFor(key, direction);
    const feedPrefix = key === "FREE_CHLORINE" ? feedMechanismPrefix(visit.bodyOfWater.chlorineFeedMechanism) : "";

    // A tablet-fed body gets the TABLET recommendation and nothing else.
    //
    // This used to show both, deliberately: the reasoning was that an org running a feeder
    // might also keep granular for periodic shock, so showing both "gives the tech the real
    // choice instead of hiding one". In the field that is not what happened. Technicians read
    // two chlorine lines on one card and added BOTH -- reported by the operator 2026-11-06
    // after it happened on real pools. Two doses of chlorine because the screen listed two is
    // an over-chlorination the software caused, which beats the argument for choice.
    //
    // Only for direction === "UP": tablets only ever raise chlorine, so a too-high reading
    // stays on the existing sodium-thiosulfate path untouched.
    //
    // Both tablet mechanisms, because the chemistry is identical -- the same trichlor puck
    // dissolving over the same interval. Only the guidance and the holder's capacity differ.
    //
    // NOTE for whoever builds specs/shock-breakpoint-dosing.md: shock is the one case where
    // liquid or cal-hypo must come back, because a feeder cannot raise chlorine fast enough
    // and trichlor adds CYA exactly when the pool least needs it. That path must suppress the
    // TABLET recommendation instead, not sit alongside it -- the same two-doses problem in
    // reverse.
    if (key === "FREE_CHLORINE" && direction === "UP" && onTablets) {
      // In range today, short by the next visit, on a feeder. Deliberately an ADVISORY with no
      // dose attached: more tablets is the one thing that cannot fix this. How fast a puck
      // dissolves is set by the feeder's dial and the pump's run time, not by how full the
      // feeder is, and CYA on these bodies averages 38 ppm against a 40 ppm ceiling -- so
      // prescribing more trichlor would fail at the job and spend the stabiliser headroom doing
      // it. The note says what to actually change.
      if (carryShortfallOnly && carry && demand && resolved.boundMin != null) {
        recommendations.push(
          buildRecommendation({
            chemicalKey: key,
            currentValue: current,
            targetValue: resolved.targetValue,
            targetMin: resolved.boundMin,
            targetMax: resolved.boundMax,
            // When the projection itself falls short, buildCarryNote already carries the
            // feeder action. When it does not -- the usual in-range case, where the shortfall
            // is today's reading rather than the ceiling -- the note would otherwise state the
            // problem and name no action, so it is appended here.
            note: [
              buildCarryNote({
                carry,
                demand,
                floorPpm: resolved.boundMin,
                currentlyInRange: true,
                tabletFed: true,
                cyaHeadroomPpm,
              }),
              carry.bridges ? TABLET_FEEDER_CARRY_ACTION : null,
            ]
              .filter(Boolean)
              .join(" "),
          }),
        );
        continue;
      }

      const tabletSetting = enabledProductsByType.get("FREE_CHLORINE")?.find((s) => s.catalogProduct.form === "TABLET");
      if (tabletSetting) {
        const days = fcDaysUntilNextVisit ?? (await daysUntilNextVisit(visit.bodyOfWater.id, visit.organizationId));
        // The carry block above skips the demand lookup on a body with no usable floor or
        // ceiling, but the feeder amount is sized from demand either way, so it is loaded here
        // when that happened. One query per visit, on an uncommon path.
        const tabletDemand = demand ?? (await loadChlorineDemand(visit.bodyOfWater.id, visit.organizationId));
        // A feeder is sized in ppm it must REPLACE over the interval, which is the one place a
        // ppm/day figure is still the right unit -- but under proportional decay that rate is
        // not a property of the pool alone. A pool losing k of its chlorine daily while held at
        // L ppm consumes k x L ppm/day, so the level the feeder is meant to hold is part of the
        // arithmetic. The baseline target is that level: it is what the feeder exists to
        // maintain, and sizing against the floor instead would stock it to hold the pool at the
        // bottom of its own band.
        const tabletDemandPpmPerDay = tabletDemand.decayConstantPerDay * resolved.targetValue;
        const tablet = computeTabletRecommendation({
          volumeGallons: gallons,
          demandPpmPerDay: tabletDemandPpmPerDay,
          daysUntilNextVisit: days,
          dosingConstant: Number(tabletSetting.catalogProduct.dosingConstant),
        });
        // Below the regulatory floor right now, which is the case tablets cannot answer -- the
        // note leads with liquid. Reaching this branch at all means the reading was out of
        // range (the in-range-but-fading case returned above), so this is the usual state here.
        const shortToday = resolved.boundMin != null && current < resolved.boundMin;
        const holder = visit.bodyOfWater.chlorineFeedMechanism === "TABLET_FLOATER" ? "floater" : "feeder";

        if (!tablet) {
          // No next visit on the schedule, or no volume on file: there is no interval to size
          // the feeder against. Advisory with no dose rather than a fabricated count.
          recommendations.push(
            buildRecommendation({
              chemicalKey: key,
              currentValue: current,
              targetValue: resolved.targetValue,
              targetMin: resolved.boundMin,
              targetMax: resolved.boundMax,
              note: [
                shortToday
                  ? `Free chlorine is below the minimum now, and tablets will not raise it today -- a puck dissolves over days. Chlorinate with liquid now, then stock the ${holder} to hold it.`
                  : `Free chlorine is low for this body. Check the ${holder} is stocked and not jammed.`,
                "How much to leave in it could not be projected -- this body has no upcoming visit on a route, or no volume on file -- so size it from what you know of the pool.",
              ].join(" "),
            }),
          );
          continue;
        }

        recommendations.push(
          buildRecommendation({
            chemicalKey: key,
            currentValue: current,
            targetValue: resolved.targetValue,
            targetMin: resolved.boundMin,
            targetMax: resolved.boundMax,
            productName: tabletSetting.catalogProduct.name,
            formattedDose: formatDose(tablet.totalTablets, "TABLET"),
            // The full carry explanation only when the feeder will not hold the pool -- that is
            // the actionable case. When it will, the tablet note already quotes the demand it
            // was sized from, so a technician in the sun is not handed six sentences with
            // nothing to do about them.
            note: [
              buildTabletNote(tablet, {
                holder,
                demandSource: tabletDemand.source,
                sampleSize: tabletDemand.sampleSize,
                shortToday,
              }),
              carry && resolved.boundMin != null && !carry.bridges
                ? buildCarryNote({
                    carry,
                    demand: tabletDemand,
                    floorPpm: resolved.boundMin,
                    currentlyInRange: false,
                    tabletFed: true,
                    cyaHeadroomPpm,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" "),
            rawAmount: tablet.totalTablets,
            dosingUnit: "TABLET",
            billingLink: buildBillingLink(tabletSetting.linkedBillingProduct, tablet.totalTablets, "TABLET"),
          }),
        );
        // The tablet dose IS the chlorine recommendation for this body. Skip the
        // liquid/granular pick below so the card carries one chlorine line, not two.
        continue;
      }
      // Deliberately NOT a continue: no tablet product is enabled for this org, so falling
      // through to liquid/granular is the only way a tablet-fed pool gets any chlorine
      // recommendation at all. Suppressing here would show nothing.
    }

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

    const setting = pickPrimaryProduct(enabledProductsByType, productChemicalType, direction);
    if (!setting) {
      // A carry shortfall on a reading that is still compliant, with nothing enabled to correct
      // it, is the one case worth staying quiet about: the water is in range, and "no product
      // configured" is not something a technician standing at the pool can act on. An
      // out-of-range reading still gets the message below, exactly as before.
      if (carryShortfallOnly) continue;

      recommendations.push(
        buildRecommendation({
          chemicalKey: key,
          currentValue: current,
          targetValue: resolved.targetValue,
          targetMin: resolved.boundMin,
          targetMax: resolved.boundMax,
          // A too-high reading needs different advice from a too-low one. "Configure a product" is
          // right when nothing can raise the value, and actively misleading when the reading is
          // already above target -- the honest answer there is that adding more is wrong.
          note:
            direction === "DOWN"
              ? key === "FREE_CHLORINE"
                ? "Free chlorine is ABOVE target -- do not add chlorine. It falls on its own in sunlight; partially draining and refilling brings it down faster. Sodium thiosulfate lowers it chemically if you stock it (enable it under Settings > Chemicals)."
                : `${CHEMICAL_LABELS[key]} is above target. No enabled product lowers it -- partial drain and refill is the usual correction.`
              : feedPrefix
                ? `${feedPrefix}no enabled primary product is configured for a manual correction -- set one on the Chemicals admin page.`
                : `No enabled primary product configured for ${CHEMICAL_LABELS[key]} -- set one on the Chemicals admin page.`,
        }),
      );
      if (key === "CYA") cyaOutOfRange = true;
      if (key === "ALKALINITY") alkalinityRecommended = true;
      continue;
    }

    const catalog = setting.catalogProduct;
    const delta = Math.abs(effectiveTarget - current);
    const rawDose = Number(catalog.dosingConstant) * delta * (gallons / 10000);

    // The carry explanation replaces the old one-line feed note for chlorine, because it says
    // the same thing with the actual numbers in it: what the dose is sized to last, measured
    // from this pool, and where it falls short. Everything else keeps the note it had.
    const carryNote =
      carry && demand && resolved.boundMin != null && direction === "UP"
        ? buildCarryNote({
            carry,
            demand,
            floorPpm: resolved.boundMin,
            currentlyInRange: carryShortfallOnly,
            cyaHeadroomPpm,
          })
        : null;

    recommendations.push(
      buildRecommendation({
        chemicalKey: key,
        currentValue: current,
        targetValue: effectiveTarget,
        targetMin: resolved.boundMin,
        targetMax: resolved.boundMax,
        productName: catalog.name,
        formattedDose: formatDose(rawDose, catalog.dosingUnit),
        note: carryNote
          ? feedPrefix
            ? `${feedPrefix}the dose below is on top of that. ${carryNote}`
            : carryNote
          : feedPrefix
            ? `${feedPrefix}the dose below is a one-time correction on top of that.`
            : null,
        rawAmount: rawDose,
        dosingUnit: catalog.dosingUnit,
        billingLink: buildBillingLink(setting.linkedBillingProduct, rawDose, catalog.dosingUnit),
      }),
    );

    if (key === "CYA") cyaOutOfRange = true;
    if (key === "ALKALINITY") alkalinityRecommended = true;
  }

  // pH gets its own status (in/out of range + which direction), NOT a computed dose --
  // there's no ppm-delta formula for it, only a titration a technician performs (see
  // computePhDose). This is what lets the Dosing Card prompt automatically ("pH is low --
  // run a Base Demand test") instead of always showing a generic button regardless of
  // whether pH actually needs correcting.
  let phStatus: PhRangeStatus | null = null;
  const phCurrent = toNum((visit.reading as unknown as Record<string, unknown>).ph);
  if (phCurrent != null) {
    const phBounds = await boundsFor("PH", visit.organizationId, visit.bodyOfWater.type, visit.bodyOfWater.disinfectionMethod);
    const phOrgTarget = orgTargetByType.get(orgTargetChemicalType("PH")) ?? null;
    const stateResolved = resolveTarget("PH", phBounds, phOrgTarget, warnings);
    // The state's band is what the water must stay inside; the aim band is where acid starts
    // going in. See PH_ACID_CEILING for the measurement behind the difference.
    const phResolved = stateResolved && phOrgTarget == null ? applyPhAimBand(stateResolved) : stateResolved;
    if (phResolved && !isInRange(phCurrent, phResolved)) {
      phStatus = {
        currentValue: phCurrent,
        targetValue: phResolved.targetValue,
        targetMin: phResolved.boundMin,
        targetMax: phResolved.boundMax,
        direction: phCurrent < phResolved.targetValue ? "RAISE" : "LOWER",
      };
    }
  }

  if (alkalinityRecommended && phCurrent != null) warnings.push("Adjust alkalinity before pH for best results.");
  void cyaOutOfRange; // reserved for a future stabilizer-cross-effect warning if a product ever carries one again

  const result: DosingResult = {
    visitId,
    bodyOfWaterId: visit.bodyOfWater.id,
    recommendations,
    phStatus,
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
  rawAmount: number;
  dosingUnit: DosingUnit;
  billingLink: DosingBillingLink | null;
};

/** Computes a pH correction dose from a technician-entered Base/Acid Demand drop count --
 * the ONLY valid input for a pH dose, since acid/base demand isn't derivable from a pH
 * reading itself. Returns null if drops <= 0, gallons is missing/invalid, or the product's
 * dosingConstant isn't a usable positive number -- caller should show nothing (not a fabricated
 * dose) in any of those cases. `linkedBillingProduct` mirrors
 * the ppm-based pass's billingLink construction (see buildBillingLink) so applying a pH
 * dose to the visit's dose log works the same way as any other recommendation. */
export function computePhDose(
  drops: number,
  product: { name: string; dosingConstant: unknown; dosingUnit: DosingUnit },
  gallons: number | null,
  linkedBillingProduct?: LinkedBillingProduct | null,
): PhDoseResult | null {
  if (!drops || drops <= 0 || !gallons || gallons <= 0) return null;
  // A missing or non-numeric dosingConstant used to slip straight through: Number(null) is 0, so a
  // mis-seeded product produced a confident "0 oz", and a non-numeric one produced "NaN oz". Both
  // are worse than refusing, because a technician has no way to tell either from a real answer.
  const constant = Number(product.dosingConstant);
  if (!Number.isFinite(constant) || constant <= 0) return null;
  const rawDose = constant * drops * (gallons / 10000);
  if (!Number.isFinite(rawDose) || rawDose <= 0) return null;
  return {
    productName: product.name,
    formattedDose: formatDose(rawDose, product.dosingUnit),
    rawAmount: rawDose,
    dosingUnit: product.dosingUnit,
    billingLink: buildBillingLink(linkedBillingProduct ?? null, rawDose, product.dosingUnit),
  };
}
