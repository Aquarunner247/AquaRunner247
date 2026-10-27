import { describe, expect, it } from "vitest";
import { formatDurationMs, onSiteDuration, onSiteLabel, LINGER_AFTER_COMPLETION_MS } from "../mail/on-site-duration";

const at = (iso: string) => new Date(iso);

describe("onSiteDuration", () => {
  it("measures arrival to completion when completion follows the work closely", () => {
    // Paseo Del Prado, 2026-10-09: arrived 14:24, photo 15:28, completed 15:31.
    const d = onSiteDuration({
      startedAt: at("2026-10-09T21:24:00Z"),
      completedAt: at("2026-10-09T22:31:00Z"),
      lastPhotoAt: at("2026-10-09T22:28:00Z"),
    });
    expect(d).toEqual({ kind: "measured", ms: 67 * 60_000 });
  });

  it("falls back to the last photo when completion is a batch close-out hours later", () => {
    // The Alcove, 2026-10-09: arrived 12:52, last photo 13:46, completed 16:31.
    const d = onSiteDuration({
      startedAt: at("2026-10-09T19:52:00Z"),
      completedAt: at("2026-10-09T23:31:00Z"),
      lastPhotoAt: at("2026-10-09T20:46:00Z"),
    });
    expect(d).toEqual({ kind: "atLeast", ms: 54 * 60_000 });
  });

  it("says nothing when arrival was backfilled to the completion instant", () => {
    const t = at("2026-10-09T23:36:00Z");
    expect(onSiteDuration({ startedAt: t, completedAt: t, lastPhotoAt: at("2026-10-09T20:45:00Z") })).toEqual({
      kind: "unknown",
    });
  });

  it("says nothing when the only photo predates arrival", () => {
    // The shape a picked-up stop had before arrival started re-stamping on resume: the photo
    // belongs to the first attempt, so it measures nothing about this visit.
    expect(
      onSiteDuration({
        startedAt: at("2026-10-10T23:36:00Z"),
        completedAt: at("2026-10-10T23:40:00Z"),
        lastPhotoAt: at("2026-10-09T20:45:00Z"),
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("says nothing with no arrival at all", () => {
    expect(onSiteDuration({ startedAt: null, completedAt: at("2026-10-09T23:31:00Z"), lastPhotoAt: null })).toEqual({
      kind: "unknown",
    });
  });

  it("says nothing when there is no photo to fall back to", () => {
    expect(
      onSiteDuration({
        startedAt: at("2026-10-09T19:52:00Z"),
        completedAt: at("2026-10-09T23:31:00Z"),
        lastPhotoAt: null,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("never returns a negative span when completion precedes arrival", () => {
    expect(
      onSiteDuration({
        startedAt: at("2026-10-09T23:31:00Z"),
        completedAt: at("2026-10-09T19:52:00Z"),
        lastPhotoAt: null,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("treats a photo exactly at the tolerance edge as credible completion", () => {
    const d = onSiteDuration({
      startedAt: at("2026-10-09T19:00:00Z"),
      completedAt: at("2026-10-09T20:45:00Z"),
      lastPhotoAt: at("2026-10-09T20:00:00Z"),
    });
    expect(d.kind).toBe("measured");
  });
});

describe("a departure recorded after the stop was completed", () => {
  /**
   * The ordinary visit: arrive, work, tap Complete at the pool, drive away. Departure is stamped
   * after completion, and it is the better end of the visit -- Complete is a button press, and
   * this operator's technicians routinely press it in batches at the end of a route.
   */
  const startedAt = at("2026-10-27T16:00:00Z");

  it("measures arrival to departure, not arrival to the button press", () => {
    const d = onSiteDuration({
      startedAt,
      completedAt: at("2026-10-27T16:25:00Z"),
      lastPhotoAt: null,
      departedAt: at("2026-10-27T16:30:00Z"),
    });
    expect(d).toEqual({ kind: "measured", ms: 30 * 60_000 });
  });

  it("accepts a departure BEFORE completion, which is the batch-completion habit", () => {
    // Left at 16:25, tapped Complete from the truck at 17:10. Time on site is 25 minutes, and
    // the lingering window must not reject a negative span or this case reports nothing.
    const d = onSiteDuration({
      startedAt,
      completedAt: at("2026-10-27T17:10:00Z"),
      lastPhotoAt: null,
      departedAt: at("2026-10-27T16:25:00Z"),
    });
    expect(d).toEqual({ kind: "measured", ms: 25 * 60_000 });
  });

  it("stops counting once the device is describing lunch rather than service", () => {
    // Finished at 16:25 and still parked there at 18:00. Reporting 2 hours on site would turn a
    // lunch break into billable-looking presence in a customer's report.
    const lingered = onSiteDuration({
      startedAt,
      completedAt: at("2026-10-27T16:25:00Z"),
      lastPhotoAt: at("2026-10-27T16:20:00Z"),
      departedAt: at("2026-10-27T18:00:00Z"),
    });
    // Falls through to arrival-to-completion, which the photo check supports: 25 minutes.
    expect(lingered).toEqual({ kind: "measured", ms: 25 * 60_000 });
  });

  it("treats the boundary itself as still on site", () => {
    const completedAt = at("2026-10-27T16:25:00Z");
    const onBoundary = new Date(completedAt.getTime() + LINGER_AFTER_COMPLETION_MS);
    const d = onSiteDuration({ startedAt, completedAt, lastPhotoAt: null, departedAt: onBoundary });
    expect(d).toEqual({ kind: "measured", ms: onBoundary.getTime() - startedAt.getTime() });
  });

  it("reports the short visit honestly when the app was opened late", () => {
    // Arrival stamped at 16:24 because the technician opened the app on the way out. One minute
    // on site is what the app actually observed, and inventing a longer one would be a guess.
    const d = onSiteDuration({
      startedAt: at("2026-10-27T16:24:00Z"),
      completedAt: at("2026-10-27T16:25:00Z"),
      lastPhotoAt: null,
      departedAt: at("2026-10-27T16:25:30Z"),
    });
    expect(d).toEqual({ kind: "measured", ms: 90_000 });
  });
});

describe("onSiteLabel", () => {
  it("states a measured span plainly", () => {
    expect(
      onSiteLabel({
        startedAt: at("2026-10-09T21:24:00Z"),
        completedAt: at("2026-10-09T22:31:00Z"),
        lastPhotoAt: at("2026-10-09T22:28:00Z"),
      }),
    ).toBe("1h 7m on site");
  });

  it("qualifies a photo-derived span, because work continued after the photo by an unknown amount", () => {
    expect(
      onSiteLabel({
        startedAt: at("2026-10-09T19:52:00Z"),
        completedAt: at("2026-10-09T23:31:00Z"),
        lastPhotoAt: at("2026-10-09T20:46:00Z"),
      }),
    ).toBe("at least 54m on site");
  });

  it("is absent rather than invented when nothing supports it", () => {
    expect(onSiteLabel({ startedAt: null, completedAt: at("2026-10-09T23:31:00Z"), lastPhotoAt: null })).toBeUndefined();
  });
});

describe("formatDurationMs", () => {
  it.each([
    // Rounds, so "<1m" is under 30 seconds -- carried over verbatim from the previous fmtDuration.
    [20_000, "<1m"],
    [30_000, "1m"],
    [54 * 60_000, "54m"],
    [67 * 60_000, "1h 7m"],
    [120 * 60_000, "2h 0m"],
  ])("formats %ims as %s", (ms, expected) => {
    expect(formatDurationMs(ms)).toBe(expected);
  });
});
