import { redirect } from "next/navigation";
import { ScheduleFrequency } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { createRoute, deleteRoute, addRouteStop, removeRouteStop, geocodeAllProperties } from "./actions";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// One accent color per weekday, drawn from colors already used elsewhere in the app
// (teal is the primary brand accent; the rest are the same supporting palette used
// for badges/warnings/success states throughout the dashboard).
const DAY_ACCENT: Record<number, string> = {
  1: "border-l-teal-500", // Monday
  2: "border-l-sky-500", // Tuesday
  3: "border-l-violet-500", // Wednesday
  4: "border-l-amber-500", // Thursday
  5: "border-l-rose-500", // Friday
  6: "border-l-emerald-500", // Saturday
  7: "border-l-slate-400", // Sunday
};

export default async function RoutesPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({
    where: { organizationId: appUser.organizationId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
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
          <p className="mt-1.5 text-xs text-slate-500">
            One-time setup so technicians see stops on a map. Uses free OpenStreetMap lookup — safe to re-run anytime, it skips properties that already have coordinates.
          </p>
        </form>
      </header>

      <section className="mt-6 space-y-5">
        {routes.map((route) => (
          <div key={route.id} className={`app-card-muted border-l-4 ${DAY_ACCENT[route.dayOfWeek ?? 1] ?? "border-l-teal-500"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-teal-100/70 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-slate-900">{DAY_NAMES[route.dayOfWeek ?? 0]}</h2>
                <span className="app-badge">{route.frequency}</span>
                <span className="app-badge">
                  {route.technician ? route.technician.name ?? route.technician.email : "Unassigned"}
                </span>
              </div>
              <form action={deleteRoute}>
                <input type="hidden" name="routeId" value={route.id} />
                <ConfirmSubmitButton
                  label="Delete route"
                  confirmMessage="Delete this route and all its stops?"
                  className="app-btn-danger-sm"
                />
              </form>
            </div>

            <ol className="mt-3 space-y-2">
              {route.stops.map((stop, idx) => (
                <li key={stop.id} className="app-card-inset flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold text-teal-800">{idx + 1}.</span> {stop.property.name} — {stop.bodyOfWater?.name ?? "Property-level"}
                    {stop.etaOffsetMinutes ? ` · +${stop.etaOffsetMinutes} min` : ""}
                  </span>
                  <form action={removeRouteStop}>
                    <input type="hidden" name="stopId" value={stop.id} />
                    <ConfirmSubmitButton
                      label="Remove"
                      confirmMessage="Remove this stop from the route?"
                      className="app-btn-ghost-sm"
                    />
                  </form>
                </li>
              ))}
              {route.stops.length === 0 ? <p className="text-sm text-slate-500">No stops yet.</p> : null}
            </ol>

            <form action={addRouteStop} className="app-card-inset mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="routeId" value={route.id} />
              <select name="bodyOfWaterId" required className="app-field w-auto">
                <option value="">Select aquatic venue…</option>
                {allBodiesOfWater.map((b) => (
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
            </form>
          </div>
        ))}
        {routes.length === 0 ? <p className="text-sm text-slate-500">No routes yet.</p> : null}
      </section>

      <form action={createRoute} className="app-card mt-6">
        <p className="text-sm font-semibold text-slate-900">Add route</p>
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
