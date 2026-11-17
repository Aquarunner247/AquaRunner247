import { describe, it, expect } from "vitest";
import {
  PORTAL_INVITE_STALLED_AFTER_DAYS,
  describePortalInvite,
  portalInviteAgeDays,
  portalInviteAgeLabel,
  stalledPortalInviteNote,
} from "@/lib/portal-invite-status";

/**
 * A customer asked whether the portal had a password. She had been invited ten days earlier, the
 * 48-hour activation link in that email had long expired, and nothing anywhere told the office she
 * was stuck. These cover the two things that made it invisible: an unopened invite reads the same
 * on day one as on day ten, and "not signed in yet" was being said about people who had signed in.
 */

const NOW = new Date("2026-11-16T22:00:00Z");
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("portalInviteAgeDays", () => {
  it("floors to whole days", () => {
    expect(portalInviteAgeDays(new Date("2026-11-16T02:00:00Z"), NOW)).toBe(0);
    expect(portalInviteAgeDays(new Date("2026-11-15T21:00:00Z"), NOW)).toBe(1);
    expect(portalInviteAgeDays(new Date("2026-11-06T17:55:00Z"), NOW)).toBe(10);
  });

  it("never reports a negative age", () => {
    // A row written by a server whose clock is a few seconds ahead must not read "-1 days ago".
    expect(portalInviteAgeDays(new Date(NOW.getTime() + 5000), NOW)).toBe(0);
  });
});

describe("portalInviteAgeLabel", () => {
  it("reads as English at the small numbers, where it matters most", () => {
    expect(portalInviteAgeLabel(NOW, NOW)).toBe("today");
    expect(portalInviteAgeLabel(daysBefore(1), NOW)).toBe("yesterday");
    expect(portalInviteAgeLabel(daysBefore(2), NOW)).toBe("2 days ago");
    expect(portalInviteAgeLabel(daysBefore(10), NOW)).toBe("10 days ago");
  });
});

describe("describePortalInvite", () => {
  it("says nothing about a login that has been opened", () => {
    const status = describePortalInvite({ createdAt: daysBefore(40), activatedAt: daysBefore(39), now: NOW });

    expect(status.opened).toBe(true);
    expect(status.stalled).toBe(false);
    // Null, not an empty string: there is nothing to report about a login that works, and the
    // caller renders nothing at all rather than an empty element.
    expect(status.label).toBeNull();
  });

  it("never claims the person has not signed in", () => {
    // The wording bug this replaces. Three of Lindley's four unactivated logins HAD authenticated
    // and set a password -- the activation link signs you in and lands on /reset-password, outside
    // the portal route group that stamps activatedAt. Only the stamp's real meaning is safe to say.
    const status = describePortalInvite({ createdAt: daysBefore(10), activatedAt: null, now: NOW });

    expect(status.label).toBe("hasn't opened the portal · invited 10 days ago");
    expect(status.label).not.toMatch(/signed in/i);
  });

  it("stays quiet about an invite too fresh to chase", () => {
    const today = describePortalInvite({ createdAt: NOW, activatedAt: null, now: NOW });
    const yesterday = describePortalInvite({ createdAt: daysBefore(1), activatedAt: null, now: NOW });

    // Both still get a label on the customer's own page -- it is the alerts bell that waits.
    expect(today.stalled).toBe(false);
    expect(yesterday.stalled).toBe(false);
    expect(today.label).toBe("hasn't opened the portal · invited today");
  });

  it("flags it once the emailed link is certainly dead", () => {
    const atThreshold = describePortalInvite({
      createdAt: daysBefore(PORTAL_INVITE_STALLED_AFTER_DAYS),
      activatedAt: null,
      now: NOW,
    });
    const justUnder = describePortalInvite({
      createdAt: daysBefore(PORTAL_INVITE_STALLED_AFTER_DAYS - 1),
      activatedAt: null,
      now: NOW,
    });

    expect(atThreshold.stalled).toBe(true);
    expect(justUnder.stalled).toBe(false);
  });

  it("waits until after the 48-hour link expiry, not before it", () => {
    // The threshold has to sit past expiry or the bell would chase an invite the customer can
    // still use. Two days is the expiry; the threshold is the first whole day after it.
    expect(PORTAL_INVITE_STALLED_AFTER_DAYS).toBeGreaterThan(2);
  });

  it("never marks an opened login as stalled, however old", () => {
    const status = describePortalInvite({ createdAt: daysBefore(400), activatedAt: daysBefore(399), now: NOW });
    expect(status.stalled).toBe(false);
  });
});

describe("stalledPortalInviteNote", () => {
  it("names the reason, so the fix is resending rather than waiting", () => {
    const note = stalledPortalInviteNote(10);

    expect(note).toContain("invited 10 days ago");
    expect(note).toContain("48 hours");
  });
});
