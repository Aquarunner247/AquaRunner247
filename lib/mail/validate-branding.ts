/**
 * validate-branding.ts
 *
 * Server-side validation for tenant-supplied org branding (shared by the customer portal
 * and the welcome email) and welcome-email-only settings. Call these in the settings
 * server actions BEFORE writing to the database -- never trust that the admin UI enforced
 * these rules client-side.
 *
 * Security rationale:
 * - logoUrl: must be https, must not be a data: URI (avoids embedding arbitrary/huge
 *   payloads or SVG-with-script tricks). In practice this app only ever writes a URL here
 *   that it generated itself (lib/mail/branding-logo.ts's own upload, pointed at its own
 *   bucket) -- this check stays as a defense-in-depth floor, not the only guard.
 * - primaryColor / headerColor: must match a strict hex pattern -- these values get
 *   interpolated directly into inline CSS in the email template and into a CSS custom
 *   property in the portal, so an unvalidated string here is a CSS/HTML injection point
 *   (e.g. "red;background:url(javascript:...)" or closing the style attr early to inject
 *   markup). headerColor also gets a minimum-contrast check against white -- it's used as
 *   a full-panel background behind white text (the portal sidebar, the email's header
 *   band), unlike a color only ever used as a small accent, so a too-light choice would
 *   make that text unreadable. This app's own CLAUDE.md treats outdoor/on-the-job
 *   legibility as a functional requirement, not polish -- this is that same principle
 *   applied to a tenant-chosen color instead of one this app designed itself.
 * - introText: plain text only, length-capped. The renderer HTML-escapes it again at
 *   render time regardless (defense in depth) -- never rely on a single layer of escaping.
 * - supportEmail / supportPhone: format-checked so they render usefully and can't be
 *   used to smuggle markup either.
 */

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose but safe: digits, spaces, +, -, (, ) only. Reject anything else.
const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;
// WCAG-style relative luminance -> contrast ratio against white (#fff, luminance 1.0).
// 3:1 is WCAG AA's floor for large text/UI components -- lenient enough not to reject
// reasonable brand colors, strict enough to catch a color that would make white text on
// top of it genuinely hard to read (this app's own design tokens all clear 5.9:1+).
const MIN_CONTRAST_ON_WHITE = 3;

export class BrandingValidationError extends Error {}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Contrast ratio of `hex` against white, per the standard (L1+0.05)/(L2+0.05) formula. */
function contrastAgainstWhite(hex: string): number {
  return (1 + 0.05) / (relativeLuminance(hex) + 0.05);
}

function validateHexColor(value: string, label: string): string {
  if (!HEX_COLOR_RE.test(value)) {
    throw new BrandingValidationError(`${label} must be a 6-digit hex value like "#0A6E7C".`);
  }
  if (contrastAgainstWhite(value) < MIN_CONTRAST_ON_WHITE) {
    throw new BrandingValidationError(`${label} is too light to read against white text -- pick something darker.`);
  }
  return value;
}

export interface OrgBrandingInput {
  logoUrl?: string | null;
  primaryColor?: string | null;
  headerColor?: string | null;
}

export interface ValidatedOrgBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  headerColor: string | null;
}

export function validateOrgBranding(input: OrgBrandingInput): ValidatedOrgBranding {
  const out: ValidatedOrgBranding = { logoUrl: null, primaryColor: null, headerColor: null };

  if (input.logoUrl) {
    let parsed: URL;
    try {
      parsed = new URL(input.logoUrl);
    } catch {
      throw new BrandingValidationError("Logo URL is not a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new BrandingValidationError("Logo URL must use https://.");
    }
    if (input.logoUrl.length > 2048) {
      throw new BrandingValidationError("Logo URL is too long.");
    }
    out.logoUrl = input.logoUrl;
  }

  if (input.primaryColor) out.primaryColor = validateHexColor(input.primaryColor, "Primary color");
  if (input.headerColor) out.headerColor = validateHexColor(input.headerColor, "Header color");

  return out;
}

export interface WelcomeEmailSettingsInput {
  supportEmail?: string | null;
  supportPhone?: string | null;
  introText?: string | null;
}

export interface ValidatedWelcomeEmailSettings {
  supportEmail: string | null;
  supportPhone: string | null;
  introText: string | null;
}

export function validateWelcomeEmailSettings(input: WelcomeEmailSettingsInput): ValidatedWelcomeEmailSettings {
  const out: ValidatedWelcomeEmailSettings = { supportEmail: null, supportPhone: null, introText: null };

  if (input.supportEmail) {
    if (!EMAIL_RE.test(input.supportEmail) || input.supportEmail.length > 254) {
      throw new BrandingValidationError("Support email is not valid.");
    }
    out.supportEmail = input.supportEmail;
  }

  if (input.supportPhone) {
    if (!PHONE_RE.test(input.supportPhone)) {
      throw new BrandingValidationError("Support phone number is not valid.");
    }
    out.supportPhone = input.supportPhone;
  }

  if (input.introText) {
    const trimmed = input.introText.trim();
    if (trimmed.length > 500) {
      throw new BrandingValidationError("Intro text must be 500 characters or fewer.");
    }
    // Reject anything that looks like an attempt to inject markup -- the renderer
    // HTML-escapes this too, but we fail loudly at write-time rather than silently
    // defusing it, so the admin gets clear feedback.
    if (/<|>/.test(trimmed)) {
      throw new BrandingValidationError("Intro text can't contain angle brackets. Plain text only.");
    }
    out.introText = trimmed;
  }

  return out;
}
