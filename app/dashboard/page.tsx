import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";
import { AlertsBell } from "@/app/components/alerts-bell";
import { PropertyTypeFilterSelect } from "@/app/components/property-type-filter-select";
import { getOrganizationRuleset, isComplianceActive, activeChemistryThresholds, organizationHasCommercialPools } from "@/lib/compliance";
import { resolveIssue } from "./actions";
import { TechnicianHome } from "./technician-home";

type DashboardPageProps = {
  searchParams?: Promise<{ month?: string; type?: string }>;
};

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
  let stats: { customers: number; managementCompanies: number; bodiesOfWater: number; upcomingThisWeek: number } | null = null;
  let activity: Array<{ id: string; label: string; detail: string; at: Date }> = [];
  let overdueVisits: Array<{ id: string; property: string; body: string; tech: string; scheduledStart: Date }> = [];
  let outOfRangeReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[] }> = [];
  let closureHazardReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[] }> = [];

  let complianceComingSoon: { hasCommercialPools: boolean; stateName: string | null } | null = null;
  let closureFeeLabel: string | null = null;

  if (appUser?.role === "ADMIN") {
    const orgId = appUser.organizationId;
    const now = new Date();

    const [organization, ruleset] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId }, select: { state: true, hasCommercialPools: true } }),
      getOrganizationRuleset(orgId),
    ]);
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

    const [customersCount, managementCompaniesCount, bodiesCount, upcomingCount] = await Promise.all([
      prisma.customer.count({ where: { organizationId: orgId, ...customerPropertyFilter } }),
      prisma.managementCompany.count({ where: { organizationId: orgId } }),
      prisma.bodyOfWater.count({ where: { property: { organizationId: orgId, ...bodyPropertyFilter } } }),
      prisma.serviceVisit.count({
        where: {
          organizationId: orgId,
          scheduledStart: { gte: weekStart, lt: weekEnd },
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          ...visitPropertyFilter,
        },
      }),
    ]);
    stats = { customers: customersCount, managementCompanies: managementCompaniesCount, bodiesOfWater: bodiesCount, upcomingThisWeek: upcomingCount };

    const [recentVisits, recentCustomers] = await Promise.all([
      prisma.serviceVisit.findMany({
        where: { organizationId: orgId, status: "COMPLETED", completedAt: { not: null }, ...visitPropertyFilter },
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

    const overdue = await prisma.serviceVisit.findMany({
      where: { organizationId: orgId, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledStart: { lt: now }, ...visitPropertyFilter },
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
              ph: true,
              alkalinityPpm: true,
              cyanuricAcidPpm: true,
              visit: {
                select: {
                  id: true,
                  completedAt: true,
                  property: { select: { name: true } },
                  bodyOfWater: { select: { name: true, type: true } },
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
      const fc = r.freeChlorinePpm != null ? Number(r.freeChlorinePpm) : null;
      const ph = r.ph != null ? Number(r.ph) : null;
      const alk = r.alkalinityPpm != null ? Number(r.alkalinityPpm) : null;
      const cya = r.cyanuricAcidPpm != null ? Number(r.cyanuricAcidPpm) : null;
      const t = thresholds!;
      const fcMin = r.visit.bodyOfWater.type === "SPA" ? t.freeChlorineMinSpaPpm : t.freeChlorineMinPoolPpm;

      if (fc != null && (fc < fcMin || fc > t.freeChlorineMaxPpm)) issues.push(`Free chlorine ${fc} ppm`);
      if (ph != null && (ph < t.phTargetMin || ph > t.phTargetMax)) issues.push(`pH ${ph}`);
      if (alk != null && (alk < t.alkalinityTargetMinPpm || alk > t.alkalinityTargetMaxPpm)) issues.push(`Alkalinity ${alk} ppm`);
      if (cya != null && (cya < t.cyaTargetMinPpm || cya > t.cyaTargetMaxPpm)) issues.push(`Cyanuric acid ${cya} ppm`);

      // Imminent health hazard — closure risk (fee, if this department charges one)
      if (ph != null && (ph < t.phHazardMin || ph > t.phHazardMax)) hazards.push(`pH ${ph} (must be ${t.phHazardMin}–${t.phHazardMax})`);
      if (cya != null && cya > t.cyaHazardMaxPpm) hazards.push(`Cyanuric acid ${cya} ppm (must be ≤${t.cyaHazardMaxPpm})`);

      if (hazards.length) {
        closureHazardReadings.push({
          id: r.visit.id,
          property: r.visit.property.name,
          body: r.visit.bodyOfWater.name,
          completedAt: r.visit.completedAt,
          issues: hazards,
        });
      } else if (issues.length) {
        outOfRangeReadings.push({
          id: r.visit.id,
          property: r.visit.property.name,
          body: r.visit.bodyOfWater.name,
          completedAt: r.visit.completedAt,
          issues,
        });
      }
    }
    outOfRangeReadings = outOfRangeReadings.slice(0, 8);
    closureHazardReadings = closureHazardReadings.slice(0, 8);
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
    completedAtLabel: r.completedAt ? r.completedAt.toLocaleDateString() : null,
    issues: r.issues,
  }));

  const reportedIssueItems = reportedIssues.map((issue) => ({
    id: issue.id,
    severity: issue.severity,
    description: issue.description,
    visitId: issue.visit.id,
    visitLabel: `${issue.visit.property.name} — ${issue.visit.bodyOfWater.name}`,
    techLabel: issue.visit.technician ? issue.visit.technician.name ?? issue.visit.technician.email ?? "Unknown tech" : "Unknown tech",
    createdAtLabel: issue.createdAt.toLocaleDateString(),
  }));

  const overdueVisitItems = overdueVisits.map((v) => ({
    id: v.id,
    property: v.property,
    body: v.body,
    tech: v.tech,
    dueLabel: v.scheduledStart.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  }));

  const outOfRangeItems = outOfRangeReadings.map((r) => ({
    id: r.id,
    property: r.property,
    body: r.body,
    completedAtLabel: r.completedAt ? r.completedAt.toLocaleDateString() : null,
    issues: r.issues,
  }));

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-medium text-[#12234A]">Dashboard</p>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">{user.email}</p>
        </div>
        {appUser?.role === "ADMIN" ? (
          <div className="flex items-center gap-4">
            <PropertyTypeFilterSelect selected={selectedPropertyType} action="/dashboard" />
            <AlertsBell
              closureHazardReadings={closureHazardItems}
              reportedIssues={reportedIssueItems}
              overdueVisits={overdueVisitItems}
              outOfRangeReadings={outOfRangeItems}
              resolveIssue={resolveIssue}
              closureFeeLabel={closureFeeLabel}
            />
          </div>
        ) : null}
      </header>

      <section className="mt-8 space-y-4">
        {complianceComingSoon && !complianceComingSoon.stateName ? (
          <div className="rounded-lg border border-[#0A5FA4]/30 bg-[#EAF6FA] p-4 text-sm text-[#12234A]">
            <p className="font-medium">Set your state to enable compliance tracking</p>
            <p className="mt-1 text-[#4A6572]">
              This account has commercial properties, but no state is set yet.{" "}
              <Link href="/dashboard/settings" className="underline">
                Set it in Settings
              </Link>{" "}
              so closure-risk banners and the QR inspector log can turn on.
            </p>
          </div>
        ) : complianceComingSoon ? (
          <div className="rounded-lg border border-[#0A5FA4]/30 bg-[#EAF6FA] p-4 text-sm text-[#12234A]">
            <p className="font-medium">Compliance tracking for {complianceComingSoon.stateName} is coming soon</p>
            <p className="mt-1 text-[#4A6572]">
              Your service data is still being logged normally in the meantime — closure-risk banners and the QR
              inspector log will turn on automatically once we&rsquo;ve built out your state&rsquo;s rules.
            </p>
          </div>
        ) : null}
        {!appUser ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">No AquaRunner profile linked</p>
            <p className="mt-2 text-amber-900">
              Your Supabase login works, but there is no matching row in the <code className="rounded bg-amber-100 px-1">User</code> table
              (or <code className="rounded bg-amber-100 px-1">authUserId</code> is not set). Run{" "}
              <code className="rounded bg-amber-100 px-1">npm run db:seed</code> with{" "}
              <code className="rounded bg-amber-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
              <code className="rounded bg-amber-100 px-1">SEED_DEV_PASSWORD</code>, then sign in with a seeded email.
            </p>
          </div>
        ) : appUser.role === "ADMIN" && stats ? (
          <>
            {/* Quick stats */}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customers</p>
                <p className="mt-1 text-2xl font-semibold text-[#FF6B5B]">{stats.customers}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property Management Cos.</p>
                <p className="mt-1 text-2xl font-semibold text-[#FF6B5B]">{stats.managementCompanies}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aquatic venues</p>
                <p className="mt-1 text-2xl font-semibold text-[#FF6B5B]">{stats.bodiesOfWater}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visits this week</p>
                <p className="mt-1 text-2xl font-semibold text-[#FF6B5B]">{stats.upcomingThisWeek}</p>
              </div>
            </div>

            {/* Recent activity */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent activity</p>
              {activity.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No recent activity yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <span>
                        <span className="font-medium text-slate-900">{a.label}</span> — {a.detail}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {a.at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-[#12234A] bg-[#12234A] p-4 shadow-sm">
              <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#FF6B5B]">
                {appUser.role}
              </p>
              {appUser.name ? <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold text-white">{appUser.name}</p> : null}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
