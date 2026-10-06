import { describe, it, expect } from "vitest";
import {
  dueCutoffForTimeZone,
  taskDueState,
  parseDueOn,
  parseRemindDaysBefore,
  reminderDayFor,
  REMINDER_CHOICES,
} from "@/lib/customer-task-due";

const LAS_VEGAS = "America/Los_Angeles";
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe("dueCutoffForTimeZone", () => {
  /** 6pm Pacific is already tomorrow in UTC -- the mistake the compliance log actually made. */
  it("uses the organization's day, not the server's", () => {
    const sixPmPacific = new Date("2026-10-06T01:00:00.000Z"); // 2026-10-05 18:00 PDT
    expect(dueCutoffForTimeZone(sixPmPacific, LAS_VEGAS).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(dueCutoffForTimeZone(sixPmPacific, "UTC").toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });
});

describe("taskDueState", () => {
  const evening = new Date("2026-10-06T01:00:00.000Z"); // still 2026-10-05 in Nevada

  it("has no state without a due date", () => {
    expect(taskDueState(null, evening, LAS_VEGAS)).toBe("none");
    expect(taskDueState(undefined, evening, LAS_VEGAS)).toBe("none");
  });

  it("calls the organization's today 'today', all evening", () => {
    expect(taskDueState(day("2026-10-05"), evening, LAS_VEGAS)).toBe("today");
  });

  it("calls an earlier day overdue", () => {
    expect(taskDueState(day("2026-10-04"), evening, LAS_VEGAS)).toBe("overdue");
    expect(taskDueState(day("2026-09-01"), evening, LAS_VEGAS)).toBe("overdue");
  });

  it("calls a later day upcoming", () => {
    expect(taskDueState(day("2026-10-06"), evening, LAS_VEGAS)).toBe("upcoming");
  });

  /** The bug this guards: in UTC the same instant is already the 6th, so a to-do due today would read
   *  as overdue and tomorrow's would read as due now. */
  it("does not age a to-do early just because UTC has moved on", () => {
    expect(taskDueState(day("2026-10-05"), evening, "UTC")).toBe("overdue");
    expect(taskDueState(day("2026-10-05"), evening, LAS_VEGAS)).toBe("today");
  });

  it("holds through the standard-time change", () => {
    const novEvening = new Date("2026-11-11T02:00:00.000Z"); // 2026-11-10 18:00 PST
    expect(taskDueState(day("2026-11-10"), novEvening, LAS_VEGAS)).toBe("today");
    expect(taskDueState(day("2026-11-11"), novEvening, LAS_VEGAS)).toBe("upcoming");
  });
});

describe("parseDueOn", () => {
  it("takes what a date input submits, as a calendar day", () => {
    expect(parseDueOn("2026-10-09")?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("treats a blank or unparseable value as no deadline", () => {
    for (const raw of ["", "   ", "next tuesday", "10/09/2026", "2026-10", "2026-10-09T12:00:00Z"]) {
      expect(parseDueOn(raw)).toBeNull();
    }
  });

  /** A regex accepts these and a calendar does not -- Date would roll them into the next month. */
  it("rejects a date that does not exist", () => {
    expect(parseDueOn("2026-02-31")).toBeNull();
    expect(parseDueOn("2026-13-01")).toBeNull();
    expect(parseDueOn("2026-00-10")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseDueOn("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("parseRemindDaysBefore", () => {
  it("takes the offered choices", () => {
    for (const { days } of REMINDER_CHOICES) expect(parseRemindDaysBefore(String(days))).toBe(days);
  });

  /** A to-do that saved with a deadline and no reminder still works; one that refused to save does not. */
  it("falls back to the day itself rather than refusing", () => {
    for (const raw of ["", "  ", "soon", "-3", "NaN"]) expect(parseRemindDaysBefore(raw)).toBe(0);
  });

  it("caps an absurd lead time", () => {
    expect(parseRemindDaysBefore("3650")).toBe(14);
  });
});

describe("reminderDayFor", () => {
  const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

  it("counts back from the due date", () => {
    expect(reminderDayFor(day("2026-10-20"), 3)?.toISOString()).toBe("2026-10-17T00:00:00.000Z");
    expect(reminderDayFor(day("2026-10-20"), 7)?.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("is the due date itself with no lead time", () => {
    expect(reminderDayFor(day("2026-10-20"), 0)?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("crosses a month and a year boundary", () => {
    expect(reminderDayFor(day("2026-11-02"), 7)?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(reminderDayFor(day("2027-01-03"), 7)?.toISOString()).toBe("2026-12-27T00:00:00.000Z");
  });

  /** No deadline means no reminder day -- the bell shows those immediately instead. */
  it("has no reminder day without a due date", () => {
    expect(reminderDayFor(null, 7)).toBeNull();
  });

  it("never drifts past the due date on a negative lead time", () => {
    expect(reminderDayFor(day("2026-10-20"), -5)?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});
