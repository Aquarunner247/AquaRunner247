import { describe, expect, it } from "vitest";
import {
  trialReminderDecision,
  daysUntilTrialEnds,
  TRIAL_REMINDER_LEAD_DAYS,
  type TrialReminderCandidate,
} from "@/lib/trial-reminder";

const NOW = new Date("2026-10-22T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** A trial ending `days` from NOW, with nothing sent yet. */
function org(days: number, overrides: Partial<TrialReminderCandidate> = {}): TrialReminderCandidate {
  return {
    planStatus: "TRIALING",
    trialEndsAt: new Date(NOW.getTime() + days * DAY),
    trialReminderSentAt: null,
    ...overrides,
  };
}

describe("trialReminderDecision", () => {
  it("sends inside the lead window", () => {
    expect(trialReminderDecision(org(TRIAL_REMINDER_LEAD_DAYS - 0.5), NOW)).toEqual({ send: true });
    expect(trialReminderDecision(org(1), NOW)).toEqual({ send: true });
  });

  it("sends exactly at the lead boundary", () => {
    // The cron runs once a day, so a trial that is exactly LEAD_DAYS out on one run and
    // slightly under on the next must not fall through the gap on both.
    expect(trialReminderDecision(org(TRIAL_REMINDER_LEAD_DAYS), NOW)).toEqual({ send: true });
  });

  it("waits while the trial is further out than the lead window", () => {
    expect(trialReminderDecision(org(TRIAL_REMINDER_LEAD_DAYS + 0.01), NOW)).toEqual({
      send: false,
      reason: "too-early",
    });
    expect(trialReminderDecision(org(13), NOW)).toEqual({ send: false, reason: "too-early" });
  });

  it("never emails an organization that is not trialing", () => {
    // Telling somebody who already converted, or who cancelled, that they are about to be
    // charged is worse than saying nothing.
    for (const planStatus of ["ACTIVE", "PAST_DUE", "CANCELED", "COMPED"] as const) {
      expect(trialReminderDecision(org(1, { planStatus }), NOW), planStatus).toEqual({
        send: false,
        reason: "not-trialing",
      });
    }
  });

  it("sends once and then never again", () => {
    const candidate = org(1);
    expect(trialReminderDecision(candidate, NOW)).toEqual({ send: true });
    const afterSend = { ...candidate, trialReminderSentAt: NOW };
    expect(trialReminderDecision(afterSend, NOW)).toEqual({ send: false, reason: "already-sent" });
    // Still suppressed a day later, when the daily sweep comes round again.
    expect(trialReminderDecision(afterSend, new Date(NOW.getTime() + DAY))).toEqual({
      send: false,
      reason: "already-sent",
    });
  });

  it("does not email about a trial that has already ended", () => {
    // This is what keeps the column's NULL default from mailing every organization that ever
    // trialed the moment this ships. A warning about a charge that already happened is noise.
    expect(trialReminderDecision(org(-0.001), NOW)).toEqual({ send: false, reason: "trial-over" });
    expect(trialReminderDecision(org(-30), NOW)).toEqual({ send: false, reason: "trial-over" });
    expect(trialReminderDecision(org(0), NOW)).toEqual({ send: false, reason: "trial-over" });
  });

  it("skips an organization with no trial end date", () => {
    // The dev path with no Stripe price configured creates an org with trialEndsAt null.
    expect(trialReminderDecision(org(1, { trialEndsAt: null }), NOW)).toEqual({
      send: false,
      reason: "no-trial-end",
    });
  });

  it("reports status before anything else, so a cancelled org never looks merely early", () => {
    const cancelledAndFarOut = org(10, { planStatus: "CANCELED" });
    expect(trialReminderDecision(cancelledAndFarOut, NOW)).toEqual({
      send: false,
      reason: "not-trialing",
    });
  });

  it("covers a whole 14-day trial with exactly one send", () => {
    // Walk a real trial day by day the way the daily cron would, carrying the sent marker
    // forward, and count the sends. More than one is a customer getting nagged; zero is a
    // promise in the Terms going unkept.
    const trialEndsAt = new Date(NOW.getTime() + 14 * DAY);
    let sentAt: Date | null = null;
    const sendDays: number[] = [];
    for (let day = 0; day <= 14; day++) {
      const today = new Date(NOW.getTime() + day * DAY);
      const decision = trialReminderDecision(
        { planStatus: "TRIALING", trialEndsAt, trialReminderSentAt: sentAt },
        today,
      );
      if (decision.send) {
        sendDays.push(day);
        sentAt = today;
      }
    }
    expect(sendDays).toEqual([11]);
    // Day 11 of 14 is three days before the end, which is the promise.
    expect((trialEndsAt.getTime() - (NOW.getTime() + 11 * DAY)) / DAY).toBe(TRIAL_REMINDER_LEAD_DAYS);
  });
});

describe("daysUntilTrialEnds", () => {
  it("rounds up, so a customer is never told they have less time than they do", () => {
    expect(daysUntilTrialEnds(new Date(NOW.getTime() + 2.1 * DAY), NOW)).toBe(3);
    expect(daysUntilTrialEnds(new Date(NOW.getTime() + 3 * DAY), NOW)).toBe(3);
    expect(daysUntilTrialEnds(new Date(NOW.getTime() + 0.2 * DAY), NOW)).toBe(1);
  });

  it("never goes negative", () => {
    expect(daysUntilTrialEnds(new Date(NOW.getTime() - 5 * DAY), NOW)).toBe(0);
  });
});
