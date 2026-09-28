import "server-only";

/**
 * Shared branding chrome for customer-facing emails.
 *
 * lib/mail/welcome-email.ts worked this out first -- validate the hex, validate the logo URL,
 * fall back to platform defaults, and pick logo-fallback text colour against the header band.
 * Three more customer-facing emails in lib/email.ts need exactly the same treatment
 * (service summary, customer alert, access ended), and copying that logic four times is how
 * one of them ends up sending an unvalidated logo URL or unreadable text.
 *
 * Deliberately NOT applied to internal emails -- waitlist notifications, phone-agent tickets and
 * the cancellation-scrub warning go to the operator or to us, not to a customer, so they keep the
 * platform's own identity.
 */

export const DEFAULT_EMAIL_PRIMARY_COLOR = "#0A6E7C";
export const DEFAULT_EMAIL_HEADER_COLOR = "#06333B";

export type EmailBrandingInput = {
  /** The organization's own name -- replaces the platform name in the footer when branded. */
  orgName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  headerColor?: string | null;
};

export type ResolvedEmailBranding = {
  orgName: string;
  primaryColor: string;
  headerColor: string;
  /** Ready-to-inject markup: the logo image, or the org name as text when none is uploaded. */
  logoBlock: string;
  /** Footer attribution -- the org's name when branded, the platform's when not. */
  footerAttribution: string;
};

export function escapeEmailHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A logo URL reaches an inbox, where it can't be sanitized after the fact, so anything but an
 * https URL is refused rather than degraded. Mirrors welcome-email.ts's assertValidLogoUrl,
 * minus its blob: allowance, which exists only for that page's local upload preview.
 */
function isSafeLogoUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * `branding` null (or an org not on a tier that includes white-labelling) yields the platform's
 * own look -- the same "stop applying stored branding the moment the tier lapses" rule the portal
 * layout and welcome email already follow, rather than leaving a downgraded org branded.
 */
export function resolveEmailBranding(branding: EmailBrandingInput | null): ResolvedEmailBranding {
  const primaryColor = branding?.primaryColor && HEX.test(branding.primaryColor) ? branding.primaryColor : DEFAULT_EMAIL_PRIMARY_COLOR;
  const headerColor = branding?.headerColor && HEX.test(branding.headerColor) ? branding.headerColor : DEFAULT_EMAIL_HEADER_COLOR;

  if (!branding) {
    return {
      orgName: "AquaRunner 24/7 Pro",
      primaryColor,
      headerColor,
      logoBlock: "",
      footerAttribution: "This is an automated summary from AquaRunner 24/7 Pro.",
    };
  }

  const orgName = escapeEmailHtml(branding.orgName);
  const logoBlock =
    branding.logoUrl && isSafeLogoUrl(branding.logoUrl)
      ? `<img src="${escapeEmailHtml(branding.logoUrl)}" alt="${orgName}" width="120" style="display:block;border:0;outline:none;text-decoration:none;max-width:120px;height:auto;margin:0 0 12px;" />`
      : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;margin:0 0 8px;">${orgName}</div>`;

  return {
    orgName,
    primaryColor,
    headerColor,
    logoBlock,
    footerAttribution: `This is an automated summary from ${orgName}.`,
  };
}
