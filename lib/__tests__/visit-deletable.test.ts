import { describe, expect, it } from "vitest";
import {
  visitDeletionRefusal,
  looksHandAdded,
  DELETION_REFUSAL_MESSAGE,
  type DeletableVisit,
} from "@/lib/visit-deletable";

/**
 * Deletion destroys a service record, so almost every case here is about refusing. The one
 * allowed case is narrow on purpose: a hand-added stop that nobody has touched.
 */

const NOW = new Date("2026-10-29T15:00:00Z");

/** The case this feature exists for: added by hand, untouched. */
function handAdded(overrides: Partial<DeletableVisit> = {}): DeletableVisit {
  return {
    recurringStopId: null,
    createdById: "user-steve",
    status: "SCHEDULED",
    startedAt: null,
    completedAt: null,
    childRecordCount: 0,
    movedFromId: null,
    ...overrides,
  };
}

describe("visitDeletionRefusal", () => {
  it("allows deleting a hand-added stop nobody has touched", () => {
    expect(visitDeletionRefusal(handAdded())).toBeNull();
  });

  it("refuses a stop the route generated", () => {
    // The important refusal. A generated stop that nobody serviced is a MISS, and Skipped is the
    // honest record of it -- deleting it would quietly improve the day's numbers.
    expect(visitDeletionRefusal(handAdded({ recurringStopId: "rs_1" }))).toBe("on-the-route");
  });

  it("refuses when there is no creator to attribute it to", () => {
    // Predates createdById, or came from the portal or a CSV import. None is a hand-add being
    // undone, and guessing wrong deletes a real record.
    expect(visitDeletionRefusal(handAdded({ createdById: null }))).toBe("not-hand-added");
  });

  it("refuses when readings, chemicals or photos exist", () => {
    expect(visitDeletionRefusal(handAdded({ childRecordCount: 1 }))).toBe("work-recorded");
  });

  it("refuses once a technician has arrived, or finished", () => {
    expect(visitDeletionRefusal(handAdded({ startedAt: NOW, status: "IN_PROGRESS" }))).toBe("already-started");
    expect(visitDeletionRefusal(handAdded({ completedAt: NOW, status: "COMPLETED" }))).toBe("already-started");
    // Skipped is a decision somebody made. Deleting it erases that decision.
    expect(visitDeletionRefusal(handAdded({ status: "CANCELLED" }))).toBe("already-started");
  });

  it("refuses the landing side of a move", () => {
    // The original row points here and reads "Moved". Delete this and it describes a day that no
    // longer exists.
    expect(visitDeletionRefusal(handAdded({ movedFromId: "v_1" }))).toBe("is-a-move");
  });

  it("explains a route stop as a route stop even when other reasons also apply", () => {
    // A generated visit has no createdById either. The reason shown should be the one that
    // actually helps.
    const generated = handAdded({ recurringStopId: "rs_1", createdById: null, childRecordCount: 3 });
    expect(visitDeletionRefusal(generated)).toBe("on-the-route");
  });

  it("has a usable message for every refusal it can return", () => {
    // A refusal code with no message would reach somebody as a blank dialog.
    const reasons = ["on-the-route", "not-hand-added", "work-recorded", "already-started", "is-a-move"] as const;
    for (const r of reasons) {
      expect(DELETION_REFUSAL_MESSAGE[r], r).toBeTruthy();
      expect(DELETION_REFUSAL_MESSAGE[r].length, r).toBeGreaterThan(20);
    }
  });
});

describe("looksHandAdded", () => {
  it("is true only for a stop with a creator and no recurring stop", () => {
    expect(looksHandAdded({ recurringStopId: null, createdById: "u1" })).toBe(true);
    expect(looksHandAdded({ recurringStopId: "rs", createdById: "u1" })).toBe(false);
    expect(looksHandAdded({ recurringStopId: null, createdById: null })).toBe(false);
  });
});
