import { describe, expect, it } from "vitest";
import { prefetchDay } from "@/lib/client/local-store";

/**
 * These exercise the ORCHESTRATION, not the storage. IndexedDB does not exist in the node test
 * environment, so the mirror writes inside prefetchDay are no-ops here -- which is exactly the
 * behaviour on a device with storage blocked, and the reason the counts have to be computed from
 * what was fetched rather than from what was stored.
 *
 * The property that matters: a partial mirror is still useful. A technician who got the day but
 * not one stop's detail can still see where to drive, so nothing here may throw.
 */

const NOW = new Date("2026-11-24T07:00:00");

function recordingFetch(responses: Record<string, unknown>, failOn: string[] = []) {
  const calls: string[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url);
    if (failOn.some((f) => url.includes(f))) throw new Error("offline");
    if (!(url in responses)) throw new Error(`unexpected url ${url}`);
    return responses[url];
  };
  return { calls, fetchJson };
}

const DAY_URL = "/api/technician/day?date=2026-11-24";
const REF_URL = "/api/technician/reference";

describe("prefetchDay", () => {
  it("pulls the day, the reference set and every stop on it", async () => {
    const { calls, fetchJson } = recordingFetch({
      [DAY_URL]: { stops: [{ id: "v1" }, { id: "v2" }] },
      [REF_URL]: { chemicalProducts: [] },
      "/api/visits/v1": { visit: {} },
      "/api/visits/v2": { visit: {} },
    });

    const result = await prefetchDay({ technicianId: "tech-1", ymd: "2026-11-24", fetchJson, now: NOW });

    expect(result).toEqual({ day: true, reference: true, visits: 2, failed: 0 });
    expect(calls).toEqual([DAY_URL, REF_URL, "/api/visits/v1", "/api/visits/v2"]);
  });

  it("fetches the stops one at a time, not all at once", async () => {
    // On one bar, twenty simultaneous requests is how a weak connection becomes no connection.
    // The recording order above is the assertion; this pins the intent explicitly.
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchJson = async (url: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      if (url === DAY_URL) return { stops: [{ id: "v1" }, { id: "v2" }, { id: "v3" }] };
      return {};
    };

    await prefetchDay({ technicianId: "tech-1", ymd: "2026-11-24", fetchJson, now: NOW });
    expect(maxInFlight).toBe(1);
  });

  it("still mirrors the day when a single stop fails", async () => {
    const { fetchJson } = recordingFetch(
      {
        [DAY_URL]: { stops: [{ id: "v1" }, { id: "v2" }] },
        [REF_URL]: {},
        "/api/visits/v1": { visit: {} },
      },
      ["/api/visits/v2"],
    );

    const result = await prefetchDay({ technicianId: "tech-1", ymd: "2026-11-24", fetchJson, now: NOW });
    expect(result.day).toBe(true);
    expect(result.visits).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("does not throw when everything fails, and reports it", async () => {
    // Running this with no signal at all must be survivable -- a technician pressing the button
    // in a dead zone gets told nothing came down, not an unhandled rejection.
    const { fetchJson } = recordingFetch({}, ["/api"]);
    const result = await prefetchDay({ technicianId: "tech-1", ymd: "2026-11-24", fetchJson, now: NOW });
    expect(result).toEqual({ day: false, reference: false, visits: 0, failed: 2 });
  });

  it("fetches the reference set even when the day itself failed", async () => {
    // They are independent. Losing the route must not also lose the chemical list, which is the
    // same for every day and may already be the only thing missing.
    const { calls, fetchJson } = recordingFetch({ [REF_URL]: {} }, [DAY_URL]);
    const result = await prefetchDay({ technicianId: "tech-1", ymd: "2026-11-24", fetchJson, now: NOW });
    expect(result.reference).toBe(true);
    expect(calls).toContain(REF_URL);
  });

  it("url-encodes the date and the visit ids", async () => {
    const { calls, fetchJson } = recordingFetch({
      "/api/technician/day?date=2026-11-24": { stops: [{ id: "a/b" }] },
      [REF_URL]: {},
      "/api/visits/a%2Fb": {},
    });
    const result = await prefetchDay({ technicianId: "t", ymd: "2026-11-24", fetchJson, now: NOW });
    expect(calls).toContain("/api/visits/a%2Fb");
    expect(result.visits).toBe(1);
  });

  it("tolerates a day payload with no stops array", async () => {
    const { fetchJson } = recordingFetch({ [DAY_URL]: {}, [REF_URL]: {} });
    const result = await prefetchDay({ technicianId: "t", ymd: "2026-11-24", fetchJson, now: NOW });
    expect(result).toEqual({ day: true, reference: true, visits: 0, failed: 0 });
  });
});
