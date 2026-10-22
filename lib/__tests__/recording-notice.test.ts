import { describe, expect, it, vi } from "vitest";

// Both modules under test reach the database and the mailer at import time, through
// lib/prisma.ts (which throws without DATABASE_URL) and lib/email.ts (which pulls in a
// `server-only` module vitest refuses to load). Nothing under test touches either --
// phoneTreeTwiml and conversationalAiTwiml are pure TwiML builders -- so the chain is
// stubbed rather than stood up.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email", () => ({ sendPhoneAgentTicketEmail: () => Promise.resolve({ ok: true }) }));

import { RECORDING_NOTICE } from "@/lib/phone-agent";
import { phoneTreeTwiml } from "@/lib/phone-agent-flow";
import { conversationalAiTwiml } from "@/lib/conversational-ai";

/**
 * Nevada (NRS 200.620) and California (CIPA s.632.7) both require all-party consent to
 * record a phone call, and this notice is the only place a caller is ever asked -- they
 * never see the Privacy Policy. These tests exist because the failure mode is silent: the
 * notice still "works" if it is moved after the <Gather> or the conference join, it just
 * stops being consent. Position is the thing under test, not presence.
 */

/** The notice is spoken sentence-by-sentence through <prosody>, so the rendered TwiML never
 * contains the constant as one string. Compare on the first few words instead. */
const NOTICE_OPENING = RECORDING_NOTICE.split(/(?<=[.?!])\s+/)[0];

/** Asserts the notice is present AND precedes `laterMarker`. The presence check is not
 * redundant: `indexOf` returns -1 for an absent needle, and -1 is less than every real
 * index, so an ordering assertion on its own passes when the notice is missing entirely --
 * which is the exact regression these tests exist to catch. */
function expectNoticeBefore(twiml: string, laterMarker: string, label?: string) {
  const noticeAt = twiml.indexOf(NOTICE_OPENING);
  expect(noticeAt, label).toBeGreaterThan(-1);
  expect(noticeAt, label).toBeLessThan(twiml.indexOf(laterMarker));
}

const SETTINGS = { afterHoursGreeting: null, busyOverflowGreeting: null };

describe("recording notice", () => {
  describe("phone-tree path", () => {
    it("speaks the notice before the <Gather> opens, on every route reason", () => {
      for (const routedAs of ["AFTER_HOURS", "BUSY_OVERFLOW"] as const) {
        const twiml = phoneTreeTwiml(SETTINGS, routedAs, "https://example.com/gather", false);
        // Speech reaching a <Gather input="speech"> is already capture, so the notice has
        // to be fully spoken before the gather element starts.
        expectNoticeBefore(twiml, "<Gather", routedAs);
      }
    });

    it("still leads for a caller recognized by caller ID, whose greeting is replaced wholesale", () => {
      // RECOGNIZED_CALLER_PROMPT replaces the greeting rather than being appended to it,
      // which is exactly the branch a notice bolted onto the greeting would have missed.
      const twiml = phoneTreeTwiml(SETTINGS, "AFTER_HOURS", "https://example.com/gather", true);
      expectNoticeBefore(twiml, "<Gather");
      expect(twiml).toContain("we recognize the number");
    });

    it("is not suppressed by an organization's own custom greeting", () => {
      const twiml = phoneTreeTwiml(
        { afterHoursGreeting: "Thanks for calling Lindley's.", busyOverflowGreeting: null },
        "AFTER_HOURS",
        "https://example.com/gather",
        false,
      );
      expectNoticeBefore(twiml, "Thanks for calling");
    });
  });

  describe("conversational-AI path", () => {
    it("speaks the notice before the caller joins the recorded conference", () => {
      const twiml = conversationalAiTwiml("conf-abc", "https://example.com/join");
      const noticeAt = twiml.indexOf(RECORDING_NOTICE);
      expect(noticeAt).toBeGreaterThan(-1);
      // The conference records from the start AND streams caller audio to OpenAI, so the
      // join is the point of no return.
      expect(noticeAt).toBeLessThan(twiml.indexOf("<Dial"));
      expect(twiml).toContain('record="record-from-start"');
    });

    it("does not rely on the model to say it", () => {
      // The notice must be Twilio <Say>, not an instruction the Realtime model may or may
      // not follow. If this ever moves into buildRealtimeInstructions, consent becomes
      // probabilistic.
      const twiml = conversationalAiTwiml("conf-abc", "https://example.com/join");
      expect(twiml).toMatch(/<Say[^>]*>[^<]*Just so you know/);
    });
  });

  it("tells the caller what to do if they object", () => {
    // An all-party-consent notice that offers no way out is not consent.
    expect(RECORDING_NOTICE.toLowerCase()).toContain("hang up");
  });
});
