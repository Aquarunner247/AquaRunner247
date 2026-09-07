/**
 * welcome-email.ts
 *
 * Renders the customer "create your account" welcome email.
 *
 * - Works for every tenant via one fixed template.
 * - Only pre-validated branding fields (see lib/mail/validate-branding.ts) are
 *   interpolated -- never raw tenant HTML.
 * - Every dynamic string is HTML-escaped here too (defense in depth, in case validation
 *   is ever bypassed or the caller changes upstream).
 * - Table-based layout + inline styles, because that's still what reliably renders
 *   correctly across Outlook/Gmail/Apple Mail -- unlike the rest of this app's UI, this
 *   is NOT subject to the Tailwind/`.app-*`/no-inline-hex rule in CLAUDE.md, which is
 *   about the product's own browser-rendered UI, not email markup email clients require
 *   to be self-contained inline HTML.
 * - Both an HTML and a plain-text version are generated -- always send both (multipart)
 *   so the email doesn't get flagged as spam and stays readable for accessibility /
 *   plain-text clients.
 *
 * Pure function, no I/O -- safe to import into both the server-side send path
 * (lib/mail/send-welcome-email.ts) and the client-side settings preview.
 */

export interface WelcomeEmailData {
  orgName: string;
  customerFirstName: string;
  activationUrl: string; // the Supabase recovery/password-set link -- https only
  logoUrl?: string | null;
  primaryColor?: string | null; // validated hex, e.g. "#0A6E7C" -- button fill, links
  headerColor?: string | null; // validated hex -- background band behind the logo
  supportEmail?: string | null;
  supportPhone?: string | null;
  introText?: string | null; // plain text, already validated/length-capped
  linkExpiryHours?: number; // default 48
}

// Falls back to this app's own brand.primary token (tailwind.config.ts) when an org
// hasn't set one -- "primary action, links, focus," 5.9:1 contrast on white.
const DEFAULT_PRIMARY_COLOR = "#0A6E7C";
// Unset headerColor renders a plain white band -- today's unchanged look.
const DEFAULT_HEADER_COLOR = "#ffffff";
const DEFAULT_INTRO =
  "Your pool service company has set up an online account for you so you can " +
  "keep track of your service visits, chemistry readings, and billing -- all in one place.";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assertHttpsUrl(url: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must be https:// -- refusing to send. Got: ${url}`);
  }
}

/** logoUrl specifically (never activationUrl -- that check stays strictly https-only, it's
 * the actual bearer-credential link) also accepts blob: -- the branding settings page's
 * live preview (branding-form.tsx) passes URL.createObjectURL(selectedFile) here for
 * instant local preview before a file is ever uploaded/saved. A blob: URL only exists in
 * the browser tab that created it and is never what actually gets stored/sent -- the real
 * send path (lib/mail/send-welcome-email.ts) only ever supplies a real https:// Supabase
 * Storage URL pulled from the database, so this can't leak into an actual sent email. */
function assertValidLogoUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`logoUrl is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "blob:") {
    throw new Error(`logoUrl must be https:// (or a local blob: preview) -- refusing to send. Got: ${url}`);
  }
}

export function renderWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string; text: string } {
  // Fail closed: never send an email with a non-https activation link.
  assertHttpsUrl(data.activationUrl, "activationUrl");
  if (data.logoUrl) assertValidLogoUrl(data.logoUrl);

  const orgName = escapeHtml(data.orgName);
  const firstName = escapeHtml(data.customerFirstName || "there");
  const primaryColor = data.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(data.primaryColor) ? data.primaryColor : DEFAULT_PRIMARY_COLOR;
  const headerColor = data.headerColor && /^#[0-9A-Fa-f]{6}$/.test(data.headerColor) ? data.headerColor : DEFAULT_HEADER_COLOR;
  const intro = data.introText ? escapeHtml(data.introText) : DEFAULT_INTRO;
  const expiryHours = data.linkExpiryHours ?? 48;
  const supportEmail = data.supportEmail ? escapeHtml(data.supportEmail) : null;
  const supportPhone = data.supportPhone ? escapeHtml(data.supportPhone) : null;

  const subject = `Welcome to ${data.orgName} -- your account is ready`;

  // Text-only fallback (no logo uploaded) sits inside the header band above -- when that
  // band has a custom color, white text reads correctly against it (same assumption the
  // portal sidebar makes for its own text); the plain white default band keeps using
  // primaryColor for the org name, exactly today's look.
  const logoFallbackColor = headerColor === DEFAULT_HEADER_COLOR ? primaryColor : "#ffffff";
  const logoBlock = data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="${orgName}" width="140" style="display:block;border:0;outline:none;text-decoration:none;max-width:140px;height:auto;margin:0 auto;" />`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${logoFallbackColor};text-align:center;">${orgName}</div>`;

  const supportLine = [
    supportEmail ? `<a href="mailto:${supportEmail}" style="color:${primaryColor};text-decoration:underline;">${supportEmail}</a>` : null,
    supportPhone ? escapeHtml(supportPhone) : null,
  ]
    .filter(Boolean)
    .join(" &nbsp;|&nbsp; ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:32px;background-color:${headerColor};">
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;">
              <h1 style="font-size:20px;color:#111827;margin:0 0 16px;">Hi ${firstName},</h1>
              <p style="font-size:15px;line-height:22px;color:#374151;margin:0 0 20px;">${intro}</p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:6px;background-color:${primaryColor};">
                    <a href="${escapeHtml(data.activationUrl)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
                      Activate Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;line-height:20px;color:#6b7280;margin:0 0 24px;">
                This link is unique to you, can only be used once, and expires in ${expiryHours} hours.
                Please don't forward it to anyone else. If it expires, you can request a new one from ${orgName}.
              </p>

              <h2 style="font-size:15px;color:#111827;margin:0 0 12px;">What you can do once you're in:</h2>
              <ul style="font-size:14px;line-height:22px;color:#374151;margin:0 0 24px;padding-left:20px;">
                <li>See your upcoming and past service visits, with photos your technician takes on-site</li>
                <li>Check water chemistry readings and compliance status for your pool or spa</li>
                <li>Request service or report an issue directly</li>
                <li>Message ${orgName} without picking up the phone</li>
              </ul>

              <p style="font-size:13px;line-height:20px;color:#6b7280;margin:0 0 8px;">
                Didn't expect this email? You can safely ignore it -- no account will be created unless
                you click the button above. If you have concerns, contact ${orgName} directly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="font-size:12px;line-height:18px;color:#9ca3af;margin:0;">
                Sent by ${orgName}${supportLine ? ` &nbsp;&bull;&nbsp; ${supportLine}` : ""}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hi ${data.customerFirstName || "there"},`,
    "",
    data.introText || DEFAULT_INTRO,
    "",
    `Activate your account: ${data.activationUrl}`,
    `(This link is unique to you, single-use, and expires in ${expiryHours} hours. Don't forward it.)`,
    "",
    "What you can do once you're in:",
    "- See upcoming and past service visits, with photos from your technician",
    "- Check water chemistry readings and compliance status",
    "- Request service or report an issue",
    `- Message ${data.orgName} directly`,
    "",
    "Didn't expect this email? You can ignore it safely -- no account is created unless you click the link above.",
    "",
    `-- ${data.orgName}${data.supportEmail ? ` (${data.supportEmail})` : ""}${data.supportPhone ? ` ${data.supportPhone}` : ""}`,
  ].join("\n");

  return { subject, html, text };
}
