import { redirect } from "next/navigation";
import { ScheduleFrequency } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { createRoute, deleteRoute, addRouteStop, removeRouteStop, geocodeAllProperties } from "./actions";

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
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Admin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Weekly routes</h1>
        <p className="mt-1 text-sm text-slate-500">Assign technicians to weekly routes and add stops.</p>
        <form action={geocodeAllProperties} className="mt-3">
          <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Geocode property addresses (for map view)
          </button>
          <p className="mt-1 text-xs text-slate-500">
            One-time setup so technicians see stops on a map. Uses free OpenStreetMap lookup — safe to re-run anytime, it skips properties that already have coordinates.
          </p>
        </form>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-4">
          {routes.map((route) => (
            <div key={route.id} className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{DAY_NAMES[route.dayOfWeek ?? 0]}</p>
                  <p className="text-xs text-slate-500">
                    {route.frequency} · {route.technician ? route.technician.name ?? route.technician.email : "Unassigned"}
                  </p>
                </div>
                <form action={deleteRoute}>
                  <input type="hidden" name="routeId" value={route.id} />
                  <ConfirmSubmitButton
                    label="🗑"
                    confirmMessage="Delete this route and all its stops?"
                    className="rounded px-2 py-1 text-base hover:bg-slate-200"
                  />
                </form>
              </div>

              <ol className="mt-2 space-y-1">
                {route.stops.map((stop, idx) => (
                  <li
                    key={stop.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  >
                    <span>
                      {idx + 1}. {stop.property.name} — {stop.bodyOfWater?.name ?? "Property-level"}
                      {stop.etaOffsetMinutes ? ` · +${stop.etaOffsetMinutes} min` : ""}
                    </span>
                    <form action={removeRouteStop}>
                      <input type="hidden" name="stopId" value={stop.id} />
                      <ConfirmSubmitButton
                        label="🗑"
                        confirmMessage="Remove this stop from the route?"
                        className="rounded px-2 py-1 text-base hover:bg-slate-200"
                      />
                    </form>
                  </li>
                ))}
                {route.stops.length === 0 ? <p className="text-sm text-slate-500">No stops yet.</p> : null}
              </ol>

              <form action={addRouteStop} className="mt-2 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-2">
                <input type="hidden" name="routeId" value={route.id} />
                <select name="bodyOfWaterId" required className="rounded border border-slate-300 px-2 py-1.5 text-sm">
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
                  className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white">
                  Add stop
                </button>
              </form>
            </div>
          ))}
          {routes.length === 0 ? <p className="text-sm text-slate-500">No routes yet.</p> : null}
        </div>

        <form action={createRoute} className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">Add route</p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <select name="dayOfWeek" required defaultValue="1" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              {DAY_NAMES.slice(1).map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
            <select name="frequency" defaultValue="WEEKLY" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              {Object.values(ScheduleFrequency).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select name="technicianId" defaultValue="" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          </div>
          <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Add route
          </button>
        </form>
      </section>
    </main>
  );
}
