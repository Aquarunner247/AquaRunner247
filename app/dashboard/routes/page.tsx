import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrganizationRuleset, requiresMultipleDailyVisits } from "@/lib/compliance";
import { timeZoneForState, ymdInTimeZone } from "@/lib/timezone";
import { coalesceCoord } from "@/lib/geocode";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { InlineAssignSelect } from "@/app/components/inline-assign-select";
import { WaveProgress } from "@/app/components/wave-progress";
import { RouteStopsList } from "./route-stops-list";
import { resolveRouteEndpoints } from "@/lib/route-endpoints";
import { RouteFilters } from "./route-filters";
import { RouteWeekView } from "./route-week-view";
import {
  createRoute,
  deleteRoute,
  addRouteStop,
  geocodeAllProperties,
  updateRouteTechnician,
  updateRouteCapacity,
  updateRouteWindow,
  duplicateRoute,
} from "./actions";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** startsOn/endsOn are @db.Date, so they come back as UTC midnight of the calendar date
 * that was stored. Both formatting and comparison therefore happen in UTC -- rendering
 * them in the org's zone would show the previous day for any zone behind UTC. */
function ymdFromDateColumn(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDateColumn(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Plain-language service window, e.g. "Runs Mar 3 – Oct 12", "Runs from Mar 3", "Runs until
 * Oct 12", or null when the route is unbounded in both directions (the common case, where
 * saying "runs always" would just be noise). */
function describeWindow(startsOn: Date | null, endsOn: Date | null): string | null {
  if (startsOn && endsOn) return `Runs ${formatDateColumn(startsOn)} – ${formatDateColumn(endsOn)}`;
  if (startsOn) return `Runs from ${formatDateColumn(startsOn)}`;
  if (endsOn) return `Runs until ${formatDateColumn(endsOn)}`;
  return null;
}

type PageProps = {
  searchParams?: Promise<{ tech?: string; day?: string; view?: string }>;
};

export default async function RoutesPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({
    where: { organizationId: appUser.organizationId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  const propertiesMissingCoordinates = await prisma.property.findMany({
    where: { organizationId: appUser.organizationId, OR: [{ latitude: null }, { longitude: null }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      addressLine1: true,
      city: true,
      region: true,
      customer: { select: { name: true } },
    },
  });

  // Bodies of water that are ON a route but have no pin of their own. Scoped to routed venues
  // deliberately: an unrouted body isn't being driven to, so nagging about it is noise. Mirrors
  // propertiesMissingCoordinates above -- same problem one level down.
  const bodiesMissingPin = await prisma.bodyOfWater.findMany({
    where: {
      property: { organizationId: appUser.organizationId },
      OR: [{ latitude: null }, { longitude: null }],
      recurringStops: { some: {} },
    },
    orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      property: {
        select: {
          id: true,
          name: true,
          customerId: true,
          latitude: true,
          addressLine1: true,
          city: true,
          region: true,
        },
      },
      // The locate page is nested under a customer (/dashboard/customers/[id]/bodies/[bodyId]),
      // and Property.customerId is nullable (onDelete: SetNull), so a customer-less property has
      // no reachable URL. Those are excluded below rather than linked to /customers/null/...
    },
  });

  const routes = await prisma.recurringRoute.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: [{ dayOfWeek: "asc" }, { createdAt: "desc" }],
    include: {
      // The technician's own start/end defaults come along so resolveRouteEndpoints can fall
      // back to them without a second query per route.
      technician: {
        select: {
          id: true,
          name: true,
          email: true,
          startLatitude: true,
          startLongitude: true,
          startAddress: true,
          endLatitude: true,
          endLongitude: true,
          endAddress: true,
        },
      },
      stops: {
        orderBy: { sortOrder: "asc" },
        include: {
          property: { select: { name: true, latitude: true, longitude: true } },
          // Same "prefer the venue's own pin" rule the schedule pages use, so the route
          // builder's map puts a stop on the actual pool rather than the property centre.
          bodyOfWater: { select: { name: true, type: true, latitude: true, longitude: true } },
        },
      },
    },
  });

  // Resolved once per route: the override -> technician default -> none chain lives in
  // lib/route-endpoints.ts, and both "Optimize stop order" buttons and the per-route summary
  // below read it from here rather than re-deriving it.
  const routeEndpoints = new Map(
    routes.map((route) => [route.id, resolveRouteEndpoints({ route, technician: route.technician })]),
  );

  const allBodiesOfWater = await prisma.bodyOfWater.findMany({
    where: { property: { organizationId: appUser.organizationId } },
    orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
    include: { property: { select: { name: true } } },
  });

  // A body of water already on ANY route for a given weekday (this route or another)
  // shouldn't be offered again for that same weekday — a property can't be regularly
  // serviced twice in one day. Ad-hoc "Extra stops" are a separate system entirely
  // (not tied to RecurringStop/weekday routes) and are deliberately unaffected by this,
  // since those exist specifically for same-day repairs/one-offs.
  //
  // That assumption doesn't hold for states requiring sub-daily testing (Rhode Island
  // every 2 hours, Georgia 3x/day, etc.) — a property there legitimately needs more than
  // one same-day visit. requiresMultipleDailyVisits reads this org's own compliance
  // frequency data to decide whether to skip the exclusion entirely, rather than hardcode
  // an exception list of states.
  const orgRuleset = await getOrganizationRuleset(appUser.organizationId);
  const allowMultipleDailyVisits = requiresMultipleDailyVisits(orgRuleset);

  // "Is this route running today" is judged against the org's own local date, not the
  // server's -- same reason ensureVisitsGeneratedForDate takes an org-resolved ymd.
  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { state: true },
  });
  const todayUtcMidnight = new Date(`${ymdInTimeZone(new Date(), timeZoneForState(org?.state))}T00:00:00.000Z`);

  const scheduledBodyIdsByDay = new Map<number, Set<string>>();
  for (const route of routes) {
    const day = route.dayOfWeek ?? 0;
    const set = scheduledBodyIdsByDay.get(day) ?? new Set<string>();
    for (const stop of route.stops) {
      if (stop.bodyOfWaterId) set.add(stop.bodyOfWaterId);
    }
    scheduledBodyIdsByDay.set(day, set);
  }

  const availableBodiesByRoute = new Map<string, typeof allBodiesOfWater>();
  for (const route of routes) {
    if (allowMultipleDailyVisits) {
      availableBodiesByRoute.set(route.id, allBodiesOfWater);
      continue;
    }
    const scheduledIds = scheduledBodyIdsByDay.get(route.dayOfWeek ?? 0) ?? new Set<string>();
    availableBodiesByRoute.set(
      route.id,
      allBodiesOfWater.filter((b) => !scheduledIds.has(b.id)),
    );
  }

  // Filtering is applied for *rendering only* -- scheduledBodyIdsByDay and
  // availableBodiesByRoute above are deliberately built from every route in the org, since
  // the "already on a route this weekday" exclusion has to account for routes the current
  // filter is hiding. Narrowing those to the visible set would start offering a venue
  // that's already scheduled that day on someone else's route.
  const technicianFilter = (sp.tech ?? "").trim();
  const dayFilterRaw = (sp.day ?? "").trim();
  const dayFilter = /^[1-7]$/.test(dayFilterRaw) ? Number(dayFilterRaw) : null;
  const view = sp.view === "week" ? "week" : "list";

  const visibleRoutes = routes.filter((route) => {
    if (dayFilter != null && (route.dayOfWeek ?? 0) !== dayFilter) return false;
    if (technicianFilter === "unassigned") return route.technicianId == null;
    if (technicianFilter !== "") return route.technicianId === technicianFilter;
    return true;
  });

  // Include any technician who owns a route but isn't in the active-user list, so their
  // routes stay reachable from the filter instead of only via "All technicians".
  const technicianOptions = [
    ...users.map((u) => ({ id: u.id, label: u.name ?? u.email })),
    ...routes
      .filter((r) => r.technician && !users.some((u) => u.id === r.technician!.id))
      .map((r) => ({ id: r.technician!.id, label: `${r.technician!.name ?? r.technician!.email} (inactive)` })),
  ].filter((option, i, all) => all.findIndex((o) => o.id === option.id) === i);

  const linkableBodiesMissingPin = bodiesMissingPin.filter(
    (b): b is (typeof bodiesMissingPin)[number] & { property: { customerId: string } } => b.property.customerId != null,
  );

  const dayOptions = DAY_NAMES.slice(1).map((label, i) => ({ value: String(i + 1), label }));

  const viewHref = (nextView: "week" | "list") => {
    const params = new URLSearchParams();
    if (nextView === "week") params.set("view", "week");
    if (technicianFilter) params.set("tech", technicianFilter);
    if (dayFilter != null) params.set("day", String(dayFilter));
    const qs = params.toString();
    return qs ? `/dashboard/routes?${qs}` : "/dashboard/routes";
  };

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Weekly routes</h1>
        <p className="app-subhead">Assign technicians to weekly routes and add stops.</p>
        <form action={geocodeAllProperties} data-tour="routes-geocode" className="mt-3">
          <button type="submit" className="app-btn-secondary-sm">
            Geocode property addresses (for map view)
          </button>
          <p className="mt-1.5 text-xs text-brand-muted">
            One-time setup so technicians see stops on a map. Uses free OpenStreetMap lookup — safe to re-run anytime, it skips properties that already have coordinates.
          </p>
        </form>
      </header>

      {propertiesMissingCoordinates.length > 0 ? (
        <section data-tour="routes-missing-coords" className="app-card mt-6 border-l-4 border-l-brand-warn">
          <p className="text-sm font-semibold text-brand-ink">
            {propertiesMissingCoordinates.length} propert{propertiesMissingCoordinates.length === 1 ? "y" : "ies"} missing map coordinates
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            The bulk geocode button above guesses from the street address, which can land on the wrong side of a large
            property. Click one below to see it on a satellite map and drop the pin exactly on the pool.
          </p>
          <ul className="mt-3 divide-y divide-brand-border">
            {propertiesMissingCoordinates.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate text-brand-ink">
                  <span className="font-medium">{p.name}</span>
                  {p.customer?.name ? <span className="text-brand-muted"> — {p.customer.name}</span> : null}
                  <span className="text-brand-muted"> · {[p.addressLine1, p.city, p.region].filter(Boolean).join(", ") || "No address on file"}</span>
                </span>
                <Link href={`/dashboard/routes/locate/${p.id}`} className="app-btn-secondary-sm shrink-0">
                  Set on map →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {linkableBodiesMissingPin.length > 0 ? (
        <section data-tour="routes-missing-pins" className="app-card mt-6 border-l-4 border-l-brand-primary">
          <p className="text-sm font-semibold text-brand-ink">
            {linkableBodiesMissingPin.length} aquatic venue{linkableBodiesMissingPin.length === 1 ? "" : "s"} without its own map pin
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            These fall back to their property&rsquo;s single location, which every venue there shares — so a front pool and
            a back pool look like the same place. Pin each one on satellite imagery to fix that. Optional, and routing
            works without it.
          </p>
          <ul className="mt-3 divide-y divide-brand-border">
            {linkableBodiesMissingPin.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-brand-ink">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-brand-muted"> — {b.property.name}</span>
                  </span>
                  <span className="block truncate text-xs text-brand-muted">
                    {[b.property.addressLine1, b.property.city, b.property.region].filter(Boolean).join(", ") ||
                      "No address on file"}
                    {b.property.latitude == null ? (
                      <span className="text-brand-warn"> · property has no location either</span>
                    ) : null}
                  </span>
                </span>
                <Link
                  href={`/dashboard/customers/${b.property.customerId}/bodies/${b.id}/locate?returnTo=routes`}
                  className="app-btn-secondary-sm shrink-0"
                >
                  Set on map →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div data-tour="routes-view-toggle" className="app-tabs mt-6">
        <Link href={viewHref("list")} className={view === "list" ? "app-tab-active" : "app-tab"}>
          List
        </Link>
        <Link href={viewHref("week")} className={view === "week" ? "app-tab-active" : "app-tab"}>
          Week
        </Link>
      </div>

      <RouteFilters
        technicians={technicianOptions}
        dayOptions={dayOptions}
        selectedTechnicianId={technicianFilter}
        selectedDay={dayFilter != null ? String(dayFilter) : ""}
        matchCount={visibleRoutes.length}
        totalCount={routes.length}
      />

      <form action={createRoute} data-tour="routes-add-form" className="app-card mt-6">
        <p className="text-sm font-semibold text-brand-ink">Add route</p>
        {/* No frequency control: BIWEEKLY/CUSTOM were inert -- visit generation ignores
            RecurringRoute.frequency and runs every matching weekday -- so the dropdown
            promised a cadence the app never delivered. createRoute still defaults the
            column to WEEKLY, and routes already holding another value keep it. */}
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <select name="dayOfWeek" required defaultValue="1" className="app-field">
            {DAY_NAMES.slice(1).map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
          <select name="technicianId" defaultValue="" className="app-field">
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <label htmlFor="new-route-starts-on" className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              Starting on
            </label>
            <input id="new-route-starts-on" name="startsOn" type="date" className="app-field mt-1" />
          </div>
          <div>
            <label htmlFor="new-route-ends-on" className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              Ending on
            </label>
            <input id="new-route-ends-on" name="endsOn" type="date" className="app-field mt-1" />
            <p className="mt-1 text-xs text-brand-muted">Leave blank to never end.</p>
          </div>
        </div>
        <button className="app-btn-primary-sm mt-3" type="submit">
          Add route
        </button>
      </form>

      {view === "week" ? (
        <RouteWeekView
          routes={visibleRoutes.map((route) => ({
            id: route.id,
            dayOfWeek: route.dayOfWeek,
            frequency: route.frequency,
            technicianLabel: route.technician ? (route.technician.name ?? route.technician.email) : null,
            stopCount: route.stops.length,
            maxCapacity: route.maxCapacity,
            windowLabel: describeWindow(route.startsOn, route.endsOn),
            outsideWindow:
              (route.startsOn != null && route.startsOn > todayUtcMidnight) ||
              (route.endsOn != null && route.endsOn < todayUtcMidnight),
          }))}
          dayNames={DAY_NAMES}
          technicianParam={technicianFilter}
        />
      ) : null}

      {view === "list" ? (
        <section className="mt-6 space-y-5">
          {visibleRoutes.map((route) => {
            const notYetStarted = route.startsOn != null && route.startsOn > todayUtcMidnight;
            const alreadyEnded = route.endsOn != null && route.endsOn < todayUtcMidnight;
            const windowLabel = describeWindow(route.startsOn, route.endsOn);

            return (
            <div
              key={route.id}
              data-tour={route.id === visibleRoutes[0]?.id ? "routes-stop-list" : undefined}
              className="app-card-muted app-card-hover border-l-4 border-l-brand-primary"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border/70 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold text-brand-ink">{DAY_NAMES[route.dayOfWeek ?? 0]}</h2>
                  <span
                    className="app-badge"
                    title={
                      route.frequency === "WEEKLY"
                        ? undefined
                        : `Stored as ${route.frequency}, but this route still runs every ${DAY_NAMES[route.dayOfWeek ?? 0]} — visit generation doesn't read frequency.`
                    }
                  >
                    {route.frequency === "WEEKLY" ? route.frequency : `${route.frequency} (runs weekly)`}
                  </span>
                  {notYetStarted ? (
                    <span className="app-badge" title={windowLabel ?? undefined}>
                      Not started yet
                    </span>
                  ) : alreadyEnded ? (
                    <span className="app-badge" title={windowLabel ?? undefined}>
                      Ended
                    </span>
                  ) : null}
                  <form action={updateRouteTechnician}>
                    <input type="hidden" name="routeId" value={route.id} />
                    <InlineAssignSelect
                      name="technicianId"
                      defaultValue={route.technician?.id ?? ""}
                      emptyLabel="Unassigned"
                      options={
                        route.technician && !users.some((u) => u.id === route.technician!.id)
                          ? [{ value: route.technician.id, label: `${route.technician.name ?? route.technician.email} (inactive)` }, ...users.map((u) => ({ value: u.id, label: u.name ?? u.email }))]
                          : users.map((u) => ({ value: u.id, label: u.name ?? u.email }))
                      }
                    />
                  </form>
                  <span className="app-badge" title="Stop count used for Smart Route Placement suggestions">
                    {route.stops.length}
                    {route.maxCapacity != null ? `/${route.maxCapacity}` : ""} stops
                  </span>
                  <form
                    action={updateRouteCapacity}
                    data-tour={route.id === visibleRoutes[0]?.id ? "routes-capacity" : undefined}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="routeId" value={route.id} />
                    <input
                      name="maxCapacity"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={route.maxCapacity ?? ""}
                      placeholder="No limit"
                      className="app-field w-24 py-1 text-xs"
                    />
                    <button type="submit" className="app-btn-secondary-sm">
                      Save
                    </button>
                  </form>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={duplicateRoute} className="flex items-center gap-1.5">
                    <input type="hidden" name="routeId" value={route.id} />
                    <select name="targetDayOfWeek" required defaultValue="" className="app-field w-auto py-1 text-xs">
                      <option value="" disabled>
                        Duplicate to…
                      </option>
                      {DAY_NAMES.slice(1).map((d, i) => (
                        <option key={d} value={i + 1}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="app-btn-secondary-sm">
                      Duplicate
                    </button>
                  </form>
                  <form action={deleteRoute} data-tour={route.id === visibleRoutes[0]?.id ? "routes-delete" : undefined}>
                    <input type="hidden" name="routeId" value={route.id} />
                    <ConfirmSubmitButton
                      label="Delete route"
                      confirmMessage="Delete this route and all its stops?"
                      className="app-btn-danger-sm"
                    />
                  </form>
                </div>
              </div>

              <form action={updateRouteWindow} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="routeId" value={route.id} />
                <div>
                  <label
                    htmlFor={`starts-on-${route.id}`}
                    className="text-xs font-semibold uppercase tracking-wide text-brand-muted"
                  >
                    Starting on
                  </label>
                  <input
                    id={`starts-on-${route.id}`}
                    name="startsOn"
                    type="date"
                    defaultValue={ymdFromDateColumn(route.startsOn)}
                    className="app-field mt-1 w-auto"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`ends-on-${route.id}`}
                    className="text-xs font-semibold uppercase tracking-wide text-brand-muted"
                  >
                    Ending on
                  </label>
                  <input
                    id={`ends-on-${route.id}`}
                    name="endsOn"
                    type="date"
                    defaultValue={ymdFromDateColumn(route.endsOn)}
                    placeholder="Never"
                    className="app-field mt-1 w-auto"
                  />
                </div>
                <button type="submit" className="app-btn-secondary-sm">
                  Save dates
                </button>
                <span className="text-xs text-brand-muted">
                  {windowLabel ?? "Runs every week, no end date"}
                </span>
              </form>

              {route.maxCapacity != null ? (
                <div className="mt-3">
                  <WaveProgress
                    percent={(route.stops.length / route.maxCapacity) * 100}
                    label="Route capacity"
                    sublabel={`${route.stops.length}/${route.maxCapacity} stops`}
                    tone={route.stops.length > route.maxCapacity ? "coral" : "teal"}
                  />
                </div>
              ) : null}

              {/* Where this day begins and ends, and whether that comes from the route or the
                  technician. Stated rather than left implicit, because "Optimize stop order"
                  below silently depends on it. */}
              <div className="app-card-inset mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {(["start", "end"] as const).map((which) => {
                  const resolved = routeEndpoints.get(route.id);
                  const point = which === "start" ? resolved?.start : resolved?.end;
                  const overridden =
                    which === "start" ? route.startLatitude != null : route.endLatitude != null;
                  return (
                    <span key={which} className="flex items-center gap-1.5">
                      <span className="font-semibold uppercase tracking-wide text-brand-icon">
                        {which === "start" ? "Starts" : "Ends"}
                      </span>
                      <span className="text-brand-ink">
                        {point
                          ? point.label || "a set point"
                          : which === "start"
                            ? "first stop"
                            : "back at the start"}
                      </span>
                      {overridden ? <span className="app-pill-attention">this day only</span> : null}
                      <Link href={`/dashboard/routes/${route.id}/location/${which}`} className="app-link">
                        {overridden ? "change" : "set for this day"}
                      </Link>
                    </span>
                  );
                })}
              </div>

              <form action={addRouteStop} className="app-card-inset mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="routeId" value={route.id} />
                {(availableBodiesByRoute.get(route.id) ?? []).length === 0 ? (
                  <p className="text-sm text-brand-muted">
                    Every aquatic venue is already on a {DAY_NAMES[route.dayOfWeek ?? 0]} route. Use &ldquo;Extra stops&rdquo; on the
                    technician&rsquo;s dashboard for one-off same-day repairs.
                  </p>
                ) : (
                  <>
                    <select name="bodyOfWaterId" required className="app-field w-auto">
                      <option value="">Select aquatic venue…</option>
                      {(availableBodiesByRoute.get(route.id) ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.property.name} — {b.name}
                        </option>
                      ))}
                    </select>
                    <input
                      name="etaOffsetMinutes"
                      type="number"
                      step="1"
                      placeholder="ETA offset (min)"
                      className="app-field w-40"
                    />
                    <button type="submit" className="app-btn-primary-sm">
                      Add stop
                    </button>
                  </>
                )}
              </form>

              <RouteStopsList
                routeId={route.id}
                stops={route.stops.map((stop) => ({
                  id: stop.id,
                  propertyId: stop.propertyId,
                  propertyName: stop.property.name,
                  bodyName: stop.bodyOfWater?.name ?? null,
                  bodyType: stop.bodyOfWater?.type ?? null,
                  etaOffsetMinutes: stop.etaOffsetMinutes,
                  latitude: coalesceCoord(stop.bodyOfWater?.latitude, stop.property.latitude),
                  longitude: coalesceCoord(stop.bodyOfWater?.longitude, stop.property.longitude),
                }))}
                startPoint={routeEndpoints.get(route.id)?.start ?? null}
                endPoint={routeEndpoints.get(route.id)?.end ?? null}
              />
            </div>
            );
          })}
          {routes.length === 0 ? (
            <p className="text-sm text-brand-muted">No routes yet — add your first one above.</p>
          ) : visibleRoutes.length === 0 ? (
            <p className="text-sm text-brand-muted">
              No routes match this filter.{" "}
              <Link href="/dashboard/routes" className="app-link">
                Clear it
              </Link>{" "}
              to see all {routes.length}.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
