import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { LocationPicker } from "@/app/components/location-picker";
import { clearRouteLocation, setRouteLocation, setRouteLocationToStop } from "@/app/dashboard/routes/actions";
import { coalesceCoord } from "@/lib/geocode";
import { resolveRouteEndpoints } from "@/lib/route-endpoints";

type PageProps = {
  params: Promise<{ routeId: string; which: string }>;
};

/// Only when there's nothing else to centre on -- the valley this org services.
const FALLBACK_CENTER = { latitude: 36.1699, longitude: -115.1398 };

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * One page for all four combinations of (start | end). A route's override is an occasional
 * thing, so four near-identical pages would be four places to keep in sync for no gain.
 */
export default async function RouteLocationPage({ params }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { routeId, which: whichRaw } = await params;
  if (whichRaw !== "start" && whichRaw !== "end") notFound();
  const which = whichRaw;
  const isStart = which === "start";

  const route = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId },
    select: {
      id: true,
      name: true,
      dayOfWeek: true,
      startLatitude: true,
      startLongitude: true,
      startAddress: true,
      endLatitude: true,
      endLongitude: true,
      endAddress: true,
      technician: {
        select: {
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
    },
  });
  if (!route) notFound();

  // The route's own stops, offered as anchors. Coordinates resolved the same way the optimizer
  // resolves them, so choosing one here produces an exact match rather than a near-miss.
  const routeStops = await prisma.recurringStop.findMany({
    where: { routeId: route.id },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      property: { select: { name: true, latitude: true, longitude: true } },
      bodyOfWater: { select: { name: true, latitude: true, longitude: true } },
    },
  });
  const anchorableStops = routeStops
    .map((stop) => ({
      id: stop.id,
      label: stop.bodyOfWater?.name ? `${stop.property.name} — ${stop.bodyOfWater.name}` : stop.property.name,
      latitude: coalesceCoord(stop.bodyOfWater?.latitude, stop.property.latitude),
    }))
    .filter((stop) => stop.latitude != null);

  const dayLabel = route.name?.trim() || (route.dayOfWeek != null ? DAY_NAMES[route.dayOfWeek] : null) || "this route";
  const tech = route.technician?.name ?? route.technician?.email ?? "Unassigned";

  const overrideLat = isStart ? route.startLatitude : route.endLatitude;
  const overrideLng = isStart ? route.startLongitude : route.endLongitude;
  const overrideLabel = isStart ? route.startAddress : route.endAddress;
  const hasOverride = overrideLat != null && overrideLng != null;

  // What this route resolves to right now, so the page can say what clearing would fall back to
  // rather than making an admin work out the chain themselves.
  const { start: effectiveStart, end: effectiveEnd } = resolveRouteEndpoints({
    route,
    technician: route.technician,
  });
  const effective = isStart ? effectiveStart : effectiveEnd;

  let center = FALLBACK_CENTER;
  let zoom = 11;
  if (hasOverride) {
    center = { latitude: Number(overrideLat), longitude: Number(overrideLng) };
    zoom = 19;
  } else if (effective) {
    center = { latitude: effective.latitude, longitude: effective.longitude };
    zoom = 15;
  } else {
    const others = await prisma.property.findMany({
      where: { organizationId: appUser.organizationId, latitude: { not: null }, longitude: { not: null } },
      select: { latitude: true, longitude: true },
      take: 200,
    });
    if (others.length > 0) {
      center = {
        latitude: others.reduce((sum, o) => sum + Number(o.latitude), 0) / others.length,
        longitude: others.reduce((sum, o) => sum + Number(o.longitude), 0) / others.length,
      };
    }
  }

  const fallbackDescription = isStart
    ? effectiveStart && !hasOverride
      ? `${tech}'s own start point${effectiveStart.label ? ` (${effectiveStart.label})` : ""}`
      : effectiveStart
        ? `${tech}'s own start point`
        : "whichever stop is first"
    : effectiveEnd && !hasOverride
      ? `${effectiveEnd.label ?? "the point this day already finishes at"}`
      : "wherever this day starts";

  return (
    <main className="app-page-lg">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/routes" className="app-link">
          Routes
        </Link>
      </div>

      <header className="app-page-head mt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">
          {dayLabel} · {tech}
        </p>
        <h1 className="app-h1">Where {dayLabel} {isStart ? "starts" : "ends"}</h1>
        <p className="mt-2 text-sm text-brand-ink">
          {isStart
            ? `Set this only if ${tech} leaves from somewhere different on this particular day. Most days should just use their own start point.`
            : `Set this only if ${tech} finishes somewhere different on this particular day.`}
        </p>
        <p className="mt-2 text-sm text-brand-muted">
          {hasOverride
            ? `This day currently overrides ${tech}'s default.`
            : `No override — this day uses ${fallbackDescription}.`}
        </p>
      </header>

      {anchorableStops.length > 0 ? (
        <section className="app-card mt-4">
          <h2 className="font-display text-base font-semibold text-brand-ink">
            {isStart ? "Start at" : "Finish at"} one of this day&rsquo;s stops
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            {isStart
              ? "Pick the stop this day begins at and it will be serviced first, rather than being somewhere the route merely passes near."
              : "Pick the stop this day ends at and it will be serviced last. Use the map below instead for a place nobody services — a home or the yard — which the day finishes by driving to."}
          </p>
          <form action={setRouteLocationToStop} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="routeId" value={route.id} />
            <input type="hidden" name="which" value={which} />
            <select name="stopId" required defaultValue="" className="app-field-sm min-w-[14rem] flex-1">
              <option value="" disabled>
                Choose a stop…
              </option>
              {anchorableStops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.label}
                </option>
              ))}
            </select>
            <button type="submit" className="app-btn-primary-sm min-h-[44px]">
              Use this stop
            </button>
          </form>
        </section>
      ) : null}

      {hasOverride ? (
        <section className="app-card mt-4">
          <p className="text-sm font-semibold text-brand-ink">{overrideLabel || `${isStart ? "Start" : "End"} override set`}</p>
          <p className="mt-1 text-xs text-brand-muted">
            <span className="app-metric">
              {Number(overrideLat).toFixed(6)}, {Number(overrideLng).toFixed(6)}
            </span>
          </p>
          <form action={clearRouteLocation} className="mt-3">
            <input type="hidden" name="routeId" value={route.id} />
            <input type="hidden" name="which" value={which} />
            <button type="submit" className="app-btn-secondary-sm">
              Use {tech}&rsquo;s default instead
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-4">
        <LocationPicker
          action={setRouteLocation}
          hiddenFields={{ routeId: route.id, which }}
          initialLatitude={center.latitude}
          initialLongitude={center.longitude}
          initialZoom={zoom}
          hasConfidentStart={hasOverride || Boolean(effective)}
          instruction={`Search the address to jump the map there, then click where ${dayLabel} ${isStart ? "starts" : "ends"}.`}
          saveLabel={hasOverride ? "Update this day's point" : `Save this day's ${isStart ? "start" : "end"}`}
          noteField={{
            name: "label",
            label: "Label (optional)",
            placeholder: isStart ? "Warehouse" : "Shop",
            defaultValue: overrideLabel ?? "",
          }}
        />
      </section>
    </main>
  );
}
