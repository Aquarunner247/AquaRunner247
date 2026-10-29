import { describe, expect, it } from "vitest";
import {
  BACKGROUND_LOCATION_DISCLOSURE,
  BACKGROUND_LOCATION_DISCLOSURE_KEY,
  needsBackgroundLocationDisclosure,
  recordBackgroundLocationDisclosureAccepted,
  BACKGROUND_LOCATION_ALWAYS_HINT,
  needsAlwaysAllowHint,
  recordBackgroundLocationProven,
  type DisclosureStorage,
} from "@/lib/background-location-disclosure";

/**
 * The wording here is a Play policy artefact, not copy. Each assertion below maps to something a
 * reviewer checks for, and the whole point of testing a string is to stop somebody tightening it
 * into a rejection later.
 */

function fakeStorage(initial: Record<string, string> = {}): DisclosureStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

describe("the disclosure text", () => {
  const all = [BACKGROUND_LOCATION_DISCLOSURE.title, ...BACKGROUND_LOCATION_DISCLOSURE.body].join(" ");

  it("says location data is collected in the background, in the phrasing reviewers look for", () => {
    expect(all).toContain("collects location data");
    expect(all).toContain("even when the app is closed or not in use");
  });

  it("names the app and what the data is for", () => {
    expect(all).toContain("AquaRunner");
    expect(all.toLowerCase()).toContain("arrive");
  });

  it("offers an affirmative accept and a way out", () => {
    // Play requires accepting to be an action, not a dismissal.
    expect(BACKGROUND_LOCATION_DISCLOSURE.accept.length).toBeGreaterThan(0);
    expect(BACKGROUND_LOCATION_DISCLOSURE.decline.length).toBeGreaterThan(0);
    expect(BACKGROUND_LOCATION_DISCLOSURE.accept).not.toBe(BACKGROUND_LOCATION_DISCLOSURE.decline);
  });

  it("does not promise more than the app does", () => {
    // These match the Privacy Policy and EULA. If the app's behaviour changes, this fails here
    // before a customer finds the difference.
    expect(all).toContain("no position attached");
    expect(all.toLowerCase()).toContain("discarded");
  });
});

describe("remembering the acceptance", () => {
  it("asks until it is accepted", () => {
    const s = fakeStorage();
    expect(needsBackgroundLocationDisclosure(s)).toBe(true);
    recordBackgroundLocationDisclosureAccepted(s);
    expect(needsBackgroundLocationDisclosure(s)).toBe(false);
    expect(s.data[BACKGROUND_LOCATION_DISCLOSURE_KEY]).toBe("accepted");
  });

  it("asks again when storage is unavailable or throws", () => {
    // Private mode, blocked site data, a WebView with storage off. Showing it twice costs a tap;
    // skipping it costs the listing.
    expect(needsBackgroundLocationDisclosure(null)).toBe(true);
    const throwing: DisclosureStorage = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    };
    expect(needsBackgroundLocationDisclosure(throwing)).toBe(true);
    expect(() => recordBackgroundLocationDisclosureAccepted(throwing)).not.toThrow();
  });

  it("does not lock somebody out for declining once", () => {
    // A decline is not recorded, so opening a route tomorrow asks again.
    const s = fakeStorage();
    expect(needsBackgroundLocationDisclosure(s)).toBe(true);
    expect(needsBackgroundLocationDisclosure(s)).toBe(true);
  });
});

describe("the Allow-all-the-time hint", () => {
  const all = [BACKGROUND_LOCATION_ALWAYS_HINT.title, BACKGROUND_LOCATION_ALWAYS_HINT.body].join(" ");

  it("names the exact setting Android hides", () => {
    // A technician has to recognise the words on the settings screen. Paraphrasing them is how
    // this stops being actionable.
    expect(all).toContain("Allow all the time");
    expect(all).toContain("While using the app");
  });

  it("says what breaks, not just what to tap", () => {
    expect(all.toLowerCase()).toContain("locks");
  });

  it("offers no way to dismiss it", () => {
    // A notice about a thing that is silently broken must not be clearable by somebody who has
    // not fixed it.
    expect(Object.keys(BACKGROUND_LOCATION_ALWAYS_HINT)).not.toContain("dismiss");
  });

  it("clears only on proof that background location works, and cannot be tapped away", () => {
    // The point of the change: a Done button let somebody retire the notice without changing
    // anything, and nothing visible changes when background location is missing.
    const s = fakeStorage();
    expect(needsAlwaysAllowHint(s)).toBe(true);
    recordBackgroundLocationProven(s);
    expect(needsAlwaysAllowHint(s)).toBe(false);
    // Proving background location is not accepting the disclosure -- different gates.
    expect(needsBackgroundLocationDisclosure(s)).toBe(true);
  });

  it("shows again when storage is unavailable", () => {
    expect(needsAlwaysAllowHint(null)).toBe(true);
  });
});
