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
  it("still sends the activation-link email", () => {
    const { html, text } = renderWelcomeEmail(base);
    expect(html).toContain("Activate Your Account");
    expect(text).toContain("Activate your account: https://app.example.com/auth/callback");
  });

  it("tells the recipient nothing exists yet, because nothing does", () => {
    const { text } = renderWelcomeEmail(base);
    expect(text).toContain("no account is created unless you click");
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
  it("does not tell the recipient to ignore it", () => {
    const { html, text } = renderWelcomeEmail(withPassword);
    expect(html).not.toContain("no account will be created");
    expect(text).not.toContain("no account is created");
    expect(text).toContain("ask them to remove it");
  });

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
