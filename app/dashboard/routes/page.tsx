import Link from "next/link";
import { redirect } from "next/navigation";
import { ScheduleFrequency } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrganizationRuleset, requiresMultipleDailyVisits } from "@/lib/compliance";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { InlineAssignSelect } from "@/app/components/inline-assign-select";
import { WaveProgress } from "@/app/components/wave-progress";
import { RouteStopsList } from "./route-stops-list";
import {
  createRoute,
  deleteRoute,
  addRouteStop,
  geocodeAllProperties,
  updateRouteTechnician,
  updateRouteCapacity,
  duplicateRoute,
} from "./actions";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function RoutesPage() {
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

  const routes = await prisma.recurringRoute.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: [{ dayOfWeek: "asc" }, { createdAt: "desc" }],
    include: {
      technician: { select: { id: true, name: true, email: true } },
      stops: {
        orderBy: { sortOrder: "asc" },
        include: {
          property: { select: { name: true } },
          bodyOfWater: { select: { name: true } },
        },
      },
    },
  });

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

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Weekly routes</h1>
        <p className="app-subhead">Assign technicians to weekly routes and add stops.</p>
        <form action={geocodeAllProperties} className="mt-3">
          <button type="submit" className="app-btn-secondary-sm">
            Geocode property addresses (for map view)
          </button>
          <p className="mt-1.5 text-xs text-brand-muted">
            One-time setup so technicians see stops on a map. Uses free OpenStreetMap lookup — safe to re-run anytime, it skips properties that already have coordinates.
          </p>
        </form>
      </header>

      {propertiesMissingCoordinates.length > 0 ? (
        <section className="app-card mt-6 border-l-4 border-l-brand-warn">
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

      <section className="mt-6 space-y-5">
        {routes.map((route) => (
          <div key={route.id} className="app-card-muted app-card-hover border-l-4 border-l-brand-primary">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border/70 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-brand-ink">{DAY_NAMES[route.dayOfWeek ?? 0]}</h2>
                <span className="app-badge">{route.frequency}</span>
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
                <form action={updateRouteCapacity} className="flex items-center gap-1">
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
                <form action={deleteRoute}>
                  <input type="hidden" name="routeId" value={route.id} />
                  <ConfirmSubmitButton
                    label="Delete route"
                    confirmMessage="Delete this route and all its stops?"
                    className="app-btn-danger-sm"
                  />
                </form>
              </div>
            </div>

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

            <RouteStopsList
              routeId={route.id}
              stops={route.stops.map((stop) => ({
                id: stop.id,
                propertyName: stop.property.name,
                bodyName: stop.bodyOfWater?.name ?? null,
                etaOffsetMinutes: stop.etaOffsetMinutes,
              }))}
            />

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
          </div>
        ))}
        {routes.length === 0 ? <p className="text-sm text-brand-muted">No routes yet.</p> : null}
      </section>

      <form action={createRoute} className="app-card mt-6">
        <p className="text-sm font-semibold text-brand-ink">Add route</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <select name="dayOfWeek" required defaultValue="1" className="app-field">
            {DAY_NAMES.slice(1).map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
          <select name="frequency" defaultValue="WEEKLY" className="app-field">
            {Object.values(ScheduleFrequency).map((f) => (
              <option key={f} value={f}>
                {f}
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
        <button className="app-btn-primary-sm mt-3" type="submit">
          Add route
        </button>
      </form>
    </main>
  );
}
