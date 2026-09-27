"use client";

type Props = {
  /** Every technician who can own a route, plus any inactive one who still owns one --
   * otherwise their routes would be reachable only by clearing the filter. */
  technicians: { id: string; label: string }[];
  dayOptions: { value: string; label: string }[];
  selectedTechnicianId: string;
  selectedDay: string;
  /** Rendered only while a filter is on, so the page doesn't nag about "15 of 15". */
  matchCount: number;
  totalCount: number;
};

/**
 * Auto-submitting GET form for the Routes page's technician/day filter -- same pattern as
 * the admin Schedule tab's TechnicianFilterSelect (a plain GET form, no client state),
 * kept local to this page since the hidden-field set and target differ.
 *
 * Filtering happens on the server off ?tech/?day, so a filtered page mounts only the
 * matching routes' stop maps rather than one Leaflet instance per route in the org.
 */
export function RouteFilters({ technicians, dayOptions, selectedTechnicianId, selectedDay, matchCount, totalCount }: Props) {
  const filtered = selectedTechnicianId !== "" || selectedDay !== "";

  return (
    <form action="/dashboard/routes" method="GET" className="app-card mt-6 flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="routes-filter-tech" className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
          Technician
        </label>
        <select
          id="routes-filter-tech"
          name="tech"
          defaultValue={selectedTechnicianId}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="app-field w-auto"
        >
          <option value="">All technicians</option>
          <option value="unassigned">Unassigned</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="routes-filter-day" className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
          Day
        </label>
        <select
          id="routes-filter-day"
          name="day"
          defaultValue={selectedDay}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="app-field w-auto"
        >
          <option value="">All days</option>
          {dayOptions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {/* Keyboard/no-JS path: the selects auto-submit on change, this makes the form
          usable without that firing. */}
      <noscript>
        <button type="submit" className="app-btn-secondary-sm">
          Apply
        </button>
      </noscript>

      {filtered ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-brand-muted">
            Showing {matchCount} of {totalCount} routes
          </span>
          <a href="/dashboard/routes" className="app-link text-sm">
            Clear
          </a>
        </div>
      ) : null}
    </form>
  );
}
