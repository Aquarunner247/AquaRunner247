import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureVisitsGeneratedForDate } from "@/lib/visit-generation";
import { RouteDayView } from "@/app/components/route-day-view";
import { TechnicianFilterSelect } from "@/app/components/technician-filter-select";
import { PropertyTypeFilterSelect } from "@/app/components/property-type-filter-select";
import { WEEKDAY_LABELS } from "@/lib/service-weekdays";
import { addAdHocStop, toggleAdHocStop, deleteAdHocStop } from "@/app/dashboard/actions";
import { getTechnicianColorMap, UNASSIGNED_TECHNICIAN_COLOR } from "@/lib/technician-colors";
import { WaveProgress } from "@/app/components/wave-progress";

type Props = {
  appUser: { id: string; organizationId: string };
  searchParams: Promise<{ tab?: string; date?: string; tech?: string; type?: string; status?: string }>;
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

const TABS = ["day", "week", "map", "list"] as const;
type Tab = (typeof TABS)[number];

// The four stat tiles double as filters -- "all" (Total Jobs) is the unfiltered default.
// Skipped/cancelled stops aren't one of the four tiles, so there's no filter value for
// them; they still show up under "all". Actual filtering happens inside RouteDayView
// (its statusFilter prop), not here -- see that component's doc comment for why.
const STATUS_FILTERS = ["all", "completed", "in_progress", "pending"] as const;
type StatusFilterValue = (typeof STATUS_FILTERS)[number];

/**
 * Admin/office-facing counterpart to the technician SchedulePage — same tabbed Day/Week/
 * Map/List structure and status badges, plus a technician filter (default "All
 * Technicians" combined view, or narrow to one technician's own route). Reuses
 * RouteDayView's multi-technician mode for the combined view, which stays read-only (see
 * route-day-view.tsx's own isMultiTech reasoning — reordering an interleaved combined
 * route isn't coherent). Narrowing to a single technician via the filter drops into full
 * interactivity — drag-to-reorder, skip/unskip, "Optimize route" — same as that
 * technician's own page. The reorder/status API routes already authorize ADMIN/OFFICE to
 * edit any technician's visits (see api/visits/reorder/route.ts's canEditAll), so this is
 * purely a client-side gate matching what the server already allows.
 */
export async function AdminSchedule({ appUser, searchParams }: Props) {
  const sp = await searchParams;
  const tab: Tab = TABS.includes((sp.tab ?? "") as Tab) ? ((sp.tab ?? "day") as Tab) : "day";
  const statusFilter: StatusFilterValue = STATUS_FILTERS.includes((sp.status ?? "") as StatusFilterValue)
    ? ((sp.status ?? "all") as StatusFilterValue)
    : "all";

  const selectedDate = parseDateParam(sp.date);
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);
  const prevDate = new Date(startOfDay);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(startOfDay);
  nextDate.setDate(nextDate.getDate() + 1);
  const selectedYmd = toYmd(startOfDay);
  const todayYmd = toYmd(new Date());
  const isToday = selectedYmd === todayYmd;

  // Fetched once, reused for: the filter dropdown, the technician-color assignment, and
  // validating `sp.tech` (a non-matching id — wrong org, stale id — silently falls back to
  // "All" rather than erroring, avoiding leaking existence info).
  //
  // Two queries, not one: active TECHNICIAN-role users, plus anyone else (in practice, an
  // Admin) who's currently the default technician on at least one active recurring route.
  // Admins can be assigned stops on a route "like a technician" (see the Roles copy on the
  // Users page) — a route's technicianId has no role restriction at the schema level — so
  // an Admin carrying a route needs to show up in this filter too, not just literal
  // TECHNICIAN-role users. Role-agnostic (role: { not: "TECHNICIAN" }) rather than
  // Admin-only, since RecurringRoute.technicianId doesn't restrict by role either.
  const [technicianRoster, nonTechnicianRouteOwners] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: appUser.organizationId, role: "TECHNICIAN", active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, email: true },
    }),
    prisma.user.findMany({
      where: {
        organizationId: appUser.organizationId,
        role: { not: "TECHNICIAN" },
        active: true,
        assignedRoutes: { some: { active: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);
  const roster = [...technicianRoster, ...nonTechnicianRouteOwners];
  const selectedTechnicianId = roster.find((t) => t.id === sp.tech)?.id ?? null;
  const selectedPropertyType: "RESIDENTIAL" | "COMMERCIAL" | null =
    sp.type === "RESIDENTIAL" || sp.type === "COMMERCIAL" ? sp.type : null;
  const colorMap = getTechnicianColorMap(roster.map((t) => t.id));
  const technicianColorsRecord = Object.fromEntries(colorMap);

  function tabHref(t: Tab) {
    const params = new URLSearchParams();
    params.set("tab", t);
    if (sp.date) params.set("date", sp.date);
    if (selectedTechnicianId) params.set("tech", selectedTechnicianId);
    if (selectedPropertyType) params.set("type", selectedPropertyType);
    return `/dashboard/schedule?${params.toString()}`;
  }
  function dayHref(ymd: string) {
    const params = new URLSearchParams();
    params.set("tab", tab === "week" ? "day" : tab);
    params.set("date", ymd);
    if (selectedTechnicianId) params.set("tech", selectedTechnicianId);
    if (selectedPropertyType) params.set("type", selectedPropertyType);
    return `/dashboard/schedule?${params.toString()}`;
  }
  // Deliberately doesn't preserve `status` across tab/day navigation (see tabHref/
  // dayHref above, neither sets it either) -- same reasoning as the technician page's
  // own statusHref: a filter carried over to a newly-navigated day could silently show
  // "no stops" with no visible reason.
  function statusHref(s: StatusFilterValue) {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (sp.date) params.set("date", sp.date);
    if (selectedTechnicianId) params.set("tech", selectedTechnicianId);
    if (selectedPropertyType) params.set("type", selectedPropertyType);
    if (s !== "all") params.set("status", s);
    return `/dashboard/schedule?${params.toString()}`;
  }
  function statTileClass(active: boolean) {
    return `rounded-md px-1 py-1 transition ${active ? "bg-white/15 ring-1 ring-white/40" : "hover:bg-white/5"}`;
  }

  let weekData: { ymd: string; label: string; total: number; completed: number; skipped: number }[] = [];

  if (tab === "week") {
    const weekStart = startOfWeek(selectedDate);
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      await ensureVisitsGeneratedForDate(appUser.organizationId, day);
    }
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekVisits = await prisma.serviceVisit.findMany({
      where: {
        organizationId: appUser.organizationId,
        scheduledStart: { gte: weekStart, lt: weekEnd },
        ...(selectedTechnicianId ? { technicianId: selectedTechnicianId } : {}),
        ...(selectedPropertyType ? { property: { propertyType: selectedPropertyType } } : {}),
      },
      select: { scheduledStart: true, status: true },
    });

    weekData = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const ymd = toYmd(day);
      const dayVisits = weekVisits.filter((v) => toYmd(v.scheduledStart) === ymd);
      return {
        ymd,
        label: WEEKDAY_LABELS[i + 1],
        total: dayVisits.length,
        completed: dayVisits.filter((v) => v.status === "COMPLETED").length,
        skipped: dayVisits.filter((v) => v.status === "CANCELLED").length,
      };
    });
  } else {
    await ensureVisitsGeneratedForDate(appUser.organizationId, startOfDay);
  }

  // Same query shape whether "All Technicians" or a single one is selected — the only
  // difference is whether technicianId is in the where clause. Ordered by technicianId
  // first so the map's per-tech polylines and the list's grouped headers are trivial
  // (each tech's stops are already a contiguous run), no client-side regrouping needed.
  const dayVisits =
    tab === "week"
      ? []
      : await prisma.serviceVisit.findMany({
          where: {
            organizationId: appUser.organizationId,
            scheduledStart: { gte: startOfDay, lte: endOfDay },
            ...(selectedTechnicianId ? { technicianId: selectedTechnicianId } : {}),
            ...(selectedPropertyType ? { property: { propertyType: selectedPropertyType } } : {}),
          },
          orderBy: [{ technicianId: "asc" }, { routeSequence: "asc" }, { scheduledStart: "asc" }],
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            startedAt: true,
            property: {
              select: { id: true, name: true, addressLine1: true, city: true, region: true, latitude: true, longitude: true },
            },
            bodyOfWater: { select: { name: true } },
            technician: { select: { id: true, name: true, email: true } },
          },
        });

  const routeStops = dayVisits.map((v) => ({
    id: v.id,
    status: v.status,
    propertyId: v.property.id,
    propertyName: v.property.name,
    bodyName: v.bodyOfWater.name,
    address: [v.property.addressLine1, v.property.city, v.property.region].filter(Boolean).join(", "),
    scheduledStart: v.scheduledStart.toISOString(),
    startedAt: v.startedAt ? v.startedAt.toISOString() : null,
    latitude: v.property.latitude != null ? Number(v.property.latitude) : null,
    longitude: v.property.longitude != null ? Number(v.property.longitude) : null,
    technicianId: v.technician?.id ?? null,
    technicianLabel: v.technician ? (v.technician.name ?? v.technician.email) : null,
  }));

  const technicianIdsWithStops = new Set(routeStops.map((v) => v.technicianId).filter((id): id is string => Boolean(id)));
  const technicianLegend = roster
    .filter((t) => technicianIdsWithStops.has(t.id))
    .map((t) => ({ id: t.id, label: t.name ?? t.email, color: colorMap.get(t.id) ?? UNASSIGNED_TECHNICIAN_COLOR }));

  // Ad-hoc "Extra stops" stays org-wide regardless of the technician filter — it's a
  // standalone utility list, not part of the route visualization.
  const [adHocStops, adHocProperties] = await Promise.all([
    tab === "week"
      ? Promise.resolve([])
      : prisma.adHocStop.findMany({
          where: { organizationId: appUser.organizationId, scheduledDate: { gte: startOfDay, lte: endOfDay } },
          orderBy: [{ completed: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            description: true,
            completed: true,
            property: { select: { name: true } },
            technician: { select: { name: true, email: true } },
          },
        }),
    tab === "week"
      ? Promise.resolve([])
      : prisma.property.findMany({ where: { organizationId: appUser.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const stats = {
    total: routeStops.length,
    completed: routeStops.filter((v) => v.status === "COMPLETED").length,
    inProgress: routeStops.filter((v) => v.status === "IN_PROGRESS").length,
    pending: routeStops.filter((v) => v.status === "SCHEDULED").length,
    skipped: routeStops.filter((v) => v.status === "CANCELLED").length,
  };

  const technicianOptions = roster.map((t) => ({ id: t.id, label: t.name ?? t.email }));

  const dayPercent = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  return (
    <main className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="bg-brand-ink px-4 pb-4 pt-6">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-white">Schedule</h1>

        <div className="app-tabs mt-4 grid grid-cols-4 bg-white/10">
          {TABS.map((t) => (
            <Link key={t} href={tabHref(t)} className={`text-center ${tab === t ? "app-tab-active" : "app-tab text-brand-border hover:text-white"}`}>
              {t}
            </Link>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-2">
          <TechnicianFilterSelect
            technicians={technicianOptions}
            selectedId={selectedTechnicianId}
            tab={tab}
            date={selectedYmd}
            propertyType={selectedPropertyType}
          />
          <PropertyTypeFilterSelect
            selected={selectedPropertyType}
            action="/dashboard/schedule"
            technicianId={selectedTechnicianId}
            tab={tab}
            date={selectedYmd}
          />
        </div>

        {tab !== "week" ? (
          <div className="mt-4 flex items-center justify-between text-white">
            <Link href={dayHref(toYmd(prevDate))} className="rounded px-2 py-1 text-lg transition hover:bg-white/10" aria-label="Previous day">
              ‹
            </Link>
            <p className="text-sm font-medium">
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
            <Link href={dayHref(toYmd(nextDate))} className="rounded px-2 py-1 text-lg transition hover:bg-white/10" aria-label="Next day">
              ›
            </Link>
          </div>
        ) : null}

        {tab !== "week" ? (
          <div className="mt-4 rounded-xl bg-white/5 p-3 text-white">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Link href={statusHref("all")} className={statTileClass(statusFilter === "all")}>
                <p className="app-metric text-2xl font-bold">{stats.total}</p>
                <p className="text-[10px] uppercase tracking-wide text-brand-border">Total jobs</p>
              </Link>
              <Link href={statusHref("completed")} className={statTileClass(statusFilter === "completed")}>
                <p className="app-metric text-2xl font-bold text-brand-primary">{stats.completed}</p>
                <p className="text-[10px] uppercase tracking-wide text-brand-border">Completed</p>
              </Link>
              <Link href={statusHref("in_progress")} className={statTileClass(statusFilter === "in_progress")}>
                <p className="app-metric text-2xl font-bold text-white">{stats.inProgress}</p>
                <p className="text-[10px] uppercase tracking-wide text-brand-border">In progress</p>
              </Link>
              <Link href={statusHref("pending")} className={statTileClass(statusFilter === "pending")}>
                <p className="app-metric text-2xl font-bold text-brand-warnFill">{stats.pending}</p>
                <p className="text-[10px] uppercase tracking-wide text-brand-border">Pending</p>
              </Link>
            </div>
            {stats.total > 0 ? (
              <div className="mt-3">
                <WaveProgress percent={dayPercent} sublabel={`${stats.completed} of ${stats.total} done`} onDark />
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="px-4 py-4">
        {tab === "week" ? (
          <div className="space-y-2">
            {weekData.map((d) => (
              <Link
                key={d.ymd}
                href={dayHref(d.ymd)}
                className={`app-card-hover flex items-center justify-between rounded-xl border p-3 transition ${
                  d.ymd === todayYmd ? "border-brand-primary bg-brand-foam" : "border-brand-border bg-white"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-brand-ink">{d.label}</p>
                  <p className="text-xs text-brand-icon">
                    {new Date(`${d.ymd}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex gap-3 text-right text-xs">
                  <span className="app-metric text-brand-ink">
                    <span className="font-semibold">{d.total}</span> jobs
                  </span>
                  <span className="app-metric text-brand-primaryHover">
                    <span className="font-semibold">{d.completed}</span> done
                  </span>
                  {d.skipped > 0 ? (
                    <span className="app-metric text-brand-danger">
                      <span className="font-semibold">{d.skipped}</span> skipped
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <>
            <RouteDayView
              visits={routeStops}
              statusFilter={statusFilter}
              // Read-only whenever viewing "All Technicians" (unchanged reasoning), AND
              // whenever a status filter is active -- reordering a filtered subset
              // doesn't have coherent semantics against the day's real underlying
              // sequence (same rationale as the technician page's own gate).
              readOnly={!selectedTechnicianId || statusFilter !== "all"}
              isToday={isToday}
              dateYmd={selectedYmd}
              layout={tab === "map" ? "mapOnly" : tab === "list" ? "listOnly" : "both"}
              technicianColors={selectedTechnicianId ? undefined : technicianColorsRecord}
              technicianLegend={selectedTechnicianId ? undefined : technicianLegend}
              allowGpsAutoArrival={false}
            />

            {tab !== "map" ? (
              <div className="app-card mt-4">
                <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-primary">Extra stops</p>
                {adHocStops.length === 0 ? (
                  <p className="mt-2 text-sm text-brand-ink/60">No extra stops for this day — add one below.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {adHocStops.map((s) => (
                      <li key={s.id} className="app-card-inset flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className={s.completed ? "text-brand-icon line-through" : "text-brand-ink"}>
                          {s.description}
                          {s.property ? ` — ${s.property.name}` : ""}
                          {s.technician ? ` · ${s.technician.name ?? s.technician.email}` : " · Unassigned"}
                        </span>
                        <span className="flex items-center gap-2">
                          <form action={toggleAdHocStop}>
                            <input type="hidden" name="stopId" value={s.id} />
                            <button type="submit" className="app-btn-ghost-sm">
                              {s.completed ? "Undo" : "Done"}
                            </button>
                          </form>
                          <form action={deleteAdHocStop}>
                            <input type="hidden" name="stopId" value={s.id} />
                            <button type="submit" className="app-btn-danger-sm">
                              Delete
                            </button>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <form id="add-stop-form" action={addAdHocStop} className="app-card-inset mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="scheduledDate" value={selectedYmd} />
                  <input
                    name="description"
                    required
                    placeholder="e.g. Pool store, drop off filter…"
                    className="app-field min-w-[180px] flex-1"
                  />
                  <select name="propertyId" defaultValue="" className="app-field w-auto">
                    <option value="">No property</option>
                    {adHocProperties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select name="technicianId" defaultValue="" className="app-field w-auto">
                    <option value="">Unassigned</option>
                    {roster.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name ?? t.email}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="app-btn-primary-sm">
                    Add stop
                  </button>
                </form>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
