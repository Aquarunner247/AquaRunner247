import { describe, expect, it, vi, beforeAll } from "vitest";
import { COLOR, EMAIL_COLOR } from "@/lib/design-tokens";

/**
 * Every transactional email renders in the shipping palette.
 *
 * They did not, for the whole life of the repalette: the mail templates kept the retired teal
 * (`#06333B`, `#0A6E7C`, `#F99486`, `#C4D9DA`) hardcoded while the product moved to navy,
 * cream and coral. Nothing caught it because nothing looked at the rendered output -- a
 * typechecker has no opinion about a hex in a string.
 *
 * So this captures what each sender actually hands Resend and inspects it. That also catches
 * the subtler failure introduced by fixing the first one: a `${COLOR.ink}` written inside a
 * normal double-quoted JS string is valid TypeScript and renders as the literal characters
 * `${COLOR.ink}` into the email. Two of those existed mid-change.
 */

// `server-only` is a bundler marker that throws when vitest loads it; lib/mail/email-branding.ts
// and lib/mail/from-address.ts both carry it. Nothing here runs in a browser, so it is a no-op.
vi.mock("server-only", () => ({}));

/** Captures the `html` of every message any sender tries to send. */
const sent: { html: string; subject: string }[] = [];

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (msg: { html: string; subject: string }) => {
        sent.push(msg);
        return { data: { id: "test" }, error: null };
      },
    };
  },
}));

// The senders bail out before building any markup when these are unset. The waitlist one also
// needs its own recipient variable, which is why it was the first to come back empty.
process.env.RESEND_API_KEY = "test-key";
process.env.WAITLIST_NOTIFICATION_EMAIL = "ops@example.com";

type Sender = { name: string; run: () => Promise<unknown> };

let senders: Sender[];

beforeAll(async () => {
  const m = await import("@/lib/email");
  const now = new Date("2026-10-23T18:00:00Z");
  senders = [
    { name: "waitlist", run: () => m.sendWaitlistNotificationEmail("someone@example.com") },
    {
      name: "phone-agent ticket",
      run: () =>
        m.sendPhoneAgentTicketEmail({
          to: "ops@example.com",
          organizationName: "Lindley's Pool & Spa",
          routedAs: "AFTER_HOURS",
          urgency: "URGENT",
          issueType: "GREEN_POOL",
          propertyAddress: "1 Example St",
          callerNumber: "+17025550101",
          callerName: "Pat",
          callerCallbackNumber: null,
          requestedCallbackTime: null,
          summary: "Pool is green",
          recordingUrl: "https://example.com/r.mp3",
          dashboardUrl: "https://example.com/d",
        }),
    },
    {
      name: "trial ending",
      run: () =>
        m.sendTrialEndingEmail({
          to: "admin@example.com",
          organizationName: "Lindley's Pool & Spa",
          trialEndsAt: now,
          daysLeft: 3,
          timeZone: "America/Los_Angeles",
          amountLabel: "$99.00",
          planLabel: "the Service plan",
          billingUrl: "https://example.com/billing",
        }),
    },
    {
      // The one that matters most: both stranded-interpolation bugs lived in this path, in the
      // per-body section builder and the readings strip. It is also the only sender that goes
      // through resolveEmailBranding, so it exercises the white-label defaults too.
      name: "service summary",
      run: () =>
        m.sendServiceSummaryEmail({
          to: "customer@example.com",
          branding: null,
          propertyName: "Paseo Del Prado",
          address: "1 Example St, Las Vegas NV",
          technicianName: "Rich",
          startedAt: new Date("2026-10-23T16:00:00Z"),
          completedAt: now,
          timeZone: "America/Los_Angeles",
          bodies: [
            {
              bodyOfWaterName: "Pool",
              usesBromine: false,
              reading: null,
              doses: [],
              checklistLabels: ["Skimmed", "Brushed"],
              techNotes: "All good",
              photos: [],
              completedAt: now,
              serviceMessage: "Everything looked healthy today.",
              outcome: "serviced",
            },
            {
              bodyOfWaterName: "Spa",
              usesBromine: true,
              reading: null,
              doses: [],
              checklistLabels: [],
              techNotes: null,
              photos: [],
              completedAt: now,
              serviceMessage: null,
              outcome: "skipped",
            },
          ],
        }),
    },
    {
      name: "cancellation scrub warning",
      run: () =>
        m.sendCancellationScrubWarningEmail({
          to: "admin@example.com",
          organizationName: "Lindley's Pool & Spa",
          scrubScheduledAt: now,
          timeZone: "America/Los_Angeles",
          billingUrl: "https://example.com/billing",
        }),
    },
  ];
});

/** Colours an email is allowed to contain: the palette, the email neutrals, and plain white. */
function allowedHexes(): Set<string> {
  const allowed = new Set<string>(["#FFFFFF", "#FFF"]);
  for (const v of Object.values(COLOR)) if (v.startsWith("#")) allowed.add(v.toUpperCase());
  for (const v of Object.values(EMAIL_COLOR)) allowed.add(v.toUpperCase());
  return allowed;
}

const RETIRED_TEAL = ["#06333B", "#0A6E7C", "#F99486", "#C4D9DA", "#55696C", "#9CC3C6", "#0F4750", "#E3EDEE"];

describe("the welcome email, which is rendered rather than sent", () => {
  it("has no stranded interpolation and no retired teal", async () => {
    const { renderWelcomeEmail } = await import("@/lib/mail/welcome-email");
    const { html } = renderWelcomeEmail({
      orgName: "Lindley's Pool & Spa",
      customerFirstName: "Pat",
      activationUrl: "https://example.com/activate",
    });
    // DEFAULT_PRIMARY_COLOR is a plain constant, not markup, so a token written into it lands
    // in the output verbatim. That happened.
    expect(html).not.toContain("${");
    for (const teal of RETIRED_TEAL) {
      expect(html.toUpperCase(), `welcome email still uses ${teal}`).not.toContain(teal);
    }
    expect(html).toContain(COLOR.primary);
  });
});

describe("transactional email palette", () => {
  it("renders every sender without a stranded template interpolation", async () => {
    for (const s of senders) {
      sent.length = 0;
      await s.run();
      expect(sent.length, `${s.name} sent nothing`).toBeGreaterThan(0);
      for (const msg of sent) {
        // The exact bug a typechecker cannot see: `${COLOR.ink}` inside a normal string.
        expect(msg.html, `${s.name} has a literal \${…} in its markup`).not.toContain("${");
      }
    }
  });

  it("uses no retired teal value", async () => {
    for (const s of senders) {
      sent.length = 0;
      await s.run();
      for (const msg of sent) {
        for (const teal of RETIRED_TEAL) {
          expect(msg.html.toUpperCase(), `${s.name} still uses ${teal}`).not.toContain(teal);
        }
      }
    }
  });

  it("uses only colours that exist in the palette or the email neutrals", async () => {
    const allowed = allowedHexes();
    for (const s of senders) {
      sent.length = 0;
      await s.run();
      for (const msg of sent) {
        // Exactly 3 or 6 digits, and not preceded by `&` -- otherwise an HTML numeric entity
        // like `&#10003;` (the checkmark in the service summary) reads as a colour.
        const used = [
          ...new Set(
            [...msg.html.matchAll(/(?<!&)#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g)].map((m) => m[0].toUpperCase()),
          ),
        ];
        const unknown = used.filter((h) => !allowed.has(h));
        expect(unknown, `${s.name} uses colours from no palette: ${unknown.join(", ")}`).toEqual([]);
      }
    }
  });
});
