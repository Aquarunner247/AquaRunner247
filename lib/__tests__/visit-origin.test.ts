import { describe, expect, it } from "vitest";
import { visitOriginLabel } from "@/lib/visit-origin";

/**
 * The failure this guards against is a confident wrong line, not a missing one.
 *
 * An admin reading "Added by hand · Breanna" on a stop the scheduler generated would stop looking
 * for the real reason, which is the opposite of why the field was added. So most of these cases
 * are about staying quiet.
 */

const NOTHING = { createdByName: null, recurringStopId: null, movedFromId: null };

describe("visitOriginLabel", () => {
  it("names the person who added a stop by hand", () => {
    expect(visitOriginLabel({ ...NOTHING, createdByName: "Breanna" })).toBe("Added by hand · Breanna");
  });

  it("says nothing about a stop the route generated", () => {
    // The case that matters most. Every stop on a normal day hits this, so a bug here puts a
    // spurious line on the entire schedule.
    expect(visitOriginLabel({ ...NOTHING, recurringStopId: "rs_1" })).toBeNull();
    // Even if a creator somehow exists on it: being on the route is the explanation.
    expect(visitOriginLabel({ createdByName: "Breanna", recurringStopId: "rs_1", movedFromId: null })).toBeNull();
  });

  it("calls a move a move, not a hand-add", () => {
    // The reschedule path sets BOTH createdById and movedFrom. "Added by hand" would describe a
    // deliberate push to another day as if someone had invented the stop.
    expect(visitOriginLabel({ createdByName: "Breanna", recurringStopId: null, movedFromId: "v_1" })).toBe(
      "Moved here · Breanna",
    );
  });

  it("still explains a move whose author is gone", () => {
    // createdById is ON DELETE SET NULL, so a departed staff member leaves the move with no name.
    // The move itself is still worth saying.
    expect(visitOriginLabel({ ...NOTHING, movedFromId: "v_1" })).toBe("Moved here");
  });

  it("stays silent when it genuinely cannot explain the stop", () => {
    // A row written before createdById existed, a portal reading, or a deleted author on a
    // hand-added stop. None of those supports "Added by hand", so none gets a line.
    expect(visitOriginLabel(NOTHING)).toBeNull();
    expect(visitOriginLabel({ ...NOTHING, createdByName: "" })).toBeNull();
  });
});
