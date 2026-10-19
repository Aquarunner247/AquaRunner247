/**
 * Writes BodyOfWater.serviceGroup for the bundles that were previously INFERRED, so declared
 * bundling starts out agreeing exactly with what the schedule already drew.
 *
 * Without this, the first deploy after the declared-bundling change shows every bundle as separate
 * rows -- a visible regression on every multi-body property, for nothing.
 *
 * It reimplements the old rule (same property, within 40m of the run's first member, at most one
 * body of each type) rather than importing it, because lib/stop-grouping.ts no longer contains it.
 * That duplication is deliberate and temporary: this is a one-off, and pinning the dead rule into
 * the live module to share it would be worse.
 *
 * One difference from the schedule's version: this has no route order, so it clusters a property's
 * bodies by creation order instead of by where they fall in a day. For the real data that is the
 * same answer -- the bundles are pool/spa pairs metres apart -- but it is why this prints every
 * group for review rather than just applying.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   npm run db:backfill-service-groups          # prints what it would do, changes nothing
 *   npm run db:backfill-service-groups -- --apply
 */
import { prisma } from "@/lib/prisma";
import { serviceGroupName } from "@/lib/service-group-name";

const RADIUS_METERS = 40;
const MILES_TO_METERS = 1609.344;

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * MILES_TO_METERS;
}



async function main() {
  const apply = process.argv.includes("--apply");

  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      bodiesOfWater: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, type: true, serviceGroup: true, latitude: true, longitude: true },
      },
    },
  });

  type Write = { bodyId: string; bodyName: string; property: string; group: string };
  const writes: Write[] = [];
  let alreadySet = 0;
  let singletons = 0;

  for (const property of properties) {
    const coordsOf = (b: (typeof property.bodiesOfWater)[number]) => {
      const lat = b.latitude ?? property.latitude;
      const lng = b.longitude ?? property.longitude;
      return lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null;
    };

    // Cluster by the old rule: within RADIUS of the cluster's FIRST member, one body per type.
    const clusters: { members: typeof property.bodiesOfWater; anchor: { lat: number; lng: number } | null; types: Set<string> }[] = [];
    for (const body of property.bodiesOfWater) {
      const coords = coordsOf(body);
      const home = clusters.find(
        (c) =>
          c.anchor != null &&
          coords != null &&
          metersBetween(c.anchor, coords) <= RADIUS_METERS &&
          !c.types.has(body.type),
      );
      if (home) {
        home.members.push(body);
        home.types.add(body.type);
      } else {
        clusters.push({ members: [body], anchor: coords, types: new Set([body.type]) });
      }
    }

    const bundles = clusters.filter((c) => c.members.length > 1);
    bundles.forEach((cluster, index) => {
      const name = serviceGroupName(cluster.members.map((m) => m.name), index, bundles.length);
      for (const member of cluster.members) {
        if (member.serviceGroup != null) {
          alreadySet++;
          continue;
        }
        writes.push({ bodyId: member.id, bodyName: member.name, property: property.name, group: name });
      }
    });
    singletons += clusters.filter((c) => c.members.length === 1).length;
  }

  const byProperty = new Map<string, Write[]>();
  for (const w of writes) {
    if (!byProperty.has(w.property)) byProperty.set(w.property, []);
    byProperty.get(w.property)!.push(w);
  }

  console.log(apply ? "APPLYING service groups\n" : "DRY RUN — nothing will be written. Pass --apply to write.\n");
  for (const [property, rows] of byProperty) {
    console.log(`${property}`);
    for (const row of rows) console.log(`    ${row.bodyName}  ->  "${row.group}"`);
  }

  console.log(
    `\n${writes.length} bodies would be grouped into ${new Set(writes.map((w) => `${w.property}|${w.group}`)).size} walk-ups.`,
  );
  console.log(`${singletons} bodies stay on their own (no bundle).`);
  if (alreadySet > 0) console.log(`${alreadySet} already had a group and were left alone.`);

  if (!apply) {
    console.log("\nNothing was written. Re-run with --apply once the groups above look right.");
    return;
  }

  // One statement per body: a few dozen rows, and naming each one keeps the write auditable.
  for (const write of writes) {
    await prisma.bodyOfWater.update({ where: { id: write.bodyId }, data: { serviceGroup: write.group } });
  }
  console.log(`\nWrote ${writes.length} service groups.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
