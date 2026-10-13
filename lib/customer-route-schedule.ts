import { WEEKDAY_LABELS } from "@/lib/service-weekdays";

/**
 * How a body of water's recurring schedule reads on the customer page.
 *
 * It used to read as one day. The page kept a Map<bodyId, ScheduleInfo> and `.set()` it once per
 * recurring stop, so the last route processed overwrote every earlier one -- and most bodies here
 * are on several. Tailgate Beach Club is serviced five days a week and the page showed one of them.
 *
 * Pure so the grouping and the wording can be tested without a page render.
 */

export type RouteScheduleEntry = {
  routeName: string;
  technicianName: string | null;
  /** ISO weekday, 1 = Monday .. 7 = Sunday. Null when the route has no day set. */
  dayOfWeek: number | null;
};

/** Mon, Tue, ... -- short, because up to seven of them sit on one line. */
function shortDay(dayOfWeek: number): string {
  return WEEKDAY_LABELS[dayOfWeek]?.slice(0, 3) ?? `Day ${dayOfWeek}`;
}

/**
 * "Mon, Wed, Fri · Rodrigo Acevedo", or "Mon (Rodrigo), Sun (Steve)" when the days are not all the
 * same technician's.
 *
 * Route name is deliberately dropped when a day is known: every route here is named after its own
 * day, so "Friday · Fri" was saying it twice. A route with no weekday falls back to its name, which
 * is then the only thing identifying it.
 */
export function formatRouteSchedule(entries: readonly RouteScheduleEntry[]): string {
  if (entries.length === 0) return "";

  // One line per day, not per stop: a property-wide stop and a body-specific stop on the same day
  // are the same visit to a customer reading this.
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const key = `${e.dayOfWeek ?? `route:${e.routeName}`}|${e.technicianName ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sorted = [...unique].sort((a, b) => {
    // Days in week order; anything without a day goes last, then alphabetically by route.
    if (a.dayOfWeek == null && b.dayOfWeek == null) return a.routeName.localeCompare(b.routeName);
    if (a.dayOfWeek == null) return 1;
    if (b.dayOfWeek == null) return -1;
    return a.dayOfWeek - b.dayOfWeek;
  });

  const sharedTechnician = new Set(sorted.map((e) => e.technicianName ?? "")).size === 1 ? sorted[0].technicianName : null;
  const labelOf = (e: RouteScheduleEntry) => (e.dayOfWeek != null ? shortDay(e.dayOfWeek) : e.routeName);

  if (sharedTechnician) return `${sorted.map(labelOf).join(", ")} · ${sharedTechnician}`;

  // Grouped by technician rather than repeated after every day: Tailgate Beach Club is Rich four
  // days and Steve on Sunday, which read as "Mon (Rich), Thu (Rich), Fri (Rich), Sat (Rich),
  // Sun (Steve)" before this. Groups keep week order by their earliest day.
  const byTechnician = new Map<string, RouteScheduleEntry[]>();
  for (const e of sorted) {
    const key = e.technicianName ?? "";
    byTechnician.set(key, [...(byTechnician.get(key) ?? []), e]);
  }
  return [...byTechnician.entries()]
    .map(([technician, group]) => {
      const days = group.map(labelOf).join(", ");
      return technician ? `${days} (${technician})` : days;
    })
    .join(" · ");
}
