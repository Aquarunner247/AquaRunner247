import { describe, expect, it } from "vitest";
import { serializeReading } from "@/lib/serialize-reading";
import type { VisitWaterReading } from "@/generated/prisma/client";

/**
 * Why a test for what looks like a field copier.
 *
 * A VisitWaterReading off Prisma carries Decimal instances and Date instances. Neither is a plain
 * object, and the two consumers fail in DIFFERENT ways without this:
 *
 *  - The server page throws "Only plain objects can be passed to Client Components" from React's
 *    RSC serializer, on every visit that has a reading.
 *  - GET /api/visits/[id] does not throw at all -- JSON.stringify renders a Decimal as an object
 *    and a Date as an ISO string, so a client receives something structurally different from what
 *    the page passes its form, silently. That was a real bug in the first cut of that endpoint.
 *
 * So the contract is: numbers out for every measurement, an ISO string for the one timestamp, and
 * null preserved as null rather than coerced to 0 -- "no reading" and "a reading of zero" are
 * different facts about a pool, and a free chlorine of 0 is an emergency.
 */

/** Stands in for Prisma's Decimal: any object whose Number() conversion is the value. */
function decimal(value: number) {
  return { toString: () => String(value), valueOf: () => value } as unknown as never;
}

describe("serializeReading", () => {
  it("returns null for no reading", () => {
    expect(serializeReading(null)).toBeNull();
  });

  it("converts every Decimal measurement to a number", () => {
    const row = {
      ph: decimal(7.4),
      freeChlorinePpm: decimal(2.5),
      alkalinityPpm: decimal(90),
      cyanuricAcidPpm: decimal(40),
      temperatureF: decimal(82),
      backwashAt: null,
    } as unknown as VisitWaterReading;

    const out = serializeReading(row)!;
    expect(out.ph).toBe(7.4);
    expect(out.freeChlorinePpm).toBe(2.5);
    expect(out.alkalinityPpm).toBe(90);
    expect(typeof out.ph).toBe("number");
  });

  it("keeps null distinct from zero, which is the difference between untested and an emergency", () => {
    const row = { ph: null, freeChlorinePpm: decimal(0), backwashAt: null } as unknown as VisitWaterReading;
    const out = serializeReading(row)!;
    expect(out.ph).toBeNull();
    expect(out.freeChlorinePpm).toBe(0);
  });

  it("converts the one Date to an ISO string", () => {
    const row = { backwashAt: new Date("2026-11-24T15:30:00Z") } as unknown as VisitWaterReading;
    expect(serializeReading(row)!.backwashAt).toBe("2026-11-24T15:30:00.000Z");
  });

  it("emits only plain JSON values, which is the whole point on both paths", () => {
    const row = {
      ph: decimal(7.4),
      freeChlorinePpm: decimal(2.5),
      backwashAt: new Date("2026-11-24T15:30:00Z"),
    } as unknown as VisitWaterReading;

    const out = serializeReading(row)!;
    for (const [key, value] of Object.entries(out)) {
      const plain = value === null || typeof value === "number" || typeof value === "string";
      expect(plain, `${key} must be a plain JSON value, got ${typeof value}`).toBe(true);
    }
    // Survives a JSON round trip unchanged -- the API path's actual requirement.
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
