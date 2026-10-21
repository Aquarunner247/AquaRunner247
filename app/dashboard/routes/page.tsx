import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrganizationRuleset, requiresMultipleDailyVisits } from "@/lib/compliance";
import { timeZoneForState, ymdInTimeZone } from "@/lib/timezone";
import { coalesceCoord } from "@/lib/geocode";
import { countWalkUps } from "@/lib/stop-grouping";
import { nextOccurrenceYmd } from "@/lib/service-weekdays";
import { addAdHocStop } from "@/app/dashboard/actions";
import { AdHocStopDateField } from "@/app/components/adhoc-stop-date-field";
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
  clearRouteLocation,
  saveRouteLocationAsTechnicianDefault,
  duplicateRoute,
} from "./actions";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** startsOn/endsOn are @db.Date, so they come back as UTC midnight of the calendar date
 * that was stored. Both formatting and comparison therefore happen in UTC -- rendering
 * them in the org's zone would show the previous day for any zone behind UTC. */
/** Whether this technician already has a start/end point of their own to fall back to. */
function techHasOwn(
  technician: { startLatitude: unknown; endLatitude: unknown },
  which: "start" | "end",
): boolean {
  return (which === "start" ? technician.startLatitude : technician.endLatitude) != null;
}

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
          bodyOfWater: { select: { name: true, type: true, serviceGroup: true, latitude: true, longitude: true } },
        },
      },
    },
  });

  // Resolved once per route: the override -> technician default -> none chain lives in
  // lib/route-endpoints.ts, and "Optimize stop order" and the per-route summary below read it
  // from here rather than re-deriving it.
  // For the one-off stop form below. Name only -- it is a picker, not a listing.
  /**
   * Venues an unscheduled SERVICE call can be recorded against -- a callout to a pool that is not
   * on that day's route, where chemicals and readings still have to go somewhere. An errand (no
   * venue) can hold none of that; see addAdHocStop.
   */
  const adHocVenues = await prisma.bodyOfWater.findMany({
    where: { property: { organizationId: appUser.organizationId } },
    orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, property: { select: { name: true } } },
  });

  const propertyOptions = await prisma.property.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  /**
   * Stops per route, counted in WALK-UPS. A property's pool and spa serviced on one arrival are one
   * stop, so this matches the cards in the list below and stops a route reading as over capacity
   * for venues the technician never drives between.
   */
  const walkUpCountByRoute = new Map(
    routes.map((route) => [
      route.id,
      countWalkUps(
        route.stops.map((stop) => ({
          id: stop.id,
          propertyId: stop.propertyId,
          latitude: null,
          longitude: null,
          bodyType: stop.bodyOfWater?.type ?? null,
          serviceGroup: stop.bodyOfWater?.serviceGroup ?? null,
        })),
      ),
    ]),
  );

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
  /**
   * This page as the admin currently has it -- technician filter, day filter, view. Carried into
   * every form so the action can send them back to the list they were on rather than the full one.
   */
  const backParams = new URLSearchParams();
  if (sp.tech) backParams.set("tech", sp.tech);
  if (sp.day) backParams.set("day", sp.day);
  if (sp.view) backParams.set("view", sp.view);
  const backTo = backParams.toString() ? `/dashboard/routes?${backParams}` : "/dashboard/routes";

  const todayYmd = ymdInTimeZone(new Date(), timeZoneForState(org?.state));
  const todayUtcMidnight = new Date(`${todayYmd}T00:00:00.000Z`);

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
            stopCount: walkUpCountByRoute.get(route.id) ?? route.stops.length,
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
                    {walkUpCountByRoute.get(route.id) ?? route.stops.length}
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
                    percent={((walkUpCountByRoute.get(route.id) ?? route.stops.length) / route.maxCapacity) * 100}
                    label="Route capacity"
                    sublabel={`${walkUpCountByRoute.get(route.id) ?? route.stops.length}/${route.maxCapacity} stops`}
                    tone={(walkUpCountByRoute.get(route.id) ?? route.stops.length) > route.maxCapacity ? "coral" : "teal"}
                  />
                </div>
              ) : null}

              {/* Where this day begins and ends, and whether that comes from the route or the
                  technician. Stated rather than left implicit, because "Optimize stop order"
                  below silently depends on it.

                  Readable rather than tucked away: this was text-xs inside a quiet inset, and the
                  operator could not find it at all when looking for somewhere to pick a
                  technician's home -- "where is it supposed to be?". The link is now a button with
                  a 44px target and a label that says what it does, rather than "set for this day"
                  in link-sized text among a dense card. */}
              <div className="app-card-inset mt-3 space-y-2">
                {(["start", "end"] as const).map((which) => {
                  const resolved = routeEndpoints.get(route.id);
                  const point = which === "start" ? resolved?.start : resolved?.end;
                  const overridden =
                    which === "start" ? route.startLatitude != null : route.endLatitude != null;
                  return (
                    <div key={which} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                        {which === "start" ? "Starts" : "Ends"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-brand-ink">
                        {point
                          ? point.label || "a set point"
                          : which === "start"
                            ? "whichever stop is first"
                            : "back where the day started"}
                      </span>
                      {overridden ? <span className="app-pill-attention shrink-0">this day only</span> : null}

                      {/* One tap, here on the card, for the two things actually wanted most often.
                          Which one shows depends on whether this technician has a point of their
                          own yet -- the whole re-entry problem is that Rodrigo did not. */}
                      {overridden && route.technician ? (
                        techHasOwn(route.technician, which) ? (
                          <form action={clearRouteLocation} className="shrink-0">
                            <input type="hidden" name="routeId" value={route.id} />
                            <input type="hidden" name="which" value={which} />
                            <input type="hidden" name="back" value={backTo} />
                            <button type="submit" className="app-btn-ghost-sm min-h-[44px]">
                              Use {route.technician.name ?? route.technician.email}&rsquo;s own
                            </button>
                          </form>
                        ) : (
                          <form action={saveRouteLocationAsTechnicianDefault} className="shrink-0">
                            <input type="hidden" name="routeId" value={route.id} />
                            <input type="hidden" name="which" value={which} />
                            <input type="hidden" name="back" value={backTo} />
                            <button
                              type="submit"
                              title={`Use this on every one of ${route.technician.name ?? route.technician.email}'s days, not just this one`}
                              className="app-btn-ghost-sm min-h-[44px]"
                            >
                              Save as {route.technician.name ?? route.technician.email}&rsquo;s {which}
                            </button>
                          </form>
                        )
                      ) : null}

                      <Link
                        href={`/dashboard/routes/${route.id}/location/${which}?back=${encodeURIComponent(backTo)}`}
                        className="app-btn-ghost-sm min-h-[44px] shrink-0"
                      >
                        {overridden ? `Change ${which}` : `Set ${which}`}
                      </Link>
                    </div>
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
                // Every other route, so a stop can change technician or weekday in place.
                moveTargets={routes
                  .filter((other) => other.id !== route.id)
                  .map((other) => ({
                    id: other.id,
                    label: `${DAY_NAMES[other.dayOfWeek ?? 0]} · ${
                      other.technician ? (other.technician.name ?? other.technician.email) : "Unassigned"
                    }`,
                  }))}
                stops={route.stops.map((stop) => ({
                  id: stop.id,
                  propertyId: stop.propertyId,
                  propertyName: stop.property.name,
                  bodyName: stop.bodyOfWater?.name ?? null,
                  bodyType: stop.bodyOfWater?.type ?? null,
                  serviceGroup: stop.bodyOfWater?.serviceGroup ?? null,
                  etaOffsetMinutes: stop.etaOffsetMinutes,
                  latitude: coalesceCoord(stop.bodyOfWater?.latitude, stop.property.latitude),
                  longitude: coalesceCoord(stop.bodyOfWater?.longitude, stop.property.longitude),
                }))}
                startPoint={routeEndpoints.get(route.id)?.start ?? null}
                endPoint={routeEndpoints.get(route.id)?.end ?? null}
              />

              {/* A one-off stop, added where the day is being planned.
                  Deliberately NOT a route stop. The stops above are the weekly template -- adding
                  an errand to it would put a pool-store run on every Friday forever. This writes
                  an AdHocStop, which carries a date and no recurrence, so it lands on one day and
                  one day only. Same action the schedule's own form posts to.
                  The date defaults to the next time this route actually runs, which is today when
                  today is that weekday, and is editable for any other occurrence. */}
              <details className="mt-4 border-t border-brand-border/70 pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand-ink">
                  Add a one-off stop to a {DAY_NAMES[route.dayOfWeek ?? 0]}
                </summary>
                <p className="mt-1 text-xs text-brand-muted">
                  For one date only — it won&rsquo;t join the weekly route above. It appears at the end of that
                  day&rsquo;s schedule, where it can be dragged into place.
                </p>
                <form action={addAdHocStop} className="mt-3 flex flex-wrap items-end gap-2">
                  <AdHocStopDateField
                    defaultYmd={nextOccurrenceYmd(todayYmd, route.dayOfWeek ?? 1)}
                  />
                  <input type="hidden" name="technicianId" value={route.technicianId ?? ""} />
                  <input
                    name="description"
                    placeholder="e.g. Pool store, or why you were called out"
                    className="app-field-sm min-w-[12rem] flex-1"
                  />
                  <select name="bodyOfWaterId" defaultValue="" className="app-field-sm">
                    <option value="">Errand — no venue</option>
                    {adHocVenues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.property.name} — {v.name}
                      </option>
                    ))}
                  </select>
                  <select name="propertyId" defaultValue="" className="app-field-sm">
                    <option value="">No property</option>
                    {propertyOptions.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="app-btn-primary-sm min-h-[44px]">
                    Add stop
                  </button>
                </form>
                {route.technicianId == null ? (
                  <p className="mt-2 text-xs text-brand-muted">
                    This route has no technician assigned, so the stop will be added unassigned.
                  </p>
                ) : null}
              </details>
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
