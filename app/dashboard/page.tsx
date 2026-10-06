import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";
import { AlertsBell } from "@/app/components/alerts-bell";
import { PropertyTypeFilterSelect } from "@/app/components/property-type-filter-select";
import { getOrganizationRuleset, isComplianceActive, activeChemistryThresholds, chlorineFamilyThreshold, organizationHasCommercialPools } from "@/lib/compliance";
import { WaveProgress } from "@/app/components/wave-progress";
import { ChemGauge } from "@/app/components/chem-gauge";
import { resolveIssue } from "./actions";
import { TechnicianHome } from "./technician-home";
import { timeZoneForState, formatLocalDate, startOfLocalDay } from "@/lib/timezone";
import { dueCutoffForTimeZone, taskDueState } from "@/lib/customer-task-due";

type ReadingParam = { key: string; label: string; value: number; unit: string; min: number; max: number; idealMin: number; idealMax: number };

const READING_GAUGE_RANGES: Record<string, { min: number; max: number; unit: string; label: string }> = {
  freeChlorine: { min: 0, max: 12, unit: " ppm", label: "Free Cl" },
  bromine: { min: 0, max: 12, unit: " ppm", label: "Bromine" },
  ph: { min: 6, max: 8.5, unit: "", label: "pH" },
  alkalinity: { min: 0, max: 220, unit: " ppm", label: "Alkalinity" },
  cya: { min: 0, max: 110, unit: " ppm", label: "CYA" },
};

type DashboardPageProps = {
  searchParams?: Promise<{ month?: string; type?: string; from?: string; to?: string; propertyId?: string }>;
};

