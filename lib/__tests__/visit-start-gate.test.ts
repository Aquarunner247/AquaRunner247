import { describe, expect, it } from "vitest";
import { blockedStartMessage, blockingStopFor, openStopsBlockingStartWhere, type OpenStop } from "../visit-start-gate";

const stop = (over: Partial<OpenStop> = {}): OpenStop => ({
  id: "v1",
  propertyId: "pA",
  propertyName: "Sunrise Apartments",
  bodyName: "Main Pool",
  ...over,
});

describe("blockingStopFor", () => {
  it("does not block when nothing is open", () => {
    expect(blockingStopFor([], "pB")).toBeNull();
  });

  it("blocks starting a different property", () => {
    expect(blockingStopFor([stop()], "pB")?.id).toBe("v1");
  });

  it("allows another body of water at the SAME property", () => {
    // A pool and a spa on one walk-up are meant to be open together -- the shared customer
    // summary and the bundled photo capture both depend on it.
    expect(blockingStopFor([stop()], "pA")).toBeNull();
  });

  it("allows the same property even with several of its bodies open", () => {
    const open = [stop({ id: "v1", bodyName: "Pool" }), stop({ id: "v2", bodyName: "Spa" })];
    expect(blockingStopFor(open, "pA")).toBeNull();
  });

  it("picks the foreign property out of a mixed set", () => {
    const open = [stop({ id: "v1", propertyId: "pA" }), stop({ id: "v2", propertyId: "pZ", propertyName: "Canyon Ridge" })];
    expect(blockingStopFor(open, "pA")?.propertyName).toBe("Canyon Ridge");
  });
});

describe("openStopsBlockingStartWhere", () => {
  const dayStart = new Date("2026-10-09T07:00:00.000Z");
  const dayEnd = new Date("2026-10-10T07:00:00.000Z");
  const where = openStopsBlockingStartWhere("tech-1", dayStart, dayEnd);

  it("looks only at this technician's own in-progress stops", () => {
    expect(where.technicianId).toBe("tech-1");
    expect(where.status).toBe("IN_PROGRESS");
  });

  it("excludes pushed stops, so last week's leftovers cannot lock a technician out today", () => {
    expect(where.pushedAt).toBeNull();
  });

  it("confines the check to the stop's own local day", () => {
    expect(where.scheduledStart).toEqual({ gte: dayStart, lt: dayEnd });
  });

  it("is a plain mutable object -- Prisma rejects readonly shapes", () => {
    expect(Object.isFrozen(where)).toBe(false);
  });
});

describe("blockedStartMessage", () => {
  it("names the property and body so the technician knows where to go back to", () => {
    expect(blockedStartMessage(stop())).toContain("Sunrise Apartments — Main Pool");
  });

  it("names the property alone when there is no body", () => {
    expect(blockedStartMessage(stop({ bodyName: null }))).toContain("Sunrise Apartments");
  });

  it("always points at the way out, so the gate is never a dead end on a jobsite", () => {
    expect(blockedStartMessage(stop())).toMatch(/skip it/i);
  });
});
