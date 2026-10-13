import { describe, expect, it } from "vitest";
import { formatRouteSchedule, type RouteScheduleEntry } from "../customer-route-schedule";

const on = (dayOfWeek: number | null, technicianName: string | null = "Rodrigo Acevedo", routeName = "Route"): RouteScheduleEntry => ({
  routeName,
  technicianName,
  dayOfWeek,
});

describe("formatRouteSchedule", () => {
  it("lists every day, which is the whole point", () => {
    // Cornerstone Park's bodies are on four routes; the page used to show one.
    expect(formatRouteSchedule([on(5), on(1), on(6), on(3)])).toBe("Mon, Wed, Fri, Sat · Rodrigo Acevedo");
  });

  it("puts the days in week order regardless of the order they arrive", () => {
    expect(formatRouteSchedule([on(7), on(2)])).toBe("Tue, Sun · Rodrigo Acevedo");
  });

  it("names the technician once when every day is theirs", () => {
    expect(formatRouteSchedule([on(1), on(2)])).toBe("Mon, Tue · Rodrigo Acevedo");
  });

  it("groups the days by technician when they differ", () => {
    // Tailgate Beach Club: Rich four days, Steve on Sunday. Repeating the name after every day
    // read as "Mon (Rich), Thu (Rich), Fri (Rich), Sat (Rich), Sun (Steve)".
    expect(formatRouteSchedule([on(1, "Rich"), on(4, "Rich"), on(5, "Rich"), on(6, "Rich"), on(7, "Steve")])).toBe(
      "Mon, Thu, Fri, Sat (Rich) · Sun (Steve)",
    );
  });

  it("keeps technician groups in week order by their earliest day", () => {
    expect(formatRouteSchedule([on(7, "Steve"), on(2, "Rich")])).toBe("Tue (Rich) · Sun (Steve)");
  });

  it("drops the route name when a day is known, since routes here are named after their day", () => {
    expect(formatRouteSchedule([on(5, null, "Friday")])).toBe("Fri");
  });

  it("falls back to the route name when a route has no weekday", () => {
    expect(formatRouteSchedule([on(null, null, "Overflow")])).toBe("Overflow");
    expect(formatRouteSchedule([on(1, null, "Monday"), on(null, null, "Overflow")])).toBe("Mon, Overflow");
  });

  it("collapses a property-wide stop and a body stop on the same day into one entry", () => {
    expect(formatRouteSchedule([on(1), on(1)])).toBe("Mon · Rodrigo Acevedo");
  });

  it("is empty for a body on no route, so the caller can say so in its own words", () => {
    expect(formatRouteSchedule([])).toBe("");
  });

  it("handles a full week without repeating the technician seven times", () => {
    expect(formatRouteSchedule([1, 2, 3, 4, 5, 6, 7].map((d) => on(d)))).toBe(
      "Mon, Tue, Wed, Thu, Fri, Sat, Sun · Rodrigo Acevedo",
    );
  });
});
