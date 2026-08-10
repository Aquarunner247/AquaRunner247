import { prisma } from "@/lib/prisma";
import type { PayPeriodType, PayStructureType } from "@/generated/prisma/enums";

/**
 * Technician earnings tracker -- see tech-earnings-tracker-spec.md for the full design.
 * This is an ESTIMATE shown to technicians, not payroll -- QuickBooks remains the source
 * of truth for actual pay (see the spec's Overview framing requirement).
 */

export type OrgPayrollSettingsLike = {
  payPeriodType: PayPeriodType;
  payStructureType: PayStructureType;
  weeklyStartDayOfWeek: number | null;
  biweeklyAnchorStartDate: Date | null;
  semiMonthlySplitDay: number | null;
  monthlyPayDay: number | null;
};

/** Used for orgs that predate this feature or were never configured -- matches the
 * OrgPayrollSettings model's own Prisma defaults (SEMI_MONTHLY/PER_PROPERTY/split day 15),
 * so an org with no row behaves identically to one with a freshly-created default row. */
const DEFAULT_PAYROLL_SETTINGS: OrgPayrollSettingsLike = {
  payPeriodType: "SEMI_MONTHLY",
  payStructureType: "PER_PROPERTY",
  weeklyStartDayOfWeek: null,
  biweeklyAnchorStartDate: null,
  semiMonthlySplitDay: 15,
  monthlyPayDay: null,
};

