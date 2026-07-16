import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ensureVisitsGeneratedForDate } from "@/lib/visit-generation";
import { RouteDayView } from "@/app/components/route-day-view";
import { WEEKDAY_LABELS } from "@/lib/service-weekdays";
import { addAdHocStop, toggleAdHocStop, deleteAdHocStop } from "@/app/dashboard/actions";

type PageProps = {
  searchParams?: Promise<{ tab?: string; date?: string }>;
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

export default async function SchedulePage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  // This tabbed schedule view is built for a technician's day-to-day use. Admin/office
  // keep their existing dense dashboard at /dashboard, which already covers this ground
  // (plus technician-switching, org-wide stats, etc.) — untouched by this page.
  if (appUser.role !== "TECHNICIAN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const tab: Tab = TABS.includes((sp.tab ?? "") as Tab) ? ((sp.tab ?? "day") as Tab) : "day";

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

  const stats = {
    total: routeStops.length,
    completed: routeStops.filter((v) => v.status === "COMPLETED").length,
    inProgress: routeStops.filter((v) => v.status === "IN_PROGRESS").length,
    pending: routeStops.filter((v) => v.status === "SCHEDULED").length,
    skipped: routeStops.filter((v) => v.status === "CANCELLED").length,
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="bg-[#12234A] px-4 pb-4 pt-6">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-white">Schedule</h1>

        <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-white/10 p-1">
          {TABS.map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={`rounded-md py-1.5 text-center text-xs font-semibold uppercase tracking-wide ${
                tab === t ? "bg-[#0A5FA4] text-white" : "text-[#A9D3E0]"
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
          <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg bg-white/5 p-3 text-center text-white">
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold">{stats.total}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#A9D3E0]">Total Jobs</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#4ADE80]">{stats.completed}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#A9D3E0]">Completed</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#0A5FA4]">{stats.inProgress}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#A9D3E0]">In Progress</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#FBBF24]">{stats.pending}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#A9D3E0]">Pending</p>
            </div>
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
                  d.ymd === todayYmd ? "border-[#0A5FA4] bg-[#EAF6FA]" : "border-[#C9E3EC] bg-white"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-[#12234A]">{d.label}</p>
                  <p className="text-xs text-[#4A6572]">{new Date(`${d.ymd}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                </div>
                <div className="flex gap-3 text-right text-xs">
                  <span className="text-[#12234A]">
                    <span className="font-semibold">{d.total}</span> jobs
                  </span>
                  <span className="text-[#16A34A]">
                    <span className="font-semibold">{d.completed}</span> done
                  </span>
                  {d.skipped > 0 ? (
                    <span className="text-[#FF6B5B]">
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
              readOnly={isPastDay}
              isToday={isToday}
              dateYmd={selectedYmd}
              layout={tab === "map" ? "mapOnly" : tab === "list" ? "listOnly" : "both"}
            />

            {tab !== "map" ? (
              <div className="mt-4 rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
                <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#0A5FA4]">Extra stops</p>
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
                <form id="add-stop-form" action={addAdHocStop} className="mt-3 flex flex-wrap items-center gap-2 rounded border border-[#C9E3EC] bg-[#EAF6FA] p-2">
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
          </>
        )}
      </div>
    </main>
  );
}
