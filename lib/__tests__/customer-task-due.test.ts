import { describe, it, expect } from "vitest";
import { dueCutoffForTimeZone, taskDueState, parseDueOn } from "@/lib/customer-task-due";

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