export async function getOrgPayrollSettings(organizationId: string): Promise<OrgPayrollSettingsLike> {
  const row = await prisma.orgPayrollSettings.findUnique({ where: { organizationId } });
  if (!row) return DEFAULT_PAYROLL_SETTINGS;
  return {
    payPeriodType: row.payPeriodType,
    payStructureType: row.payStructureType,
    weeklyStartDayOfWeek: row.weeklyStartDayOfWeek,
    biweeklyAnchorStartDate: row.biweeklyAnchorStartDate,
    semiMonthlySplitDay: row.semiMonthlySplitDay,
    monthlyPayDay: row.monthlyPayDay,
  };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function daysInMonth(year: number, monthIndexZeroBased: number): number {
  return new Date(year, monthIndexZeroBased + 1, 0).getDate();
}

export type PayPeriodBounds = { start: Date; end: Date };

/**
 * The current pay period's [start, end] window as of referenceDate, per this org's own
 * OrgPayrollSettings -- see tech-earnings-tracker-spec.md Section 7. This app is
 * white-labeled for other pool service companies with different pay cycles, so this always
 * branches on the org's own config rather than assuming any one org's cycle (Lindley's own
 * semi-monthly/15th split is just that org's seeded setting, not global logic).
 */
export function getPayPeriodBounds(settings: OrgPayrollSettingsLike, referenceDate: Date): PayPeriodBounds {
  const ref = startOfDay(referenceDate);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const day = ref.getDate();

  switch (settings.payPeriodType) {
    case "SEMI_MONTHLY": {
      const lastDay = daysInMonth(year, month);
      // Clamped so a misconfigured split (0, or >= the month's last day) still yields a
      // real two-sided period instead of an empty or inverted one.
      const splitDay = Math.min(Math.max(settings.semiMonthlySplitDay ?? 15, 1), lastDay - 1);
      if (day <= splitDay) {
        return { start: new Date(year, month, 1, 0, 0, 0, 0), end: endOfDay(new Date(year, month, splitDay)) };
      }
      return { start: new Date(year, month, splitDay + 1, 0, 0, 0, 0), end: endOfDay(new Date(year, month, lastDay)) };
    }

    case "MONTHLY": {
      // Clamped to 28 so "the Nth of the month" is a valid date in every month, per the
      // spec's month-length edge-case warning (Section 2).
      const payDay = Math.min(Math.max(settings.monthlyPayDay ?? 1, 1), 28);
      if (day >= payDay) {
        return { start: new Date(year, month, payDay, 0, 0, 0, 0), end: endOfDay(new Date(year, month + 1, payDay - 1)) };
      }
      return { start: new Date(year, month - 1, payDay, 0, 0, 0, 0), end: endOfDay(new Date(year, month, payDay - 1)) };
    }

    case "WEEKLY": {
      // ISO weekday (Mon=1..Sun=7), matching RecurringRoute.dayOfWeek's own convention --
      // see lib/visit-generation.ts.
      const isoWeekday = ((ref.getDay() + 6) % 7) + 1;
      const startDow = settings.weeklyStartDayOfWeek ?? 1;
      const daysSinceStart = (isoWeekday - startDow + 7) % 7;
      const start = new Date(year, month, day - daysSinceStart, 0, 0, 0, 0);
      const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
      return { start, end };
    }

    case "BIWEEKLY": {
      if (!settings.biweeklyAnchorStartDate) {
        // No anchor configured -- there's no fixed reference point to count 14-day windows
        // from, so degrade to a well-defined weekly-equivalent window rather than guessing
        // one. The Payroll settings form requires the anchor whenever BIWEEKLY is picked,
        // so this only fires for a row that predates that validation.
        return getPayPeriodBounds({ ...settings, payPeriodType: "WEEKLY" }, referenceDate);
      }
      const anchor = startOfDay(settings.biweeklyAnchorStartDate);
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysSinceAnchor = Math.floor((ref.getTime() - anchor.getTime()) / msPerDay);
      const periodIndex = Math.floor(daysSinceAnchor / 14);
      const start = new Date(anchor.getTime() + periodIndex * 14 * msPerDay);
      const end = endOfDay(new Date(start.getTime() + 13 * msPerDay));
      return { start, end };
    }
  }
}

type ActiveRate = { effectiveDate: Date; rateAmount: number; isBundled: boolean };

/** Every one of this technician's active PER_PROPERTY rates, grouped by body of water and
 * sorted newest-effective-first -- fetched once per technician rather than once per visit
 * (see getTechnicianEarnings, the hot path this exists for). */
async function loadActiveRatesByBody(organizationId: string, technicianId: string): Promise<Map<string, ActiveRate[]>> {
  const rows = await prisma.technicianPayRate.findMany({
    where: { organizationId, technicianId, isActive: true },
    orderBy: { effectiveDate: "desc" },
    select: { bodyOfWaterId: true, effectiveDate: true, rateAmount: true, isBundled: true },
  });
  const byBody = new Map<string, ActiveRate[]>();
  for (const row of rows) {
    const arr = byBody.get(row.bodyOfWaterId) ?? [];
    arr.push({ effectiveDate: row.effectiveDate, rateAmount: Number(row.rateAmount), isBundled: row.isBundled });
    byBody.set(row.bodyOfWaterId, arr);
  }
  return byBody;
}

/** First rate (already sorted newest-first) whose effectiveDate is on or before asOf --
 * i.e. the rate that was actually in effect when the visit happened, not necessarily the
 * latest one on file (see TechnicianPayRate's doc comment on keeping history). */
function pickRate(rates: ActiveRate[] | undefined, asOf: Date): { rateAmount: number; isBundled: boolean } | null {
  if (!rates) return null;
  const match = rates.find((r) => r.effectiveDate <= asOf);
  return match ? { rateAmount: match.rateAmount, isBundled: match.isBundled } : null;
}

export type ResolvedRate = { rateAmount: number; isBundled: boolean };

/**
 * THE single place a visit's pay rate gets resolved -- funnel every rate lookup through
 * this function rather than querying TechnicianPayRate ad hoc from elsewhere, per
 * tech-earnings-tracker-spec.md Section 8's "Note for CC". v1 only implements
 * PER_PROPERTY; adding a future pay structure (HOURLY, FLAT_PER_VISIT,
 * PROPERTY_TYPE_TIERED) means one new branch here, not a hunt across every call site.
 * Returns null when no active rate row covers this (technician, body of water) pair as of
 * visitDate at all -- never a fabricated $0 (see the "Unrated visits" admin surface).
 */
export async function resolveRateForVisit(
  organizationId: string,
  technicianId: string,
  bodyOfWaterId: string,
  visitDate: Date,
): Promise<ResolvedRate | null> {
  const settings = await getOrgPayrollSettings(organizationId);
  switch (settings.payStructureType) {
    case "PER_PROPERTY": {
      const ratesByBody = await loadActiveRatesByBody(organizationId, technicianId);
      return pickRate(ratesByBody.get(bodyOfWaterId), visitDate);
    }
  }
}

/**
 * The one INSERT every "add a pay rate" form goes through, regardless of which admin
 * screen it was submitted from (the dedicated Settings > Pay Rates table, or the inline
 * field on a body of water's own detail page -- tech-earnings-tracker-spec.md Section 4's
 * "two entry points, one underlying table"). Each caller still does its own
 * org/customer-scoped auth check first, per this codebase's convention of never trusting a
 * server action bound to a form in a different route file -- this only holds the actual
 * write, not the scoping.
 */
export async function createPayRateRow(input: {
  organizationId: string;
  technicianId: string;
  bodyOfWaterId: string;
  rateAmount: number;
  isBundled: boolean;
  bundledIntoBodyOfWaterId: string | null;
  effectiveDate: Date;
  createdByUserId: string;
}) {
  return prisma.technicianPayRate.create({ data: input });
}

export type TechnicianEarningsSummary = {
  todayTotal: number;
  todayVisitCount: number;
  periodTotal: number;
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Live-computed running earnings totals for TechnicianHome -- "today" and "this pay
 * period" (Section 2). Always recomputed fresh from CURRENT ServiceVisit state (never an
 * incremental counter written at completion time), so a visit that gets reverted or
 * rescheduled after being completed is automatically reflected on the next read with no
 * separate reversal hook -- see tech-earnings-tracker-spec.md Section 6 and 9.
 *
 * Unrated visits (a COMPLETED visit whose body of water has no active rate row for this
 * technician at all) are silently excluded from both totals rather than costing the tech a
 * dollar amount that was never estimated -- they're surfaced separately to admins instead
 * of the tech, per Section 6 ("missing pay rate ... admin-facing alert only").
 */
export async function getTechnicianEarnings(
  organizationId: string,
  technicianId: string,
  now: Date = new Date(),
): Promise<TechnicianEarningsSummary> {
  const settings = await getOrgPayrollSettings(organizationId);
  const period = getPayPeriodBounds(settings, now);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [visits, ratesByBody] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: { organizationId, technicianId, status: "COMPLETED", completedAt: { gte: period.start, lte: period.end } },
      select: { bodyOfWaterId: true, completedAt: true },
    }),
    settings.payStructureType === "PER_PROPERTY" ? loadActiveRatesByBody(organizationId, technicianId) : Promise.resolve(new Map<string, ActiveRate[]>()),
  ]);

  let todayTotal = 0;
  let todayVisitCount = 0;
  let periodTotal = 0;

  for (const visit of visits) {
    if (!visit.completedAt) continue;
    const isToday = visit.completedAt >= todayStart && visit.completedAt <= todayEnd;
    if (isToday) todayVisitCount += 1;

    const resolved = pickRate(ratesByBody.get(visit.bodyOfWaterId), visit.completedAt);
    if (!resolved) continue; // unrated -- see this function's doc comment

    periodTotal += resolved.rateAmount;
    if (isToday) todayTotal += resolved.rateAmount;
  }

  return { todayTotal, todayVisitCount, periodTotal, periodStart: period.start, periodEnd: period.end };
}