type ChemRow = { quantity: number; unit: string; cost: number; charge: number };
type PropertyChemTotals = {
  propertyId: string;
  propertyName: string;
  totalCost: number;
  totalCharge: number;
  chemicals: Map<string, ChemRow>;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toYmd(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // back up to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const appUser = await getAppUserForAuthUser(user);
  const sp = (await searchParams) ?? {};

  if (appUser?.role === "TECHNICIAN") {
    return <TechnicianHome appUser={appUser} monthParam={sp.month} />;
  }

  const selectedPropertyType: "RESIDENTIAL" | "COMMERCIAL" | null =
    sp.type === "RESIDENTIAL" || sp.type === "COMMERCIAL" ? sp.type : null;

  // ---- Admin overview data ----
  let stats: { customers: number; managementCompanies: number; bodiesOfWater: number; upcomingThisWeek: number; weekTotal: number; weekCompleted: number } | null = null;
  let activity: Array<{ id: string; label: string; detail: string; at: Date }> = [];
  let overdueVisits: Array<{ id: string; property: string; body: string; tech: string; scheduledStart: Date }> = [];
  let dueTasks: Array<{ id: string; customerId: string; customer: string; title: string; dueOn: Date | null }> = [];
  let outOfRangeReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[]; params: ReadingParam[] }> = [];
  let closureHazardReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[]; params: ReadingParam[] }> = [];

  /**
   * Chemical usage & billing, moved here from the Chemicals side-nav tab. The catalog it used to
   * sit beside is configuration you set once; this is a billing-cycle read, so it belongs where
   * an admin already lands rather than behind a tab of its own.
   */
  let chemUsage: {
    from: Date;
    to: Date;
    propertyId: string;
    properties: Array<{ id: string; name: string }>;
    totals: PropertyChemTotals[];
    maxCharge: number;
    grandCost: number;
    grandCharge: number;
  } | null = null;

  let complianceComingSoon: { hasCommercialPools: boolean; stateName: string | null } | null = null;
  let closureFeeLabel: string | null = null;
  let tz = timeZoneForState(undefined);

  // One `now` for the whole page, so the queries and the labels rendered from them cannot disagree about
  // what "today" is -- a to-do fetched as due today must not be labelled overdue because the render
  // happened a moment after midnight.
  const now = new Date();

  if (appUser?.role === "ADMIN") {
    const orgId = appUser.organizationId;

    const [organization, ruleset] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId }, select: { state: true, hasCommercialPools: true } }),
      getOrganizationRuleset(orgId),
    ]);
    tz = timeZoneForState(organization?.state);
    const rulesetStateName = ruleset?.stateName ?? null;
    const complianceActive = isComplianceActive(ruleset);
    const hasCommercialPools = await organizationHasCommercialPools(orgId, organization?.hasCommercialPools ?? null);
    if (hasCommercialPools && !complianceActive) {
      complianceComingSoon = { hasCommercialPools: true, stateName: rulesetStateName ?? organization?.state ?? null };
    }
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Management Companies stays unfiltered — it has no direct propertyType, and filtering it
    // would need an awkward traversal for a fundamentally different kind of count.
    const customerPropertyFilter = selectedPropertyType ? { properties: { some: { propertyType: selectedPropertyType } } } : {};
    const bodyPropertyFilter = selectedPropertyType ? { propertyType: selectedPropertyType } : {};
    const visitPropertyFilter = selectedPropertyType ? { property: { propertyType: selectedPropertyType } } : {};

    // The three serviceVisit counts below used to be three separate COUNT queries against
    // the exact same table/organization/week-window, differing only by status filter --
    // this dashboard is the single heaviest-traffic page in the app, and every visitor
    // held up to 6 simultaneous connections for this one batch (see the EMAXCONNSESSION
    // incident this was added to fix: Supabase's Session pooler caps the whole project at
    // 15 total connections). Fetching the week's visits once and slicing three ways in JS
    // gets identical numbers from one round trip instead of three -- 4 queries in this
    // batch now, not 6.
    const [customersCount, managementCompaniesCount, bodiesCount, weekVisits] = await Promise.all([
      prisma.customer.count({ where: { organizationId: orgId, relationshipEndedAt: null, ...customerPropertyFilter } }),
      prisma.managementCompany.count({ where: { organizationId: orgId } }),
      prisma.bodyOfWater.count({ where: { property: { organizationId: orgId, ...bodyPropertyFilter } } }),
      prisma.serviceVisit.findMany({
        // logOnlyRecord excluded: a logbook import is not work anyone did this week, and counting it
        // would show the week as further along than the technicians actually are.
        where: {
          organizationId: orgId,
          logOnlyRecord: false,
          scheduledStart: { gte: weekStart, lt: weekEnd },
          ...visitPropertyFilter,
        },
        select: { status: true },
      }),
    ]);
    stats = {
      customers: customersCount,
      managementCompanies: managementCompaniesCount,
      bodiesOfWater: bodiesCount,
      upcomingThisWeek: weekVisits.filter((v) => v.status === "SCHEDULED" || v.status === "IN_PROGRESS").length,
      weekTotal: weekVisits.length,
      weekCompleted: weekVisits.filter((v) => v.status === "COMPLETED").length,
    };

    const [recentVisits, recentCustomers] = await Promise.all([
      prisma.serviceVisit.findMany({
        // logOnlyRecord excluded: importing a logbook would otherwise fill every slot here and
        // bury the visits a technician actually completed.
        where: {
          organizationId: orgId,
          status: "COMPLETED",
          logOnlyRecord: false,
          completedAt: { not: null },
          ...visitPropertyFilter,
        },
        orderBy: { completedAt: "desc" },
        take: 8,
        select: { id: true, completedAt: true, property: { select: { name: true } }, bodyOfWater: { select: { name: true } } },
      }),
      prisma.customer.findMany({
        where: { organizationId: orgId, ...customerPropertyFilter },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, createdAt: true },
      }),
    ]);

    activity = [
      ...recentVisits.map((v) => ({
        id: `visit-${v.id}`,
        label: "Visit completed",
        detail: `${v.property.name} — ${v.bodyOfWater.name}`,
        at: v.completedAt as Date,
      })),
      ...recentCustomers.map((c) => ({
        id: `customer-${c.id}`,
        label: "New customer",
        detail: c.name,
        at: c.createdAt,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10);

    // scheduledStart is a pure same-day sort key, not a real time (see
    // lib/visit-generation.ts) -- "overdue" means still not done as of a prior business
    // day, not "scheduledStart's fake clock reading is earlier than now" (which would
    // flag nearly everything as overdue for most of the day).
    const todayStart = startOfLocalDay(now, tz);
    const overdue = await prisma.serviceVisit.findMany({
      // pushedAt excludes a stop the nightly sweep already closed out (lib/visit-pushed.ts). It is
      // genuinely unfinished, but it has been acknowledged and the customer told, so repeating it here
      // every day is noise. A past day's SCHEDULED stop still counts: nobody touched that one at all.
      where: {
        organizationId: orgId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        pushedAt: null,
        scheduledStart: { lt: todayStart },
        ...visitPropertyFilter,
      },
      orderBy: { scheduledStart: "asc" },
      take: 10,
      select: {
        id: true,
        scheduledStart: true,
        property: { select: { name: true } },
        bodyOfWater: { select: { name: true } },
        technician: { select: { name: true, email: true } },
      },
    });
    // Office to-dos the bell should be showing. Two ways in: a deadline whose reminder day has arrived
    // (remindOn is dueOn minus the chosen lead time, stored because this filters across every customer),
    // or no deadline at all -- an undated to-do is still something somebody wanted done, and waiting for
    // a date it will never have is how one gets quietly forgotten.
    //
    // Dates are @db.Date (UTC midnight), so the cutoff resolves the org's own today first. A customer
    // whose relationship has ended is excluded: its to-dos are history, not work owed.
    const dueTaskRows = await prisma.customerTask.findMany({
      where: {
        completedAt: null,
        OR: [
          // No deadline: show it now.
          { dueOn: null },
          // Its reminder day has arrived.
          { remindOn: { lte: dueCutoffForTimeZone(now, tz) } },
          // Dated but with no reminder day, which happens to any row written between a migration and
          // the deploy that starts filling the column in -- one was created exactly that way on
          // 2026-10-06. Falling back to the due date means such a row surfaces late rather than never,
          // and the backfill in 20261006160000 fixes the ones already written.
          { AND: [{ remindOn: null }, { dueOn: { lte: dueCutoffForTimeZone(now, tz) } }] },
        ],
        customer: { organizationId: orgId, relationshipEndedAt: null },
      },
      // Soonest deadline first, undated ones last -- they are the least time-critical by definition.
      orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 10,
      select: { id: true, title: true, dueOn: true, customer: { select: { id: true, name: true } } },
    });
    dueTasks = dueTaskRows.map((t) => ({
      id: t.id,
      customerId: t.customer.id,
      customer: t.customer.name,
      title: t.title,
      dueOn: t.dueOn,
    }));

    overdueVisits = overdue.map((v) => ({
      id: v.id,
      property: v.property.name,
      body: v.bodyOfWater.name,
      tech: v.technician ? v.technician.name ?? v.technician.email ?? "Unassigned" : "Unassigned",
      scheduledStart: v.scheduledStart,
    }));

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // Compliance banners are commercial-only, per the residential/commercial split —
    // residential pools don't have closure-risk rules or ideal-zone chemistry targets. Same
    // treatment for an account whose state's ruleset isn't built out yet (or isn't linked at
    // all) — no rule engine to apply, so there's nothing to flag; complianceComingSoon above
    // covers telling the admin why. If the admin explicitly filtered to Residential, there's
    // no such thing as a residential closure-risk reading either — an empty result is
    // correct in every one of these cases, so skip the query entirely.
    const readings =
      selectedPropertyType === "RESIDENTIAL" || !complianceActive
        ? []
        : await prisma.visitWaterReading.findMany({
            where: {
              visit: { organizationId: orgId, completedAt: { gte: sevenDaysAgo }, property: { propertyType: "COMMERCIAL" } },
            },
            orderBy: { visit: { completedAt: "desc" } },
            take: 30,
            select: {
              freeChlorinePpm: true,
              brominePpm: true,
              ph: true,
              alkalinityPpm: true,
              cyanuricAcidPpm: true,
              visit: {
                select: {
                  id: true,
                  completedAt: true,
                  property: { select: { name: true } },
                  bodyOfWater: { select: { name: true, type: true, disinfectionMethod: true } },
                },
              },
            },
          });

    // readings is only ever non-empty when complianceActive is true (see the query gate
    // above), so ruleset is guaranteed non-null here — activeChemistryThresholds requires it.
    const thresholds = complianceActive ? activeChemistryThresholds(ruleset) : null;
    if (thresholds?.closureFeeAmount != null) {
      const feeAmount = thresholds.closureFeeAmount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      closureFeeLabel = `${feeAmount}${thresholds.closureFeeNote ? ` ${thresholds.closureFeeNote}` : ""}`;
    }
    for (const r of readings) {
      const issues: string[] = [];
      const hazards: string[] = [];
      const params: ReadingParam[] = [];
      const ph = r.ph != null ? Number(r.ph) : null;
      const alk = r.alkalinityPpm != null ? Number(r.alkalinityPpm) : null;
      const cya = r.cyanuricAcidPpm != null ? Number(r.cyanuricAcidPpm) : null;
      const t = thresholds!;

      // disinfectionMethod is set per body of water, not per account -- one account can
      // have a chlorine pool and a bromine spa at once -- so this is looked up fresh per
      // reading rather than reused from a single precomputed value the way pH/alkalinity/
      // CYA safely are (see chlorineFamilyThreshold's doc comment in lib/compliance.ts).
      const chlorineFamily = complianceActive
        ? chlorineFamilyThreshold(ruleset!, r.visit.bodyOfWater.type, r.visit.bodyOfWater.disinfectionMethod)
        : null;
      const chlorineFamilyValue =
        chlorineFamily?.key === "brominePpm"
          ? r.brominePpm != null
            ? Number(r.brominePpm)
            : null
          : r.freeChlorinePpm != null
            ? Number(r.freeChlorinePpm)
            : null;

      // Every bound below is checked independently and only when this state's data
      // actually defines it -- a null bound means this state's regulation doesn't have
      // one (e.g. Arizona has no hazard tier on anything; Arkansas's CYA has no hazard
      // cap), never a fallback to another state's number. See
      // lib/compliance.ts's activeChemistryThresholds doc comment. Gauges (params) only
      // render when this state defines BOTH ideal bounds for a parameter -- same
      // skip-when-null rule, not a fallback to a default range.
      if (chlorineFamily && chlorineFamilyValue != null) {
        const label = chlorineFamily.label;
        if (chlorineFamily.min != null && chlorineFamilyValue < chlorineFamily.min) issues.push(`${label} ${chlorineFamilyValue} ${chlorineFamily.unit}`);
        else if (chlorineFamily.max != null && chlorineFamilyValue > chlorineFamily.max) issues.push(`${label} ${chlorineFamilyValue} ${chlorineFamily.unit}`);
        if (chlorineFamily.min != null && chlorineFamily.max != null) {
          const gaugeKey = chlorineFamily.key === "brominePpm" ? "bromine" : "freeChlorine";
          params.push({ key: gaugeKey, ...READING_GAUGE_RANGES[gaugeKey], value: chlorineFamilyValue, idealMin: chlorineFamily.min, idealMax: chlorineFamily.max });
        }
      }
      if (ph != null) {
        if (t.phTargetMin != null && ph < t.phTargetMin) issues.push(`pH ${ph}`);
        else if (t.phTargetMax != null && ph > t.phTargetMax) issues.push(`pH ${ph}`);
        if (t.phTargetMin != null && t.phTargetMax != null) {
          params.push({ key: "ph", ...READING_GAUGE_RANGES.ph, value: ph, idealMin: t.phTargetMin, idealMax: t.phTargetMax });
        }
      }
      if (alk != null) {
        if (t.alkalinityTargetMinPpm != null && alk < t.alkalinityTargetMinPpm) issues.push(`Alkalinity ${alk} ppm`);
        else if (t.alkalinityTargetMaxPpm != null && alk > t.alkalinityTargetMaxPpm) issues.push(`Alkalinity ${alk} ppm`);
        if (t.alkalinityTargetMinPpm != null && t.alkalinityTargetMaxPpm != null) {
          params.push({ key: "alkalinity", ...READING_GAUGE_RANGES.alkalinity, value: alk, idealMin: t.alkalinityTargetMinPpm, idealMax: t.alkalinityTargetMaxPpm });
        }
      }
      if (cya != null) {
        if (t.cyaTargetMinPpm != null && cya < t.cyaTargetMinPpm) issues.push(`Cyanuric acid ${cya} ppm`);
        else if (t.cyaTargetMaxPpm != null && cya > t.cyaTargetMaxPpm) issues.push(`Cyanuric acid ${cya} ppm`);
        if (t.cyaTargetMinPpm != null && t.cyaTargetMaxPpm != null) {
          params.push({ key: "cya", ...READING_GAUGE_RANGES.cya, value: cya, idealMin: t.cyaTargetMinPpm, idealMax: t.cyaTargetMaxPpm });
        }
      }

      // Imminent health hazard — closure risk (fee, if this department charges one)
      if (ph != null && t.phHazardMin != null && t.phHazardMax != null && (ph < t.phHazardMin || ph > t.phHazardMax)) {
        hazards.push(`pH ${ph} (must be ${t.phHazardMin}–${t.phHazardMax})`);
      }
      if (cya != null && t.cyaHazardMaxPpm != null && cya > t.cyaHazardMaxPpm) {
        hazards.push(`Cyanuric acid ${cya} ppm (must be ≤${t.cyaHazardMaxPpm})`);
      }

      if (hazards.length) {
        closureHazardReadings.push({
          id: r.visit.id,
          property: r.visit.property.name,
          body: r.visit.bodyOfWater.name,
          completedAt: r.visit.completedAt,
          issues: hazards,
          params,
        });
      } else if (issues.length) {
        outOfRangeReadings.push({
          id: r.visit.id,
          property: r.visit.property.name,
          body: r.visit.bodyOfWater.name,
          completedAt: r.visit.completedAt,
          issues,
          params,
        });
      }
    }
    outOfRangeReadings = outOfRangeReadings.slice(0, 8);
    closureHazardReadings = closureHazardReadings.slice(0, 8);

    // --- Chemical usage & billing by property ---
    const chemFrom = sp.from ? new Date(`${sp.from}T00:00:00`) : startOfMonth(now);
    const chemTo = sp.to ? new Date(`${sp.to}T23:59:59`) : now;
    const chemPropertyId = sp.propertyId ?? "";

    const [chemProperties, chemDoses] = await Promise.all([
      prisma.property.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.visitChemicalDose.findMany({
        where: {
          visit: {
            organizationId: orgId,
            completedAt: { gte: chemFrom, lte: chemTo },
            ...(chemPropertyId ? { propertyId: chemPropertyId } : {}),
          },
        },
        select: {
          productName: true,
          quantity: true,
          unit: true,
          unitCost: true,
          unitCharge: true,
          visit: { select: { property: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    const byProperty = new Map<string, PropertyChemTotals>();
    let grandCost = 0;
    let grandCharge = 0;
    for (const d of chemDoses) {
      const qty = Number(d.quantity);
      const cost = (d.unitCost != null ? Number(d.unitCost) : 0) * qty;
      const charge = (d.unitCharge != null ? Number(d.unitCharge) : 0) * qty;
      const pId = d.visit.property.id;
      const entry = byProperty.get(pId) ?? {
        propertyId: pId,
        propertyName: d.visit.property.name,
        totalCost: 0,
        totalCharge: 0,
        chemicals: new Map<string, ChemRow>(),
      };
      entry.totalCost += cost;
      entry.totalCharge += charge;
      const chem = entry.chemicals.get(d.productName) ?? { quantity: 0, unit: d.unit, cost: 0, charge: 0 };
      chem.quantity += qty;
      chem.cost += cost;
      chem.charge += charge;
      entry.chemicals.set(d.productName, chem);
      byProperty.set(pId, entry);
      grandCost += cost;
      grandCharge += charge;
    }
    const chemTotals = Array.from(byProperty.values()).sort((a, b) => b.totalCharge - a.totalCharge);
    chemUsage = {
      from: chemFrom,
      to: chemTo,
      propertyId: chemPropertyId,
      properties: chemProperties,
      totals: chemTotals,
      maxCharge: Math.max(...chemTotals.map((t) => t.totalCharge), 1),
      grandCost,
      grandCharge,
    };
  }

  const reportedIssues =
    appUser?.role === "ADMIN"
      ? await prisma.visitIssueFlag.findMany({
          where: {
            resolved: false,
            visit: {
              organizationId: appUser.organizationId,
              ...(selectedPropertyType ? { property: { propertyType: selectedPropertyType } } : {}),
            },
          },
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          take: 15,
          select: {
            id: true,
            description: true,
            severity: true,
            createdAt: true,
            visit: {
              select: {
                id: true,
                property: { select: { name: true } },
                bodyOfWater: { select: { name: true } },
                technician: { select: { name: true, email: true } },
              },
            },
          },
        })
      : [];

  const closureHazardItems = closureHazardReadings.map((r) => ({
    id: r.id,
    property: r.property,
    body: r.body,
    completedAtLabel: r.completedAt ? formatLocalDate(r.completedAt, tz) : null,
    issues: r.issues,
  }));

  const reportedIssueItems = reportedIssues.map((issue) => ({
    id: issue.id,
    severity: issue.severity,
    description: issue.description,
    visitId: issue.visit.id,
    visitLabel: `${issue.visit.property.name} — ${issue.visit.bodyOfWater.name}`,
    techLabel: issue.visit.technician ? issue.visit.technician.name ?? issue.visit.technician.email ?? "Unknown tech" : "Unknown tech",
    createdAtLabel: formatLocalDate(issue.createdAt, tz),
  }));

  const overdueVisitItems = overdueVisits.map((v) => ({
    id: v.id,
    property: v.property,
    body: v.body,
    tech: v.tech,
    // scheduledStart's time-of-day isn't a real target time -- see lib/visit-generation.ts.
    dueLabel: formatLocalDate(v.scheduledStart, tz),
  }));

  const dueTaskItems = dueTasks.map((t) => {
    const state = taskDueState(t.dueOn, now, tz);
    // Four cases now that a to-do can reach the bell ahead of its deadline, or without one at all.
    const dueLabel =
      state === "overdue"
        ? `overdue — was due ${formatLocalDate(t.dueOn, "UTC")}`
        : state === "today"
          ? "due today"
          : state === "upcoming"
            ? `due ${formatLocalDate(t.dueOn, "UTC", { month: "short", day: "numeric" })}`
            : "no date set";
    return {
      id: t.id,
      customerId: t.customerId,
      customer: t.customer,
      title: t.title,
      dueLabel,
      overdue: state === "overdue",
    };
  });

  const outOfRangeItems = outOfRangeReadings.map((r) => ({
    id: r.id,
    property: r.property,
    body: r.body,
    completedAtLabel: r.completedAt ? formatLocalDate(r.completedAt, tz) : null,
    issues: r.issues,
  }));

  const weekPercent = stats && stats.weekTotal > 0 ? (stats.weekCompleted / stats.weekTotal) * 100 : 0;
  // Narrowing a `let` does not survive into a callback, so alias it before the JSX.
  const usage = chemUsage;

  return (
    <main className="app-page-wide">
      <header className="app-page-head flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="app-kicker">Dashboard</p>
          <h1 className="app-h1">Welcome back</h1>
          <p className="app-subhead">{user.email}</p>
        </div>
        {appUser?.role === "ADMIN" ? (
          <div className="flex items-center gap-4">
            <PropertyTypeFilterSelect selected={selectedPropertyType} action="/dashboard" />
            <AlertsBell
              closureHazardReadings={closureHazardItems}
              reportedIssues={reportedIssueItems}
              overdueVisits={overdueVisitItems}
              outOfRangeReadings={outOfRangeItems}
              dueTasks={dueTaskItems}
              resolveIssue={resolveIssue}
              closureFeeLabel={closureFeeLabel}
            />
          </div>
        ) : null}
      </header>

      <section className="mt-6 space-y-5">
        {complianceComingSoon && !complianceComingSoon.stateName ? (
          <div className="rounded-lg border border-brand-border bg-brand-foam p-4 text-sm text-brand-ink">
            <p className="font-medium">Set your state to enable compliance tracking</p>
            <p className="mt-1 text-brand-muted">
              This account has commercial properties, but no state is set yet.{" "}
              <Link href="/dashboard/settings" className="app-link">
                Set it in Settings
              </Link>{" "}
              so closure-risk banners and the QR inspector log can turn on.
            </p>
          </div>
        ) : complianceComingSoon ? (
          <div className="rounded-lg border border-brand-border bg-brand-foam p-4 text-sm text-brand-ink">
            <p className="font-medium">Compliance tracking for {complianceComingSoon.stateName} is coming soon</p>
            <p className="mt-1 text-brand-muted">
              Your service data is still being logged normally in the meantime — closure-risk banners and the QR
              inspector log will turn on automatically once we&rsquo;ve built out your state&rsquo;s rules.
            </p>
          </div>
        ) : null}
        {!appUser ? (
          <div className="rounded-2xl border border-brand-warn/30 bg-brand-warnFill p-4 text-sm text-brand-warn">
            <p className="font-medium">No AquaRunner profile linked</p>
            <p className="mt-2 text-brand-warn">
              Your Supabase login works, but there is no matching row in the <code className="rounded bg-brand-warnFill px-1">User</code> table
              (or <code className="rounded bg-brand-warnFill px-1">authUserId</code> is not set). Run{" "}
              <code className="rounded bg-brand-warnFill px-1">npm run db:seed</code> with{" "}
              <code className="rounded bg-brand-warnFill px-1">SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
              <code className="rounded bg-brand-warnFill px-1">SEED_DEV_PASSWORD</code>, then sign in with a seeded email.
            </p>
          </div>
        ) : appUser.role === "ADMIN" && stats ? (
          <>
            {/* Quick stats — card grid */}
            <div data-tour="admin-quick-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Customers</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-ink">{stats.customers}</p>
              </div>
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Property mgmt. cos.</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-ink">{stats.managementCompanies}</p>
              </div>
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Aquatic venues</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-ink">{stats.bodiesOfWater}</p>
              </div>
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Scheduled this week</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-ink">{stats.upcomingThisWeek}</p>
              </div>
            </div>

            {stats.customers === 0 ? (
              <div className="app-card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-brand-ink">Add your first customer to get started</p>
                  <p className="mt-1 text-sm text-brand-muted">Customers, properties, and aquatic venues will show up here once added.</p>
                </div>
                <Link href="/dashboard/customers?new=1" className="app-btn-primary-sm shrink-0">
                  + Add customer
                </Link>
              </div>
            ) : null}

            {/* Week progress — the signature water-level motif, doing real work: share of this week's stops completed */}
            <div data-tour="admin-week-progress" className="app-card">
              <WaveProgress
                percent={weekPercent}
                label="This week's stops"
                sublabel={stats.weekTotal > 0 ? `${stats.weekCompleted} of ${stats.weekTotal} complete` : "Nothing scheduled yet"}
              />
            </div>

            {closureHazardReadings.length > 0 ? (
              <div className="rounded-2xl border-2 border-brand-danger bg-brand-dangerFill p-4 shadow-soft md:p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-danger">
                  ⚠ Imminent health hazard — closure risk{closureFeeLabel ? ` (${closureFeeLabel})` : ""}
                </p>
                <ul className="mt-3 space-y-3">
                  {closureHazardReadings.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-danger/30 bg-white/70 p-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-ink">
                          {r.property} — {r.body}
                        </p>
                        {r.completedAt ? <p className="text-xs text-brand-icon">{formatLocalDate(r.completedAt, tz)}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {r.params.map((p) => (
                          <span key={p.key} className="flex items-center gap-1.5">
                            <ChemGauge value={p.value} min={p.min} max={p.max} idealMin={p.idealMin} idealMax={p.idealMax} unit={p.unit} />
                            <span className="text-xs font-medium text-brand-ink/70">{p.label}</span>
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Out-of-range readings — signature chemistry gauge instead of a plain number.
                Kept alongside the alerts bell on purpose: the bell lists the issue names as
                text, this shows each reading against its ideal range. */}
            <div data-tour="admin-out-of-range" className="app-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Out-of-range readings (last 7 days)</p>
              {outOfRangeReadings.length === 0 ? (
                <p className="mt-2 text-sm text-brand-ink/60">Every commercial reading this week is in range.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {outOfRangeReadings.map((r) => (
                    <li key={r.id} className="app-card-inset flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-ink">
                          {r.property} — {r.body}
                        </p>
                        {r.completedAt ? <p className="text-xs text-brand-icon">{formatLocalDate(r.completedAt, tz)}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {r.params.map((p) => (
                          <span key={p.key} className="flex items-center gap-1.5">
                            <ChemGauge value={p.value} min={p.min} max={p.max} idealMin={p.idealMin} idealMax={p.idealMax} unit={p.unit} />
                            <span className="text-xs font-medium text-brand-ink/70">{p.label}</span>
                          </span>
                        ))}
                      </div>
                    </li>
                ))}
              </ul>
              )}
            </div>

            {/* Recent activity */}
            <div data-tour="admin-recent-activity" className="app-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Recent activity</p>
              {activity.length === 0 ? (
                <p className="mt-2 text-sm text-brand-ink/60">No recent activity yet — completed visits and new customers will show up here.</p>
              ) : (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-brand-ink">
                    {activity.length} recent update{activity.length === 1 ? "" : "s"} — click to view
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm">
                    {activity.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 border-b border-brand-border pb-2 last:border-0 last:pb-0">
                        <span className="text-brand-ink/80">
                          <span className="font-medium text-brand-ink">{a.label}</span> — {a.detail}
                        </span>
                        <span className="app-metric shrink-0 text-xs text-brand-icon">
                          {formatLocalDate(a.at, tz)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            {/* Chemical usage & billing by property, moved off the Chemicals side-nav tab.
                Bars and the totals stay visible; the per-chemical tables collapse, so a
                billing-cycle report can't push the daily numbers off the screen. */}
            {usage ? (
              <div data-tour="chemicals-usage" className="app-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Chemical usage &amp; billing</p>

                <form className="mt-3 flex flex-wrap items-center gap-2" method="GET">
                  {/* Preserve the property-type filter, which this form would otherwise drop. */}
                  {selectedPropertyType ? <input type="hidden" name="type" value={selectedPropertyType} /> : null}
                  <label className="flex items-center gap-1 text-sm text-brand-muted">
                    From
                    <input type="date" name="from" defaultValue={toYmd(usage.from)} className="app-field-sm" />
                  </label>
                  <label className="flex items-center gap-1 text-sm text-brand-muted">
                    To
                    <input type="date" name="to" defaultValue={toYmd(usage.to)} className="app-field-sm" />
                  </label>
                  <select name="propertyId" defaultValue={usage.propertyId} className="app-field-sm" aria-label="Property">
                    <option value="">All properties</option>
                    {usage.properties.map((prop) => (
                      <option key={prop.id} value={prop.id}>
                        {prop.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="app-btn-primary-sm">
                    Update
                  </button>
                </form>

                {usage.totals.length === 0 ? (
                  <p className="mt-3 text-sm text-brand-ink/60">No chemical doses logged for this range.</p>
                ) : (
                  <>
                    <div className="mt-4 space-y-2">
                      {usage.totals.slice(0, 8).map((prop) => (
                        <div key={prop.propertyId}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-brand-ink">{prop.propertyName}</span>
                            <span className="app-metric text-brand-muted">{fmtMoney(prop.totalCharge)}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-brand-ink/[0.07]">
                            <div
                              className="h-2 rounded-full bg-brand-primary transition-[width] duration-500 motion-reduce:transition-none"
                              style={{ width: `${Math.max((prop.totalCharge / usage.maxCharge) * 100, 2)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-brand-border/70 pt-3 text-sm font-semibold text-brand-ink">
                      <span className="app-metric">Total cost: {fmtMoney(usage.grandCost)}</span>
                      <span className="app-metric">Total charge: {fmtMoney(usage.grandCharge)}</span>
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-brand-ink">
                        Per-chemical detail for {usage.totals.length} propert{usage.totals.length === 1 ? "y" : "ies"} — click to view
                      </summary>
                      <div className="mt-3 space-y-4">
                        {usage.totals.map((prop) => (
                          <div key={`detail-${prop.propertyId}`} className="app-card-inset">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-brand-ink">{prop.propertyName}</p>
                              <p className="app-metric text-sm text-brand-muted">
                                Cost {fmtMoney(prop.totalCost)} · Charge {fmtMoney(prop.totalCharge)}
                              </p>
                            </div>
                            <table className="mt-2 w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs uppercase text-brand-icon">
                                  <th className="py-1">Chemical</th>
                                  <th className="py-1">Quantity</th>
                                  <th className="py-1">Cost</th>
                                  <th className="py-1">Charge</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from(prop.chemicals.entries()).map(([name, c]) => (
                                  <tr key={name} className="border-t border-brand-border/70">
                                    <td className="py-1">{name}</td>
                                    <td className="app-metric py-1">
                                      {c.quantity} {c.unit}
                                    </td>
                                    <td className="app-metric py-1">{fmtMoney(c.cost)}</td>
                                    <td className="app-metric py-1">{fmtMoney(c.charge)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </details>
                  </>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-brand-ink bg-brand-ink p-4 shadow-soft">
              <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-accent">{appUser.role}</p>
              {appUser.name ? <p className="mt-1 font-display text-lg font-bold text-white">{appUser.name}</p> : null}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
