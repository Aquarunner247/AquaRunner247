import Link from "next/link";

type WeekRoute = {
  id: string;
  dayOfWeek: number | null;
  frequency: string;
  technicianLabel: string | null;
  stopCount: number;
  maxCapacity: number | null;
  /** Plain-language service window, or null when the route is unbounded both ways. */
  windowLabel: string | null;
  /** True when today falls outside the window, so the route generates nothing right now. */
  outsideWindow: boolean;
};

type Props = {
  routes: WeekRoute[];
  dayNames: string[];
  /** Carried into each day's "edit" link so drilling in keeps the technician filter. */
  technicianParam: string;
};

/**
 * Week-grid overview of the recurring route template -- seven day columns rather than the
 * flat list of every route in the org, which is unreadable once a few techs each have five
 * days. Read-only on purpose: editing stays in the list view, and each day header links
 * there pre-filtered to that day. Recurring routes have no dates, so a weekday grid is the
 * calendar here; dated visits generated from these routes live on /dashboard/schedule.
 */
export function RouteWeekView({ routes, dayNames, technicianParam }: Props) {
  const days = [1, 2, 3, 4, 5, 6, 7];

  function editHref(day: number) {
    const params = new URLSearchParams({ view: "list", day: String(day) });
    if (technicianParam) params.set("tech", technicianParam);
    return `/dashboard/routes?${params.toString()}`;
  }

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const dayRoutes = routes.filter((r) => (r.dayOfWeek ?? 0) === day);
        const dayStops = dayRoutes.reduce((sum, r) => sum + r.stopCount, 0);

        return (
          <section key={day} className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-soft">
            <Link
              href={editHref(day)}
              className="flex min-h-[44px] items-center justify-between gap-2 bg-brand-anchor px-3 py-2.5 text-white transition hover:bg-brand-primaryHover"
            >
              <span className="font-display text-sm font-semibold">{dayNames[day]}</span>
              {dayStops > 0 ? <span className="app-metric text-xs text-white/80">{dayStops}</span> : null}
            </Link>

            <div className="space-y-2 p-2">
              {dayRoutes.length === 0 ? (
                <p className="px-1 py-2 text-xs text-brand-muted">No routes</p>
              ) : (
                dayRoutes.map((route) => {
                  const overCapacity = route.maxCapacity != null && route.stopCount > route.maxCapacity;
                  return (
                    <Link
                      key={route.id}
                      href={editHref(day)}
                      className={`block min-h-[44px] rounded-xl border bg-white px-2.5 py-2 transition hover:border-brand-primary ${
                        route.outsideWindow ? "border-dashed border-brand-control" : "border-brand-border/70"
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-brand-ink">
                        {route.technicianLabel ?? "Unassigned"}
                      </p>
                      {route.windowLabel ? (
                        <p className="mt-0.5 truncate text-xs text-brand-muted" title={route.windowLabel}>
                          {route.outsideWindow ? "Not running · " : ""}
                          {route.windowLabel}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {/* Neutral pill, not a status one: ok/warn/danger are reserved for
                            water-reading results. Over-capacity gets coral, matching the
                            WaveProgress tone the list view already uses for it. */}
                        <span className="app-pill-active">
                          <span className="app-metric">
                            {route.stopCount}
                            {route.maxCapacity != null ? `/${route.maxCapacity}` : ""}
                          </span>
                          <span>stops</span>
                        </span>
                        {overCapacity ? <span className="text-xs font-semibold text-brand-cta">Over limit</span> : null}
                        {route.frequency !== "WEEKLY" ? (
                          <span className="app-badge" title="Stored frequency. Routes run every matching weekday regardless.">
                            {route.frequency} (runs weekly)
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
