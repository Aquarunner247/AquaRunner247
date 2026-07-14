import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";
import { ensureVisitsGeneratedForDate } from "@/lib/visit-generation";
import { RouteDayView } from "@/app/components/route-day-view";
import { resolveIssue, addAdHocStop, toggleAdHocStop, deleteAdHocStop } from "./actions";

type DashboardPageProps = {
  searchParams?: Promise<{ date?: string }>;
};

function parseDateParam(raw: string | undefined): Date {
  if (!raw) return new Date();
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function toYmd(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
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
  const params = (await searchParams) ?? {};
  const selectedDate = parseDateParam(params.date);
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);
  const prevDate = new Date(startOfDay);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(startOfDay);
  nextDate.setDate(nextDate.getDate() + 1);
  const selectedYmd = toYmd(startOfDay);
  const isToday = selectedYmd === toYmd(new Date());
  const isPastDay = selectedYmd < toYmd(new Date());

  if (appUser) {
    await ensureVisitsGeneratedForDate(appUser.organizationId, startOfDay);
  }

  const todayVisits =
    appUser
      ? await prisma.serviceVisit.findMany({
          where: {
            technicianId: appUser.id,
            scheduledStart: { gte: startOfDay, lte: endOfDay },
            status: { in: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"] },
          },
          orderBy: [{ routeSequence: "asc" }, { scheduledStart: "asc" }],
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            startedAt: true,
            property: {
              select: {
                id: true,
                name: true,
                addressLine1: true,
                city: true,
                region: true,
                latitude: true,
                longitude: true,
              },
            },
            bodyOfWater: { select: { name: true } },
          },
        })
      : [];

  const routeStops = todayVisits.map((v) => ({
    id: v.id,
    status: v.status,
    propertyName: v.property.name,
    bodyName: v.bodyOfWater.name,
    address: [v.property.addressLine1, v.property.city, v.property.region].filter(Boolean).join(", "),
    scheduledStart: v.scheduledStart.toISOString(),
    startedAt: v.startedAt ? v.startedAt.toISOString() : null,
    latitude: v.property.latitude != null ? Number(v.property.latitude) : null,
    longitude: v.property.longitude != null ? Number(v.property.longitude) : null,
  }));

  const isPrivileged = appUser?.role === "ADMIN" || appUser?.role === "OFFICE";

  const adHocStops = appUser
    ? await prisma.adHocStop.findMany({
        where: {
          organizationId: appUser.organizationId,
          scheduledDate: { gte: startOfDay, lte: endOfDay },
          ...(isPrivileged ? {} : { technicianId: appUser.id }),
        },
        orderBy: [{ completed: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          description: true,
          completed: true,
          property: { select: { name: true } },
          technician: { select: { name: true, email: true } },
        },
      })
    : [];

  const adHocProperties = appUser
    ? await prisma.property.findMany({
        where: { organizationId: appUser.organizationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const adHocTechnicians =
    appUser && isPrivileged
      ? await prisma.user.findMany({
          where: { organizationId: appUser.organizationId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        })
      : [];

  // ---- Admin overview data ----
  let stats: { customers: number; managementCompanies: number; bodiesOfWater: number; upcomingThisWeek: number } | null = null;
  let scheduleByTech: { techLabel: string; visits: Array<{ id: string; time: string; property: string; body: string; status: string }> }[] = [];
  let activity: Array<{ id: string; label: string; detail: string; at: Date }> = [];
  let overdueVisits: Array<{ id: string; property: string; body: string; tech: string; scheduledStart: Date }> = [];
  let outOfRangeReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[] }> = [];
  let closureHazardReadings: Array<{ id: string; property: string; body: string; completedAt: Date | null; issues: string[] }> = [];

  if (appUser?.role === "ADMIN") {
    const orgId = appUser.organizationId;
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [customersCount, managementCompaniesCount, bodiesCount, upcomingCount] = await Promise.all([
      prisma.customer.count({ where: { organizationId: orgId } }),
      prisma.managementCompany.count({ where: { organizationId: orgId } }),
      prisma.bodyOfWater.count({ where: { property: { organizationId: orgId } } }),
      prisma.serviceVisit.count({
        where: { organizationId: orgId, scheduledStart: { gte: weekStart, lt: weekEnd }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      }),
    ]);
    stats = { customers: customersCount, managementCompanies: managementCompaniesCount, bodiesOfWater: bodiesCount, upcomingThisWeek: upcomingCount };

    const todaysAllVisits = await prisma.serviceVisit.findMany({
      where: { organizationId: orgId, scheduledStart: { gte: startOfDay, lte: endOfDay } },
      orderBy: [{ technicianId: "asc" }, { scheduledStart: "asc" }],
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        property: { select: { name: true } },
        bodyOfWater: { select: { name: true } },
        technician: { select: { name: true, email: true } },
      },
    });

    const byTech = new Map<string, { techLabel: string; visits: typeof scheduleByTech[number]["visits"] }>();
    for (const v of todaysAllVisits) {
      const key = v.technician ? v.technician.name ?? v.technician.email : "Unassigned";
      const entry = byTech.get(key) ?? { techLabel: key, visits: [] };
      entry.visits.push({
        id: v.id,
        time: v.scheduledStart.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        property: v.property.name,
        body: v.bodyOfWater.name,
        status: v.status,
      });
      byTech.set(key, entry);
    }
    scheduleByTech = Array.from(byTech.values());

    const [recentVisits, recentCustomers] = await Promise.all([
      prisma.serviceVisit.findMany({
        where: { organizationId: orgId, status: "COMPLETED", completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 8,
        select: { id: true, completedAt: true, property: { select: { name: true } }, bodyOfWater: { select: { name: true } } },
      }),
      prisma.customer.findMany({
        where: { organizationId: orgId },
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
      where: { organizationId: orgId, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledStart: { lt: now } },
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
    const readings = await prisma.visitWaterReading.findMany({
      where: {
        visit: { organizationId: orgId, completedAt: { gte: sevenDaysAgo } },
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
      const fc = r.freeChlorinePpm != null ? Number(r.freeChlorinePpm) : null;
      const ph = r.ph != null ? Number(r.ph) : null;
      const alk = r.alkalinityPpm != null ? Number(r.alkalinityPpm) : null;
      const cya = r.cyanuricAcidPpm != null ? Number(r.cyanuricAcidPpm) : null;
      const fcMin = r.visit.bodyOfWater.type === "SPA" ? 3 : 2;

      if (fc != null && (fc < fcMin || fc > 10)) issues.push(`Free chlorine ${fc} ppm`);
      if (ph != null && (ph < 7.2 || ph > 7.8)) issues.push(`pH ${ph}`);
      if (alk != null && (alk < 60 || alk > 180)) issues.push(`Alkalinity ${alk} ppm`);
      if (cya != null && (cya < 30 || cya > 50)) issues.push(`Cyanuric acid ${cya} ppm`);

      // Imminent health hazard — SNHD closure + $909 reopening fee territory
      if (ph != null && (ph < 6.5 || ph > 8.0)) hazards.push(`pH ${ph} (must be 6.5\u20138.0)`);
      if (cya != null && cya > 100) hazards.push(`Cyanuric acid ${cya} ppm (must be \u2264100)`);

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
          where: { resolved: false, visit: { organizationId: appUser.organizationId } },
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

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-medium text-[#12234A]">Dashboard</p>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">{user.email}</p>
        </div>
      </header>

      <section className="mt-8 space-y-4">
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
            {/* Your own stops today, if you're also assigned as a technician on a route/visit */}
            {todayVisits.length > 0 ? (
              <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#0A5FA4]">
                      Your stops today
                    </p>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-base font-bold text-[#12234A]">
                      {startOfDay.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Link className="rounded border border-[#C9E3EC] bg-white px-2 py-1 text-[#12234A]" href={`/dashboard?date=${toYmd(prevDate)}`}>
                      Previous day
                    </Link>
                    {!isToday ? (
                      <Link className="rounded border border-[#C9E3EC] bg-white px-2 py-1 text-[#12234A]" href="/dashboard">
                        Today
                      </Link>
                    ) : null}
                    <Link className="rounded border border-[#C9E3EC] bg-white px-2 py-1 text-[#12234A]" href={`/dashboard?date=${toYmd(nextDate)}`}>
                      Next day
                    </Link>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[#4A6572]">
                  {todayVisits.length} stop{todayVisits.length === 1 ? "" : "s"} today. Drag to reorder.
                </p>
                <div className="mt-3">
                  <RouteDayView visits={routeStops} readOnly={isPastDay} isToday={isToday} />
                </div>
              </div>
            ) : null}

            {/* Extra stops — pool store runs, property drop-offs, anything that isn't a chemistry visit */}
            <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
              <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#0A5FA4]">
                Extra stops
              </p>
              {adHocStops.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No extra stops for this day.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {adHocStops.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <span className={s.completed ? "text-slate-400 line-through" : "text-slate-800"}>
                        {s.description}
                        {s.property ? ` — ${s.property.name}` : ""}
                        {s.technician ? ` · ${s.technician.name ?? s.technician.email}` : " · Unassigned"}
                      </span>
                      <span className="flex items-center gap-2">
                        <form action={toggleAdHocStop}>
                          <input type="hidden" name="stopId" value={s.id} />
                          <button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
                            {s.completed ? "Undo" : "Done"}
                          </button>
                        </form>
                        <form action={deleteAdHocStop}>
                          <input type="hidden" name="stopId" value={s.id} />
                          <button type="submit" className="rounded border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50">
                            Delete
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addAdHocStop} className="mt-3 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2">
                <input type="hidden" name="scheduledDate" value={selectedYmd} />
                <input
                  name="description"
                  required
                  placeholder="e.g. Pool store, drop off filter…"
                  className="min-w-[180px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <select name="propertyId" defaultValue="" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">No property</option>
                  {adHocProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select name="technicianId" defaultValue="" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Unassigned</option>
                  {adHocTechnicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? t.email}
                    </option>
                  ))}
                </select>
                <button type="submit" className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white">
                  Add stop
                </button>
              </form>
            </div>

            {/* Quick stats */}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customers</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.customers}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property Management Cos.</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.managementCompanies}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aquatic venues</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.bodiesOfWater}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visits this week</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.upcomingThisWeek}</p>
              </div>
            </div>

            {/* Closure-hazard alert — highest urgency */}
            {closureHazardReadings.length > 0 ? (
              <div className="rounded-lg border-2 border-red-700 bg-red-50 p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-red-800">
                  ⚠ Imminent health hazard — closure risk ($909 reopening fee)
                </p>
                <ul className="mt-2 space-y-1">
                  {closureHazardReadings.map((r, i) => (
                    <li key={`${r.id}-${i}`} className="text-sm font-medium text-red-900">
                      {r.property} — {r.body}: {r.issues.join(", ")}
                      {r.completedAt ? ` (${r.completedAt.toLocaleDateString()})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Technician-reported issues */}
            {reportedIssues.length > 0 ? (
              <div className="rounded-lg border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#B54B3D]">Reported issues</p>
                <ul className="mt-2 space-y-2">
                  {reportedIssues.map((issue) => (
                    <li key={issue.id} className="flex flex-wrap items-start justify-between gap-2 rounded border border-[#FF6B5B]/30 bg-white px-3 py-2 text-sm">
                      <div>
                        <span className="font-semibold uppercase text-xs text-[#FF6B5B]">{issue.severity}</span>{" "}
                        <Link href={`/dashboard/visits/${issue.visit.id}`} className="font-medium text-[#12234A] underline">
                          {issue.visit.property.name} — {issue.visit.bodyOfWater.name}
                        </Link>
                        <p className="mt-0.5 text-[#4A6572]">{issue.description}</p>
                        <p className="mt-0.5 text-xs text-[#7FA0AC]">
                          {issue.visit.technician ? issue.visit.technician.name ?? issue.visit.technician.email : "Unknown tech"} ·{" "}
                          {issue.createdAt.toLocaleDateString()}
                        </p>
                      </div>
                      <form action={resolveIssue}>
                        <input type="hidden" name="issueId" value={issue.id} />
                        <button type="submit" className="rounded bg-[#0A5FA4] px-2 py-1 text-xs font-medium text-white">
                          Mark resolved
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Alerts */}
            {overdueVisits.length > 0 || outOfRangeReadings.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">Alerts</p>
                {overdueVisits.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-rose-900">
                      {overdueVisits.length} overdue visit{overdueVisits.length === 1 ? "" : "s"}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {overdueVisits.map((v) => (
                        <li key={v.id} className="text-sm text-rose-800">
                          <Link href={`/dashboard/visits/${v.id}`} className="underline">
                            {v.property} — {v.body}
                          </Link>{" "}
                          · {v.tech} · was due {v.scheduledStart.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {outOfRangeReadings.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-rose-900">Out-of-range readings (last 7 days)</p>
                    <ul className="mt-1 space-y-1">
                      {outOfRangeReadings.map((r, i) => (
                        <li key={`${r.id}-${i}`} className="text-sm text-rose-800">
                          {r.property} — {r.body}: {r.issues.join(", ")}
                          {r.completedAt ? ` (${r.completedAt.toLocaleDateString()})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Today's schedule across all techs */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Today&rsquo;s schedule — {startOfDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Link className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700" href={`/dashboard?date=${toYmd(prevDate)}`}>
                    Previous day
                  </Link>
                  {!isToday ? (
                    <Link className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700" href="/dashboard">
                      Today
                    </Link>
                  ) : null}
                  <Link className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700" href={`/dashboard?date=${toYmd(nextDate)}`}>
                    Next day
                  </Link>
                </div>
              </div>
              {scheduleByTech.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No visits scheduled for this day.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {scheduleByTech.map((group) => (
                    <div key={group.techLabel} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-sm font-medium text-slate-900">{group.techLabel}</p>
                      <ul className="mt-1 space-y-1 text-sm text-slate-700">
                        {group.visits.map((v) => (
                          <li key={v.id}>
                            <Link href={`/dashboard/visits/${v.id}`} className="underline">
                              {v.time} — {v.property} · {v.body}
                            </Link>{" "}
                            <span className="text-slate-500">({v.status})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
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
            {appUser.role === "TECHNICIAN" ? (
              <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#0A5FA4]">
                      Route day
                    </p>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-base font-bold text-[#12234A]">
                      {startOfDay.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Link className="rounded border border-[#C9E3EC] bg-white px-2 py-1 text-[#12234A]" href={`/dashboard?date=${toYmd(prevDate)}`}>
                      Previous day
                    </Link>
                    {!isToday ? (
                      <Link className="rounded border border-[#C9E3EC] bg-white px-2 py-1 text-[#12234A]" href="/dashboard">
                        Today
                      </Link>
                    ) : null}
                    <Link className="rounded border border-[#C9E3EC] bg-white px-2 py-1 text-[#12234A]" href={`/dashboard?date=${toYmd(nextDate)}`}>
                      Next day
                    </Link>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[#4A6572]">
                  {todayVisits.length === 0
                    ? "No assigned stops for this day."
                    : `${todayVisits.length} stop${todayVisits.length === 1 ? "" : "s"} today. Drag to reorder.`}
                </p>
                {todayVisits.length ? (
                  <div className="mt-3">
                    <RouteDayView visits={routeStops} readOnly={isPastDay} isToday={isToday} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {appUser.role === "TECHNICIAN" ? (
              <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
                <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#0A5FA4]">
                  Extra stops
                </p>
                {adHocStops.length === 0 ? (
                  <p className="mt-2 text-sm text-[#4A6572]">No extra stops for this day.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {adHocStops.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#C9E3EC] bg-[#EAF6FA] px-3 py-2 text-sm">
                        <span className={s.completed ? "text-[#7FA0AC] line-through" : "text-[#16324A]"}>
                          {s.description}
                          {s.property ? ` — ${s.property.name}` : ""}
                        </span>
                        <span className="flex items-center gap-2">
                          <form action={toggleAdHocStop}>
                            <input type="hidden" name="stopId" value={s.id} />
                            <button type="submit" className="rounded border border-[#C9E3EC] bg-white px-2 py-1 text-xs font-medium text-[#12234A]">
                              {s.completed ? "Undo" : "Done"}
                            </button>
                          </form>
                          <form action={deleteAdHocStop}>
                            <input type="hidden" name="stopId" value={s.id} />
                            <button type="submit" className="rounded border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-800">
                              Delete
                            </button>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={addAdHocStop} className="mt-3 flex flex-wrap items-center gap-2 rounded border border-[#C9E3EC] bg-[#EAF6FA] p-2">
                  <input type="hidden" name="scheduledDate" value={selectedYmd} />
                  <input
                    name="description"
                    required
                    placeholder="e.g. Pool store, drop off filter…"
                    className="min-w-[180px] flex-1 rounded border border-[#C9E3EC] bg-white px-2 py-1.5 text-sm"
                  />
                  <select name="propertyId" defaultValue="" className="rounded border border-[#C9E3EC] bg-white px-2 py-1.5 text-sm">
                    <option value="">No property</option>
                    {adHocProperties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white">
                    Add stop
                  </button>
                </form>
              </div>
            ) : null}
            {appUser.role === "TECHNICIAN" ? (
              <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
                <p className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">
                  Service standards
                </p>
                <ul className="mt-2 list-inside list-disc text-sm text-[#16324A]">
                  <li>At least 1 photo per aquatic venue before completion.</li>
                  <li>Hybrid save flow: autosave + manual Save/Sync action.</li>
                  <li>Public QR log mirrors aquatic maintenance records.</li>
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
