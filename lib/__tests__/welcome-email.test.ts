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
