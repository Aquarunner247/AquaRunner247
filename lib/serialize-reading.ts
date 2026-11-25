/**
 * Turning a water reading into plain JSON.
 *
 * Its own module, importing no Prisma at runtime -- `import type` is erased, so this stays in the
 * 84-of-109 majority of lib/ that carries no database dependency. That is not tidiness: a module
 * that imports lib/prisma cannot even be LOADED in the node test environment (it throws
 * "DATABASE_URL is not set" on import), so putting a pure function behind one makes it
 * untestable. This one is worth testing -- see lib/__tests__/serialize-reading.test.ts for the
 * two different ways its absence breaks the page and the API.
 */

import type { VisitWaterReading } from "@/generated/prisma/client";

/**
 * VisitWaterReading straight off Prisma carries Decimal instances (ph, freeChlorinePpm, etc.) and
 * Date instances (backwashAt, capturedAt, ...) -- neither is a plain object, so passing the row
 * as-is into a "use client" component throws "Only plain objects can be passed to Client
 * Components" on every visit that has a reading.
 *
 * It matters just as much over the wire, which the first cut of the API got wrong: JSON.stringify
 * renders a Decimal as an object and a Date as an ISO string, so a client fed the raw row would
 * have seen a different shape from the one the page passes. Both forms coerce every field through
 * String(v), so numbers and ISO strings serialize identically to what Decimal/Date's own
 * toString() produced -- this removes the class-instance violation without changing a value.
 */
export function serializeReading(reading: VisitWaterReading | null) {
  if (!reading) return null;
  return {
    ph: reading.ph != null ? Number(reading.ph) : null,
    freeChlorinePpm: reading.freeChlorinePpm != null ? Number(reading.freeChlorinePpm) : null,
    totalChlorinePpm: reading.totalChlorinePpm != null ? Number(reading.totalChlorinePpm) : null,
    brominePpm: reading.brominePpm != null ? Number(reading.brominePpm) : null,
    alkalinityPpm: reading.alkalinityPpm != null ? Number(reading.alkalinityPpm) : null,
    cyanuricAcidPpm: reading.cyanuricAcidPpm != null ? Number(reading.cyanuricAcidPpm) : null,
    temperatureF: reading.temperatureF != null ? Number(reading.temperatureF) : null,
    filterPressurePsi: reading.filterPressurePsi != null ? Number(reading.filterPressurePsi) : null,
    vacGaugeReading: reading.vacGaugeReading != null ? Number(reading.vacGaugeReading) : null,
    pumpPressurePsi: reading.pumpPressurePsi != null ? Number(reading.pumpPressurePsi) : null,
    filterGaugeReading: reading.filterGaugeReading != null ? Number(reading.filterGaugeReading) : null,
    flowMeterGpm: reading.flowMeterGpm != null ? Number(reading.flowMeterGpm) : null,
    backwashAt: reading.backwashAt ? reading.backwashAt.toISOString() : null,
  };
}
