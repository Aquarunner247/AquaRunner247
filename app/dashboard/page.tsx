import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";
import { AlertsBell } from "@/app/components/alerts-bell";
import { PropertyTypeFilterSelect } from "@/app/components/property-type-filter-select";
import { WaveProgress } from "@/app/components/wave-progress";
import { ChemGauge } from "@/app/components/chem-gauge";
import { resolveIssue } from "./actions";
import { TechnicianHome } from "./technician-home";

type ReadingParam = { key: string; label: string; value: number; unit: string; min: number; max: number; idealMin: number; idealMax: number };

const READING_GAUGE_RANGES: Record<string, { min: number; max: number; unit: string; label: string }> = {
  freeChlorine: { min: 0, max: 12, unit: " ppm", label: "Free Cl" },
  ph: { min: 6, max: 8.5, unit: "", label: "pH" },
  alkalinity: { min: 0, max: 220, unit: " ppm", label: "Alkalinity" },
  cya: { min: 0, max: 110, unit: " ppm", label: "CYA" },
};

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
  let stats: { customers: number; managementCompanies: number; bodiesOfWater: number; upcomingThisWeek: number; weekTotal: number; weekCompleted: number } | null = null;
  let activity: Array<{ id: string; label: string; detail: string; at: Date }> = [];
  let overdueVisits: Array<{ id: string; property: string; body: string; tech: string; scheduledStart: Date }> = [];
  let outOfRangeReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[]; params: ReadingParam[] }> = [];
  let closureHazardReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[]; params: ReadingParam[] }> = [];

  if (appUser?.role === "ADMIN") {
    const orgId = appUser.organizationId;
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Management Companies stays unfiltered — it has no direct propertyType, and filtering it
    // would need an awkward traversal for a fundamentally different kind of count.
    const customerPropertyFilter = selectedPropertyType ? { properties: { some: { propertyType: selectedPropertyType } } } : {};
    const bodyPropertyFilter = selectedPropertyType ? { propertyType: selectedPropertyType } : {};
    const visitPropertyFilter = selectedPropertyType ? { property: { propertyType: selectedPropertyType } } : {};

    const [customersCount, managementCompaniesCount, bodiesCount, upcomingCount, weekTotalCount, weekCompletedCount] = await Promise.all([
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
      prisma.serviceVisit.count({
        where: { organizationId: orgId, scheduledStart: { gte: weekStart, lt: weekEnd }, ...visitPropertyFilter },
      }),
      prisma.serviceVisit.count({
        where: { organizationId: orgId, scheduledStart: { gte: weekStart, lt: weekEnd }, status: "COMPLETED", ...visitPropertyFilter },
      }),
    ]);
    stats = {
      customers: customersCount,
      managementCompanies: managementCompaniesCount,
      bodiesOfWater: bodiesCount,
      upcomingThisWeek: upcomingCount,
      weekTotal: weekTotalCount,
      weekCompleted: weekCompletedCount,
    };

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
    // SNHD compliance banners are commercial-only, per the residential/commercial split —
    // residential pools don't have closure-risk rules or ideal-zone chemistry targets. If the
    // admin explicitly filtered to Residential, there's no such thing as a residential
    // closure-risk reading — an empty result is correct, so skip the query entirely.
    const readings =
      selectedPropertyType === "RESIDENTIAL"
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

    for (const r of readings) {
      const issues: string[] = [];
      const hazards: string[] = [];
      const params: ReadingParam[] = [];
      const fc = r.freeChlorinePpm != null ? Number(r.freeChlorinePpm) : null;
      const ph = r.ph != null ? Number(r.ph) : null;
      const alk = r.alkalinityPpm != null ? Number(r.alkalinityPpm) : null;
      const cya = r.cyanuricAcidPpm != null ? Number(r.cyanuricAcidPpm) : null;
      const fcMin = r.visit.bodyOfWater.type === "SPA" ? 3 : 2;

      if (fc != null && (fc < fcMin || fc > 10)) {
        issues.push(`Free chlorine ${fc} ppm`);
        params.push({ key: "freeChlorine", ...READING_GAUGE_RANGES.freeChlorine, value: fc, idealMin: fcMin, idealMax: 10 });
      }
      if (ph != null && (ph < 7.2 || ph > 7.8)) {
        issues.push(`pH ${ph}`);
        params.push({ key: "ph", ...READING_GAUGE_RANGES.ph, value: ph, idealMin: 7.2, idealMax: 7.8 });
      }
      if (alk != null && (alk < 60 || alk > 180)) {
        issues.push(`Alkalinity ${alk} ppm`);
        params.push({ key: "alkalinity", ...READING_GAUGE_RANGES.alkalinity, value: alk, idealMin: 60, idealMax: 180 });
      }
      if (cya != null && (cya < 30 || cya > 50)) {
        issues.push(`Cyanuric acid ${cya} ppm`);
        params.push({ key: "cya", ...READING_GAUGE_RANGES.cya, value: cya, idealMin: 30, idealMax: 50 });
      }

      // Imminent health hazard — SNHD closure + $909 reopening fee territory
      if (ph != null && (ph < 6.5 || ph > 8.0)) hazards.push(`pH ${ph} (must be 6.5–8.0)`);
      if (cya != null && cya > 100) hazards.push(`Cyanuric acid ${cya} ppm (must be ≤100)`);

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

  const weekPercent = stats && stats.weekTotal > 0 ? (stats.weekCompleted / stats.weekTotal) * 100 : 0;

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
              resolveIssue={resolveIssue}
            />
          </div>
        ) : null}
      </header>

      <section className="mt-6 space-y-5">
        {!appUser ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
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
            {/* Quick stats — card grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Customers</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-navy">{stats.customers}</p>
              </div>
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Property mgmt. cos.</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-navy">{stats.managementCompanies}</p>
              </div>
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Aquatic venues</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-navy">{stats.bodiesOfWater}</p>
              </div>
              <div className="app-card app-card-hover">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Scheduled this week</p>
                <p className="app-metric mt-1 text-3xl font-semibold text-brand-navy">{stats.upcomingThisWeek}</p>
              </div>
            </div>

            {/* Week progress — the signature water-level motif, doing real work: share of this week's stops completed */}
            <div className="app-card">
              <WaveProgress
                percent={weekPercent}
                label="This week's stops"
                sublabel={stats.weekTotal > 0 ? `${stats.weekCompleted} of ${stats.weekTotal} complete` : "Nothing scheduled yet"}
              />
            </div>

            {closureHazardReadings.length > 0 ? (
              <div className="rounded-2xl border-2 border-brand-coralDark bg-brand-coral/10 p-4 shadow-soft md:p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-coralDark">
                  Closure risk — imminent health hazard ($909 reopening fee)
                </p>
                <ul className="mt-3 space-y-3">
                  {closureHazardReadings.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-coral/30 bg-white/70 p-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-navy">
                          {r.property} — {r.body}
                        </p>
                        {r.completedAt ? <p className="text-xs text-brand-icon">{r.completedAt.toLocaleDateString()}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {r.params.map((p) => (
                          <span key={p.key} className="flex items-center gap-1.5">
                            <ChemGauge value={p.value} min={p.min} max={p.max} idealMin={p.idealMin} idealMax={p.idealMax} unit={p.unit} />
                            <span className="text-xs font-medium text-brand-navy/70">{p.label}</span>
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Out-of-range readings — signature chemistry gauge instead of a plain number */}
              <div className="app-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Out-of-range readings (last 7 days)</p>
                {outOfRangeReadings.length === 0 ? (
                  <p className="mt-2 text-sm text-brand-navy/60">Every commercial reading this week is in range.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {outOfRangeReadings.map((r) => (
                      <li key={r.id} className="app-card-inset flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-brand-navy">
                            {r.property} — {r.body}
                          </p>
                          {r.completedAt ? <p className="text-xs text-brand-icon">{r.completedAt.toLocaleDateString()}</p> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {r.params.map((p) => (
                            <span key={p.key} className="flex items-center gap-1.5">
                              <ChemGauge value={p.value} min={p.min} max={p.max} idealMin={p.idealMin} idealMax={p.idealMax} unit={p.unit} />
                              <span className="text-xs font-medium text-brand-navy/70">{p.label}</span>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Overdue stops */}
              <div className="app-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Overdue stops</p>
                {overdueVisits.length === 0 ? (
                  <p className="mt-2 text-sm text-brand-navy/60">Nothing overdue — every stop is on schedule.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {overdueVisits.map((v) => (
                      <li key={v.id} className="app-card-inset flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-brand-navy">
                          {v.property} — {v.body} <span className="text-brand-navy/60">· {v.tech}</span>
                        </span>
                        <span className="app-pill-attention shrink-0">
                          Due {v.scheduledStart.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Recent activity */}
            <div className="app-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Recent activity</p>
              {activity.length === 0 ? (
                <p className="mt-2 text-sm text-brand-navy/60">No recent activity yet — completed visits and new customers will show up here.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <span className="text-brand-navy/80">
                        <span className="font-medium text-brand-navy">{a.label}</span> — {a.detail}
                      </span>
                      <span className="app-metric shrink-0 text-xs text-brand-icon">
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
            <div className="rounded-2xl border border-brand-navy bg-brand-navy p-4 shadow-soft">
              <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-coral">{appUser.role}</p>
              {appUser.name ? <p className="mt-1 font-display text-lg font-bold text-white">{appUser.name}</p> : null}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
