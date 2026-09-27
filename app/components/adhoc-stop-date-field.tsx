"use client";

import { useState } from "react";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats "YYYY-MM-DD" for display without timezone drift: the string is a calendar date,
 * so it's parsed at UTC midnight and rendered in UTC. Formatting it in the viewer's local
 * zone would name the previous day for anyone behind UTC -- the same class of mistake that
 * made addAdHocStop store extra stops a day early.
 */
function describeYmd(ymd: string): string | null {
  if (!YMD_RE.test(ymd)) return null;
  const parsed = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type Props = {
  /** The day currently on screen, used as the default. */
  defaultYmd: string;
};

/**
 * Date picker for the Extra stops forms, with a live "Adding to <weekday>" readout.
 *
 * These forms used to post a hidden scheduledDate fixed to the day being viewed, so the
 * only way to add a stop to a future day was to navigate there first -- and nothing on
 * screen said which day you were adding to. Someone on Saturday intending Monday got
 * Saturday with no indication. The weekday is spelled out rather than just the date
 * because "Monday" is what the person is actually thinking in.
 */
export function AdHocStopDateField({ defaultYmd }: Props) {
  const [ymd, setYmd] = useState(defaultYmd);
  const described = describeYmd(ymd);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="adhoc-stop-date" className="text-xs font-semibold uppercase tracking-wide text-brand-ink">
        Date
      </label>
      <input
        id="adhoc-stop-date"
        name="scheduledDate"
        type="date"
        required
        value={ymd}
        onChange={(e) => setYmd(e.currentTarget.value)}
        className="app-field w-auto"
      />
      {/* Solid ink, not muted: both callers sit this on brand-foam, and 12px muted-on-foam is
          the pairing the outdoor-legibility rule excludes -- this label is the whole point of
          the field, so it has to be readable on a phone in the sun. */}
      <p className="text-xs font-medium text-brand-ink">{described ? `Adding to ${described}` : "Pick a date"}</p>
    </div>
  );
}
