import { prisma } from "@/lib/prisma";
import { suggestRouteForNewCustomer, type CandidateRouteInput } from "@/lib/route-suggestion";

/**
 * Read-only sanity check for suggestRouteForNewCustomer against real route data —
 * not a formal test suite, just eyeballing that geography-only ranking isn't obviously
 * broken before building any UI on top of it. Picks a handful of the org's own already-
 * geocoded properties as stand-ins for "a new customer arriving at that exact spot" and
 * prints the top 3 suggested routes next to which route that property is actually on
 * today (for context — the real assignment also weighs things v1 deliberately excludes,
 * so this isn't a strict pass/fail).
 *
 * Usage:
 *   npx tsx prisma/sanity-check-route-suggestion.ts --org=<organizationId>
 */
async function main() {
  const args = process.argv.slice(2);
  const orgArg = args.find((a) => a.startsWith("--org="));
  const organizationId = orgArg ? orgArg.slice("--org=".length) : undefined;
  if (!organizationId) {
    console.error("Usage: npx tsx prisma/sanity-check-route-suggestion.ts --org=<organizationId>");
    process.exitCode = 1;
    return;
  }

  const routes = await prisma.recurringRoute.findMany({
    where: { organizationId, active: true },
    include: {
      technician: { select: { name: true, email: true } },
      stops: {
        include: { property: { select: { id: true, latitude: true, longitude: true } } },
      },
    },
  });

  const candidates: CandidateRouteInput[] = routes.map((route) => ({
    routeId: route.id,
    technicianLabel: route.technician ? route.technician.name ?? route.technician.email : "Unassigned",
    maxCapacity: route.maxCapacity,
    totalStopCount: route.stops.length,
    geocodedStops: route.stops
      .filter((s) => s.property.latitude != null && s.property.longitude != null)
      .map((s) => ({
        propertyId: s.property.id,
        latitude: Number(s.property.latitude),
        longitude: Number(s.property.longitude),
      })),
  }));

  console.log(`Loaded ${candidates.length} active route(s):`);
  for (const c of candidates) {
    console.log(
      `  ${c.routeId}  tech=${c.technicianLabel}  stops=${c.totalStopCount} (${c.geocodedStops.length} geocoded)  maxCapacity=${c.maxCapacity ?? "unlimited"}`,
    );
  }
  const zeroGeocoded = candidates.filter((c) => c.geocodedStops.length === 0);
  if (zeroGeocoded.length > 0) {
    console.log(`\n${zeroGeocoded.length} route(s) have zero geocoded stops — must never appear in any suggestion output below:`);
    for (const c of zeroGeocoded) console.log(`  ${c.routeId} (tech=${c.technicianLabel})`);
  }

  // Stand-ins: a handful of the org's own already-geocoded properties, plus which route
  // (if any) that property's body of water is actually on today, for context.
  const properties = await prisma.property.findMany({
    where: { organizationId, latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      recurringStops: { select: { routeId: true } },
    },
    orderBy: { name: "asc" },
    take: 6,
  });

  console.log(`\n--- Suggestions for ${properties.length} stand-in propert${properties.length === 1 ? "y" : "ies"} ---`);
  for (const p of properties) {
    const actualRouteIds = p.recurringStops.map((s) => s.routeId);
    const suggestions = suggestRouteForNewCustomer({ latitude: Number(p.latitude), longitude: Number(p.longitude) }, candidates);

    console.log(`\n${p.name} (actual route(s): ${actualRouteIds.length ? actualRouteIds.join(", ") : "none — not on a route today"})`);
    if (suggestions.length === 0) {
      console.log("  (no suggestions — no eligible routes)");
    }
    for (const s of suggestions) {
      const onActual = actualRouteIds.includes(s.routeId) ? "  <-- matches actual route" : "";
      console.log(
        `  ${s.routeId}  tech=${s.technicianLabel}  ${s.distanceMiles.toFixed(2)} mi  ${s.currentStopCount}${s.maxCapacity != null ? `/${s.maxCapacity}` : ""} stops${onActual}`,
      );
    }
  }

  // Capacity-filter fixture check — reuse the first candidate with stops, force a low cap.
  const capacityFixture = candidates.find((c) => c.totalStopCount > 0);
  if (capacityFixture && properties[0]) {
    const fixtured = candidates.map((c) => (c.routeId === capacityFixture.routeId ? { ...c, maxCapacity: 1 } : c));
    const p = properties[0];
    const withCap = suggestRouteForNewCustomer({ latitude: Number(p.latitude), longitude: Number(p.longitude) }, fixtured);
    const stillIncluded = withCap.some((s) => s.routeId === capacityFixture.routeId);
    console.log(
      `\nCapacity fixture: route ${capacityFixture.routeId} (${capacityFixture.totalStopCount} stops) forced to maxCapacity=1 — ${
        stillIncluded ? "FAIL: still included" : "OK: correctly excluded"
      }`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
