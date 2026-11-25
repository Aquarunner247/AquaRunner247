import { describe, expect, it } from "vitest";
import {
  loadAwaySince,
  saveAwaySince,
  localDayKey,
  DEPARTURE_WATCH_STATE_KEY,
  DEPARTURE_RESUME_WINDOW_MS,
  type WatchStateStorage,
} from "@/lib/departure-watch-state";
import { DEPARTURE_SUSTAINED_MS, departureTimeFor } from "@/lib/departure-detection";

/**
 * The asymmetry that shapes every case below: failing to resume a dwell costs a departure, which
 * is the bug we already had. Resuming one we should not have costs a WRONG departure written into
 * a customer's report. So every doubtful input here must yield nothing, and the tests are mostly
 * about proving the doubtful cases are treated as doubtful.
 */

function fakeStorage(initial: Record<string, string> = {}): WatchStateStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const NOW = new Date("2026-11-24T14:00:00");

describe("saving and resuming a dwell", () => {
  it("round-trips a marker that is still live", () => {
    const s = fakeStorage();
    const awaySince = new Date(NOW.getTime() - 90_000); // 90s into the 3-minute dwell
    saveAwaySince(s, new Map([["visit-1", awaySince]]), NOW);

    const resumed = loadAwaySince(s, NOW);
    expect(resumed.get("visit-1")?.getTime()).toBe(awaySince.getTime());
  });

  it("resumes rather than restarts, which is the entire point", () => {
    // The process died 90s in. Restarting the dwell would need another 3 minutes of away-fixes,
    // and a technician already driving generates no further boundary crossing to restart from.
    const s = fakeStorage();
    const awaySince = new Date(NOW.getTime() - 90_000);
    saveAwaySince(s, new Map([["visit-1", awaySince]]), NOW);

    const resumed = loadAwaySince(s, NOW);
    const elapsedOnResume = NOW.getTime() - resumed.get("visit-1")!.getTime();
    expect(elapsedOnResume).toBe(90_000);
    expect(elapsedOnResume).toBeLessThan(DEPARTURE_SUSTAINED_MS);
  });

  it("clears the key instead of leaving a stale day behind when nothing is away", () => {
    const s = fakeStorage();
    saveAwaySince(s, new Map([["visit-1", NOW]]), NOW);
    expect(s.data[DEPARTURE_WATCH_STATE_KEY]).toBeTruthy();
    saveAwaySince(s, new Map(), NOW);
    expect(s.data[DEPARTURE_WATCH_STATE_KEY]).toBeUndefined();
  });
});

describe("what must NOT be resumed", () => {
  it("yesterday's markers, which would land on today's stops", () => {
    const s = fakeStorage();
    const yesterday = new Date("2026-11-23T14:00:00");
    saveAwaySince(s, new Map([["visit-1", yesterday]]), yesterday);
    expect(loadAwaySince(s, NOW).size).toBe(0);
  });

  it("a marker older than the resume window", () => {
    const s = fakeStorage();
    const tooOld = new Date(NOW.getTime() - DEPARTURE_RESUME_WINDOW_MS - 1000);
    const justInside = new Date(NOW.getTime() - DEPARTURE_RESUME_WINDOW_MS + 1000);

    saveAwaySince(s, new Map([["visit-1", tooOld]]), NOW);
    expect(loadAwaySince(s, NOW).size).toBe(0);

    saveAwaySince(s, new Map([["visit-1", justInside]]), NOW);
    expect(loadAwaySince(s, NOW).size).toBe(1);
  });

  it("a marker from the future, which is a moved clock and not an observation", () => {
    const s = fakeStorage();
    saveAwaySince(s, new Map([["visit-1", new Date(NOW.getTime() + 60_000)]]), NOW);
    expect(loadAwaySince(s, NOW).size).toBe(0);
  });

  it("corrupt, half-written or absent state", () => {
    expect(loadAwaySince(fakeStorage(), NOW).size).toBe(0);
    expect(loadAwaySince(fakeStorage({ [DEPARTURE_WATCH_STATE_KEY]: "{not json" }), NOW).size).toBe(0);
    expect(loadAwaySince(fakeStorage({ [DEPARTURE_WATCH_STATE_KEY]: "null" }), NOW).size).toBe(0);
    expect(loadAwaySince(fakeStorage({ [DEPARTURE_WATCH_STATE_KEY]: '{"day":"2026-11-24"}' }), NOW).size).toBe(0);
  });

  it("a non-numeric timestamp", () => {
    const day = localDayKey(NOW);
    const s = fakeStorage({ [DEPARTURE_WATCH_STATE_KEY]: JSON.stringify({ day, awaySince: { "visit-1": "soon" } }) });
    expect(loadAwaySince(s, NOW).size).toBe(0);
  });
});

describe("storage that is not available", () => {
  it("is survivable in both directions", () => {
    // A WebView with site data blocked throws on touching localStorage. The mirror is an
    // optimisation; losing it must never break the live watcher.
    expect(loadAwaySince(null, NOW).size).toBe(0);
    expect(() => saveAwaySince(null, new Map([["visit-1", NOW]]), NOW)).not.toThrow();
  });

  it("survives a storage that throws on write", () => {
    const hostile: WatchStateStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => saveAwaySince(hostile, new Map([["visit-1", NOW]]), NOW)).not.toThrow();
    expect(() => saveAwaySince(hostile, new Map(), NOW)).not.toThrow();
  });
});

describe("the time a resumed departure records", () => {
  it("is when the dwell elapsed, not when the app came back", () => {
    // THE POINT. The app was dead from 13:56 to 14:00. The run started at 13:55, so the dwell
    // completed at 13:58 -- two minutes before anything of ours was running again. Recording
    // "now" would pad the visit by those two minutes, and on a longer outage by much more.
    const awaySince = new Date("2026-11-24T13:55:00");
    const recorded = departureTimeFor(awaySince);
    expect(recorded.toISOString()).toBe(new Date("2026-11-24T13:58:00").toISOString());
    expect(recorded.getTime()).toBeLessThan(NOW.getTime());
  });

  it("is not awaySince itself, which would shorten every visit by three minutes", () => {
    // Arguably the truer moment they left, but moving to it would change durations in customers'
    // reports for reasons unrelated to this fix. Deliberately out of scope.
    const awaySince = new Date("2026-11-24T13:55:00");
    expect(departureTimeFor(awaySince).getTime() - awaySince.getTime()).toBe(DEPARTURE_SUSTAINED_MS);
  });
});

describe("localDayKey", () => {
  it("pads to yyyy-mm-dd so string comparison is the same as date comparison", () => {
    expect(localDayKey(new Date("2026-01-05T10:00:00"))).toBe("2026-01-05");
    expect(localDayKey(new Date("2026-11-24T10:00:00"))).toBe("2026-11-24");
  });
});
