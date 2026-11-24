import { describe, expect, it } from "vitest";
import {
  ADMIN_TOURS,
  ADMIN_TOUR_SECTIONS,
  MAINTENANCE_TOUR_SECTIONS,
  PORTAL_TOURS,
  PORTAL_TOUR_SECTIONS,
  TECHNICIAN_TOURS,
  TECHNICIAN_TOUR_SECTIONS,
  portalTourSectionsFor,
  tourSectionsForRole,
} from "@/lib/onboarding-tour-steps";
import { canOpenPortalPath } from "@/lib/portal-access";

/**
 * The bug these guard against shipped silently and stayed shipped.
 *
 * Ten admin tours existed; each fired once on first arrival at its own page and was then
 * unreachable, because the one "Replay tour" button hardcoded `/dashboard`. Nothing failed, nothing
 * logged, and the Settings copy was honest about the dashboard -- so the only symptom was nine
 * tours nobody could ever see again. A list of replayable sections has exactly that failure mode
 * the moment it falls behind the tours themselves, which is what these assert against.
 */
describe("replayable tour sections", () => {
  it("offers every admin tour that has a static page", () => {
    expect(ADMIN_TOUR_SECTIONS.map((s) => s.path).sort()).toEqual(Object.keys(ADMIN_TOURS).sort());
  });

  it("offers every technician tour that has a static page", () => {
    expect(TECHNICIAN_TOUR_SECTIONS.map((s) => s.path).sort()).toEqual(Object.keys(TECHNICIAN_TOURS).sort());
  });

  it("points every section at a tour that actually has steps", () => {
    for (const section of ADMIN_TOUR_SECTIONS) {
      expect(ADMIN_TOURS[section.path]?.length ?? 0).toBeGreaterThan(0);
    }
    for (const section of TECHNICIAN_TOUR_SECTIONS) {
      expect(TECHNICIAN_TOURS[section.path]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("starts a full run on the page people land on after signing in", () => {
    // The chain walks the list in order, so the first entry is where "Replay the whole tour" goes.
    expect(ADMIN_TOUR_SECTIONS[0]?.path).toBe("/dashboard");
    expect(TECHNICIAN_TOUR_SECTIONS[0]?.path).toBe("/dashboard");
  });

  it("lists no path twice, since a run would then revisit or stall", () => {
    for (const list of [ADMIN_TOUR_SECTIONS, TECHNICIAN_TOUR_SECTIONS]) {
      expect(new Set(list.map((s) => s.path)).size).toBe(list.length);
    }
  });

  it("labels every section", () => {
    for (const list of [ADMIN_TOUR_SECTIONS, TECHNICIAN_TOUR_SECTIONS]) {
      for (const section of list) expect(section.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives OFFICE nothing to replay, because it has no tour to replay", () => {
    expect(tourSectionsForRole("OFFICE")).toBeNull();
    expect(tourSectionsForRole("ADMIN")).toBe(ADMIN_TOUR_SECTIONS);
    expect(tourSectionsForRole("TECHNICIAN")).toBe(TECHNICIAN_TOUR_SECTIONS);
  });

  it("covers every portal tour across the two audiences", () => {
    const offered = new Set([...PORTAL_TOUR_SECTIONS, ...MAINTENANCE_TOUR_SECTIONS].map((s) => s.path));
    expect([...offered].sort()).toEqual(Object.keys(PORTAL_TOURS).sort());
  });

  it("points every portal section at a tour that actually has steps", () => {
    for (const section of [...PORTAL_TOUR_SECTIONS, ...MAINTENANCE_TOUR_SECTIONS]) {
      expect(PORTAL_TOURS[section.path]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /**
   * The one that matters. A maintenance login is served only the log, the safety sheets and its own
   * account page; a run that walked the customer sections would redirect it out of the tour at
   * /portal, which looks like the tour crashing. Asserted against portal-access itself rather than
   * a copy of the list, so widening MAINTENANCE_PATHS without revisiting the tour fails here.
   */
  it("never offers a maintenance login a section it would be redirected away from", () => {
    for (const section of MAINTENANCE_TOUR_SECTIONS) {
      expect(canOpenPortalPath("MAINTENANCE", section.path)).toBe(true);
    }
    const unreachable = PORTAL_TOUR_SECTIONS.filter((s) => !canOpenPortalPath("MAINTENANCE", s.path));
    expect(unreachable.length).toBeGreaterThan(0);
    expect(portalTourSectionsFor(true)).toBe(MAINTENANCE_TOUR_SECTIONS);
    expect(portalTourSectionsFor(false)).toBe(PORTAL_TOUR_SECTIONS);
  });

  it("starts each portal audience on the page it lands on after signing in", () => {
    expect(PORTAL_TOUR_SECTIONS[0]?.path).toBe("/portal");
    expect(MAINTENANCE_TOUR_SECTIONS[0]?.path).toBe("/portal/log");
  });
});
