import { describe, it, expect } from "vitest";
import { renderWelcomeEmail } from "@/lib/mail/welcome-email";

const base = {
  orgName: "Lindley's Pool & Spa Service",
  customerFirstName: "Jordan",
  activationUrl: "https://app.example.com/auth/callback?next=%2Freset-password",
};

const withPassword = {
  ...base,
  temporaryPassword: "swim-2026-temp",
  customerEmail: "jordan@example.com",
  portalLoginUrl: "https://app.example.com/portal/login",
};

describe("renderWelcomeEmail without a temporary password", () => {
  it("sends them to choose their own password", () => {
    const { html, text } = renderWelcomeEmail(base);
    expect(html).toContain("Choose Your Password");
    expect(text).toContain("Choose your password: https://app.example.com/auth/callback");
  });

  it("says nobody emails them a password, because nobody does any more", () => {
    const { html, text } = renderWelcomeEmail(base);
    expect(html).toContain("never sees it, and nobody emails you one");
    expect(text).toContain("never sees it, and nobody emails you one");
  });

  /**
   * "No account will be created unless you click" is standard invite-flow copy and was never true in
   * this app -- createCustomerLogin creates the Supabase account before the email goes out, with or
   * without a password. Telling someone to ignore it would leave them a live login they never knew about.
   */
  it("never tells the recipient to ignore it, in either variant", () => {
    for (const data of [base, withPassword]) {
      const { html, text } = renderWelcomeEmail(data);
      expect(html).not.toContain("safely ignore");
      expect(text).not.toContain("ignore it safely");
      expect(html).not.toContain("no account will be created");
      expect(text).not.toContain("no account is created");
      expect(text).toContain("ask them to remove it");
    }
  });
});

describe("renderWelcomeEmail with a temporary password", () => {
  it("shows the password and the address it belongs to, in both parts", () => {
    const { html, text } = renderWelcomeEmail(withPassword);
    expect(html).toContain("swim-2026-temp");
    expect(html).toContain("jordan@example.com");
    expect(text).toContain("Temporary password: swim-2026-temp");
    expect(text).toContain("Email:              jordan@example.com");
  });

  it("points at the portal sign-in page, not the staff login", () => {
    const { html, text } = renderWelcomeEmail(withPassword);
    expect(html).toContain("https://app.example.com/portal/login");
    expect(text).toContain("Sign in: https://app.example.com/portal/login");
  });

  it("says the password is temporary and will have to be replaced", () => {
    const { html, text } = renderWelcomeEmail(withPassword);
    expect(html).toContain("This password is temporary");
    expect(html).toContain("you'll be asked to choose your own");
    expect(text).toContain("This password is temporary");
    expect(text).toContain("you'll be asked to choose your own");
  });

  it("keeps the activation link available for anyone who would rather choose their own", () => {
    const { html, text } = renderWelcomeEmail(withPassword);
    expect(html).toContain(base.activationUrl.replace(/&/g, "&amp;"));
    expect(text).toContain(`Prefer to set it now instead? ${base.activationUrl}`);
  });

  /** The account already exists by then, so "ignore this email" would leave a live login the
   *  recipient never knew about. */
  it("escapes a password containing HTML, rather than emitting markup", () => {
    const { html } = renderWelcomeEmail({ ...withPassword, temporaryPassword: 'a<b>&"c' });
    expect(html).toContain("a&lt;b&gt;&amp;&quot;c");
    expect(html).not.toContain("<b>&");
  });

  it("refuses to send a password with nowhere to use it", () => {
    expect(() => renderWelcomeEmail({ ...withPassword, portalLoginUrl: null })).toThrow(/portalLoginUrl is required/);
    expect(() => renderWelcomeEmail({ ...withPassword, customerEmail: null })).toThrow(/customerEmail is required/);
  });

  it("refuses a non-https sign-in link, the same rule the activation link follows", () => {
    expect(() => renderWelcomeEmail({ ...withPassword, portalLoginUrl: "http://app.example.com/portal/login" })).toThrow(
      /must be https/,
    );
  });
});

describe("what the email claims the portal can do", () => {
  /**
   * Three of the four original lines were false: there is no billing in the portal, no way to request
   * service, and no way to message the company -- /portal/alerts is read-only and the only portal
   * actions are uploading and deleting a document. These assertions exist so a plausible-sounding
   * promise cannot be added back without a test failing.
   */
  it("promises a customer nothing the portal does not do", () => {
    const { html, text } = renderWelcomeEmail(base);
    for (const claim of ["billing", "Request service", "request service", "Message", "without picking up the phone"]) {
      expect(html).not.toContain(claim);
      expect(text).not.toContain(claim);
    }
  });

  /** The list feeds both halves, so an item built from a pre-escaped value leaks entities into the
   *  plain text -- which is what happened the first time this was written. */
  it("does not leak HTML entities into the plain-text half", () => {
    const { text, html } = renderWelcomeEmail({ ...base, orgName: "Lindley's Pool & Spa Service" });
    expect(text).toContain("Share documents with Lindley's Pool & Spa Service");
    expect(text).not.toContain("&#39;");
    expect(text).not.toContain("&amp;");
    // Still escaped where it must be.
    expect(html).toContain("Lindley&#39;s Pool &amp; Spa Service");
  });

  it("tells a customer the things that are real", () => {
    const { html } = renderWelcomeEmail(base);
    expect(html).toContain("photos your technician takes on-site");
    expect(html).toContain("compliance status");
    expect(html).toContain("scan the QR code");
  });
});

describe("renderWelcomeEmail for a maintenance login", () => {
  const maintenance = { ...base, audience: "MAINTENANCE" as const };

  it("describes the daily log, not the customer portal", () => {
    const { html, text } = renderWelcomeEmail(maintenance);
    expect(html).toContain("readings your state");
    expect(html).toContain("no more binder");
    expect(text).toContain("readings your state");
  });

  it("does not describe a portal they cannot open", () => {
    const { html, text } = renderWelcomeEmail(maintenance);
    for (const claim of ["service visits", "upcoming", "billing", "Request service"]) {
      expect(html).not.toContain(claim);
      expect(text).not.toContain(claim);
    }
  });

  it("names what they can actually reach: the log and the safety data sheets", () => {
    const { html } = renderWelcomeEmail(maintenance);
    expect(html).toContain("Record the readings your state requires");
    expect(html).toContain("Safety Data Sheets");
    expect(html).toContain("already been logged today");
  });

  /** An org's own intro was written to welcome a customer to the portal. */
  it("ignores the organization's custom customer intro", () => {
    const { html } = renderWelcomeEmail({ ...maintenance, introText: "Welcome to our family of pool owners!" });
    expect(html).not.toContain("family of pool owners");
    expect(html).toContain("readings your state");
  });

  it("still uses a custom intro for a customer login", () => {
    const { html } = renderWelcomeEmail({ ...base, introText: "Welcome to our family of pool owners!" });
    expect(html).toContain("family of pool owners");
  });
});
