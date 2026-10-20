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

  /**
   * Places this organization already uses as a start or finish, offered as one-click options.
   *
   * Setting a route's start or end meant dropping a pin on satellite imagery every time, even for
   * the technician's own home -- an address already stored on their user record, and the exact
   * thing being re-entered. Reported 2026-10-19 as having to enter the same tech home address each
   * time.
   *
   * Derived rather than stored: a saved place IS an address already in use, on a technician or on
   * another route, so there is no new list to curate and nothing goes stale. Deduped on
   * coordinates rounded to ~10cm, because the same place reached two ways (a technician default
   * and a route override copied from it) is one entry, not two identical ones.
   */
  const [technicians, otherRoutes] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: appUser.organizationId, active: true },
      select: {
        name: true, email: true,
        startLatitude: true, startLongitude: true, startAddress: true,
        endLatitude: true, endLongitude: true, endAddress: true,
      },
    }),
    prisma.recurringRoute.findMany({
      where: { organizationId: appUser.organizationId },
      select: {
        name: true, dayOfWeek: true,
        startLatitude: true, startLongitude: true, startAddress: true,
        endLatitude: true, endLongitude: true, endAddress: true,
      },
    }),
  ]);

  type SavedPlace = { key: string; label: string; latitude: number; longitude: number; own: boolean };
  const savedPlaces: SavedPlace[] = [];
  const seenPlace = new Set<string>();
  const addPlace = (lat: unknown, lng: unknown, label: string | null, who: string, own = false) => {
    if (lat == null || lng == null) return;
    const latitude = Number(lat);
    const longitude = Number(lng);
    const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    if (seenPlace.has(key)) return;
    seenPlace.add(key);
    savedPlaces.push({ key, label: label?.trim() ? `${label.trim()} · ${who}` : who, latitude, longitude, own });
  };

  /**
   * THIS route's technician first, and separated out.
   *
   * "Any of Rich's days should offer his house" -- and it did, but buried among every other
   * technician's and every other day's, which is not the same as being offered. The person whose
   * day this is has one obvious answer, so it gets its own group above the rest rather than a
   * position in a list that grows with the roster.
   */
  const ownTechnicianName = route.technician?.name ?? route.technician?.email ?? null;
  const own = technicians.find((t) => (t.name ?? t.email) === ownTechnicianName);
  if (own) {
    addPlace(own.startLatitude, own.startLongitude, own.startAddress, `${ownTechnicianName}'s start`, true);
    addPlace(own.endLatitude, own.endLongitude, own.endAddress, `${ownTechnicianName}'s finish`, true);
  }
  for (const t of technicians) {
    const who = t.name ?? t.email;
    if (who === ownTechnicianName) continue;
    addPlace(t.startLatitude, t.startLongitude, t.startAddress, `${who}'s start`);
    addPlace(t.endLatitude, t.endLongitude, t.endAddress, `${who}'s finish`);
  }
  for (const r of otherRoutes) {
    const who = `${r.name?.trim() || (r.dayOfWeek != null ? DAY_NAMES[r.dayOfWeek] : "a route")}`;
    addPlace(r.startLatitude, r.startLongitude, r.startAddress, `${who} start`);
    addPlace(r.endLatitude, r.endLongitude, r.endAddress, `${who} finish`);
  }
  const ownPlaces = savedPlaces.filter((place) => place.own);
  const otherPlaces = savedPlaces.filter((place) => !place.own);

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

      {savedPlaces.length > 0 ? (
        <section className="app-card mt-4">
          <h2 className="font-display text-base font-semibold text-brand-ink">Use a place you already have</h2>

          {ownPlaces.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-brand-ink">
                {tech} runs this day — their own start and finish, one tap, nothing to re-enter.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {ownPlaces.map((place) => (
                  <li key={place.key}>
                    <form action={setRouteLocation}>
                      <input type="hidden" name="routeId" value={route.id} />
                      <input type="hidden" name="which" value={which} />
                      <input type="hidden" name="latitude" value={place.latitude} />
                      <input type="hidden" name="longitude" value={place.longitude} />
                      <input type="hidden" name="label" value={place.label} />
                      <button type="submit" className="app-btn-primary-sm min-h-[44px]">
                        {place.label}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          ) : route.technician ? (
            <p className="mt-1 text-sm text-brand-muted">
              {tech} has no start point of their own yet — setting one on their user record makes it
              available on every one of their days.
            </p>
          ) : null}

          {otherPlaces.length > 0 ? (
            <>
              <p className={`text-sm text-brand-muted ${ownPlaces.length > 0 ? "mt-4" : "mt-1"}`}>
                Anywhere else this company already starts or finishes.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {otherPlaces.map((place) => (
                  <li key={place.key}>
                    <form action={setRouteLocation}>
                      <input type="hidden" name="routeId" value={route.id} />
                      <input type="hidden" name="which" value={which} />
                      <input type="hidden" name="latitude" value={place.latitude} />
                      <input type="hidden" name="longitude" value={place.longitude} />
                      <input type="hidden" name="label" value={place.label} />
                      <button type="submit" className="app-btn-ghost-sm min-h-[44px]">
                        {place.label}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
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
