import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ensureVisitsGeneratedForDate } from "@/lib/visit-generation";
import { RouteDayView } from "@/app/components/route-day-view";
import { WEEKDAY_LABELS } from "@/lib/service-weekdays";
import { addAdHocStop, toggleAdHocStop, deleteAdHocStop } from "@/app/dashboard/actions";
import { AdminSchedule } from "./admin-schedule";

type PageProps = {
  searchParams?: Promise<{ tab?: string; date?: string; tech?: string; status?: string }>;
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
// them; they still show up under "all", same as before this existed. The actual
// filtering happens inside RouteDayView (see its statusFilter prop) rather than here --
// filtering the list before it reaches that component would also hide stops from its GPS
// auto-arrival watcher, which must always see the full day regardless of what's displayed.
const STATUS_FILTERS = ["all", "completed", "in_progress", "pending"] as const;
type StatusFilterValue = (typeof STATUS_FILTERS)[number];

export default async function SchedulePage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const spPromise: NonNullable<PageProps["searchParams"]> = searchParams ?? Promise.resolve({});
  if (appUser.role === "ADMIN") {
    return <AdminSchedule appUser={appUser} searchParams={spPromise} />;
  }
  // This tabbed schedule view is built for a technician's day-to-day use. Office keeps
  // using the dense dashboard at /dashboard for now (the admin gating above is consistent
  // with every other admin-only nav item — see side-nav.tsx).
  if (appUser.role !== "TECHNICIAN") redirect("/dashboard");

  const sp = (await spPromise) ?? {};
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
  const isPastDay = selectedYmd < todayYmd;

  function tabHref(t: Tab) {
    const params = new URLSearchParams();
    params.set("tab", t);
    if (sp.date) params.set("date", sp.date);
    return `/dashboard/schedule?${params.toString()}`;
  }
  function dayHref(ymd: string) {
    const params = new URLSearchParams();
    params.set("tab", tab === "week" ? "day" : tab);
    params.set("date", ymd);
    return `/dashboard/schedule?${params.toString()}`;
  }
  // Deliberately doesn't preserve `status` -- a filter carried over to a newly-navigated
  // day could silently show "no stops" with no visible reason (e.g. yesterday's
  // "Completed" filter applied to a day nothing's finished yet). Toggling a stat tile is a
  // same-page action; changing tab/date resets to the unfiltered view.
  function statusHref(s: StatusFilterValue) {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (sp.date) params.set("date", sp.date);
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
      where: { technicianId: appUser.id, scheduledStart: { gte: weekStart, lt: weekEnd } },
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

  // Unlike the admin dashboard's route list (which hides COMPLETED to keep "what's left
  // today" focused), this schedule view intentionally shows the full day — completed,
  // in-progress, pending, and skipped — matching the reference layout.
  const dayVisits =
    tab === "week"
      ? []
      : await prisma.serviceVisit.findMany({
          where: { technicianId: appUser.id, scheduledStart: { gte: startOfDay, lte: endOfDay } },
          orderBy: [{ routeSequence: "asc" }, { scheduledStart: "asc" }],
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            startedAt: true,
            property: {
              select: { id: true, name: true, addressLine1: true, city: true, region: true, latitude: true, longitude: true },
            },
            bodyOfWater: { select: { name: true } },
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
  }));

  const [adHocStops, adHocProperties] = await Promise.all([
    tab === "week"
      ? Promise.resolve([])
      : prisma.adHocStop.findMany({
          where: { organizationId: appUser.organizationId, technicianId: appUser.id, scheduledDate: { gte: startOfDay, lte: endOfDay } },
          orderBy: [{ completed: "asc" }, { createdAt: "asc" }],
          select: { id: true, description: true, completed: true, property: { select: { name: true } } },
        }),
    tab === "week"
      ? Promise.resolve([])
      : prisma.property.findMany({ where: { organizationId: appUser.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Always computed from the full, unfiltered day -- the tile counts must stay stable
  // regardless of which filter is currently active (same convention as an inbox's unread
  // badge not changing depending on which folder is open).
  const stats = {
    total: routeStops.length,
    completed: routeStops.filter((v) => v.status === "COMPLETED").length,
    inProgress: routeStops.filter((v) => v.status === "IN_PROGRESS").length,
    pending: routeStops.filter((v) => v.status === "SCHEDULED").length,
    skipped: routeStops.filter((v) => v.status === "CANCELLED").length,
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="bg-brand-ink px-4 pb-4 pt-6">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-white">Schedule</h1>

        <div data-tour="schedule-tabs" className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-white/10 p-1">
          {TABS.map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={`rounded-md py-1.5 text-center text-xs font-semibold uppercase tracking-wide ${
                tab === t ? "bg-brand-primary text-white" : "text-brand-border"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>

        {tab !== "week" ? (
          <div className="mt-4 flex items-center justify-between text-white">
            <Link href={dayHref(toYmd(prevDate))} className="rounded px-2 py-1 text-lg" aria-label="Previous day">
              ‹
            </Link>
            <p className="text-sm font-medium">
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
            <Link href={dayHref(toYmd(nextDate))} className="rounded px-2 py-1 text-lg" aria-label="Next day">
              ›
            </Link>
          </div>
        ) : null}

        {tab !== "week" ? (
          <div data-tour="schedule-stat-tiles" className="mt-4 grid grid-cols-4 gap-2 rounded-lg bg-white/5 p-3 text-center text-white">
            <Link href={statusHref("all")} className={statTileClass(statusFilter === "all")}>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold">{stats.total}</p>
              <p className="text-[10px] uppercase tracking-wide text-brand-border">Total Jobs</p>
            </Link>
            <Link href={statusHref("completed")} className={statTileClass(statusFilter === "completed")}>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-brand-okFill">{stats.completed}</p>
              <p className="text-[10px] uppercase tracking-wide text-brand-border">Completed</p>
            </Link>
            <Link href={statusHref("in_progress")} className={statTileClass(statusFilter === "in_progress")}>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">{stats.inProgress}</p>
              <p className="text-[10px] uppercase tracking-wide text-brand-border">In Progress</p>
            </Link>
            <Link href={statusHref("pending")} className={statTileClass(statusFilter === "pending")}>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-brand-warnFill">{stats.pending}</p>
              <p className="text-[10px] uppercase tracking-wide text-brand-border">Pending</p>
            </Link>
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
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  d.ymd === todayYmd ? "border-brand-primary bg-brand-foam" : "border-brand-border bg-white"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-brand-ink">{d.label}</p>
                  <p className="text-xs text-brand-muted">{new Date(`${d.ymd}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                </div>
                <div className="flex gap-3 text-right text-xs">
                  <span className="text-brand-ink">
                    <span className="font-semibold">{d.total}</span> jobs
                  </span>
                  <span className="text-brand-ok">
                    <span className="font-semibold">{d.completed}</span> done
                  </span>
                  {d.skipped > 0 ? (
                    <span className="text-brand-danger">
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
              // Reordering a filtered subset doesn't have coherent semantics against the
              // day's real underlying sequence (the API persists 0..N-1 across whatever
              // list it's given -- doing that against a partial view would scramble the
              // full day's order). Same reasoning as the existing multi-tech read-only
              // gate, applied to status filtering.
              readOnly={isPastDay || statusFilter !== "all"}
              isToday={isToday}
              dateYmd={selectedYmd}
              layout={tab === "map" ? "mapOnly" : tab === "list" ? "listOnly" : "both"}
            />

            {tab !== "map" ? (
              <div data-tour="schedule-extra-stops" className="app-card mt-4">
                <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-brand-primary">Extra stops</p>
                {adHocStops.length === 0 ? (
                  <p className="mt-2 text-sm text-brand-muted">No extra stops for this day.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {adHocStops.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm">
                        <span className={s.completed ? "text-brand-muted line-through" : "text-brand-ink"}>
                          {s.description}
                          {s.property ? ` — ${s.property.name}` : ""}
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
                <form id="add-stop-form" action={addAdHocStop} className="mt-3 flex flex-wrap items-center gap-2 rounded border border-brand-border bg-brand-foam p-2">
                  <input type="hidden" name="scheduledDate" value={selectedYmd} />
                  <input
                    name="description"
                    required
                    placeholder="e.g. Pool store, drop off filter…"
                    className="min-w-[180px] flex-1 rounded border border-brand-control bg-white px-2 py-1.5 text-sm"
                  />
                  <select name="propertyId" defaultValue="" className="rounded border border-brand-control bg-white px-2 py-1.5 text-sm">
                    <option value="">No property</option>
                    {adHocProperties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
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
