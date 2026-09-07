/**
 * send-welcome-email.ts
 *
 * Orchestrates: generate a Supabase recovery (password-set) link -> render the welcome
 * email -> send via Resend -> write an audit log row. Called from createCustomerLogin
 * (app/dashboard/customers/[id]/actions.ts) right after a brand-new CustomerUser row is
 * created there.
 *
 * SECURITY NOTES -- read before changing this file:
 *
 * 1. Service role key: `createSupabaseAdminClient` (lib/supabase/admin.ts) uses
 *    SUPABASE_SERVICE_ROLE_KEY. Both that module and this one are guarded with
 *    "server-only" -- Next.js throws a build error if either is ever imported into a
 *    client bundle.
 *
 * 2. Link generation: this repo's customer-login flow (createCustomerLogin) already
 *    creates the CustomerUser's Supabase Auth account directly via createOrFindAuthUser
 *    with email_confirm: true -- by the time this function runs, the account already
 *    exists and is already confirmed. There is no "invite/unconfirmed" state to activate,
 *    so this uses generateLink({ type: "recovery" }) rather than "invite" -- functionally,
 *    this doubles as how the customer actually learns their password for the first time,
 *    since createCustomerLogin's admin-typed password is never otherwise communicated to
 *    them. The recovery link redirects through this app's EXISTING password-set flow
 *    (/auth/callback -> /reset-password), not a new route -- see the `?portal=1` flag
 *    below, which tells reset-password-form.tsx to land the customer on /portal/login
 *    afterward instead of the staff /login page.
 *    Supabase handles expiry, single-use invalidation, and signing. The raw action_link is
 *    NEVER logged anywhere persistent (application logs, error trackers, or the
 *    WelcomeEmailSend audit row below) -- it's a bearer credential.
 *
 * 3. Rate limiting: enforced here (checkWelcomeEmailRateLimit), not left to the caller --
 *    max 3 sends to the same address per 24h, backed by the WelcomeEmailSend audit table
 *    this function already writes to. There is no separate "resend invite" action built in
 *    this pass (explicitly out of scope); when one is added, it must call this same
 *    function so the limit still applies.
 *
 * 4. Cross-tenant isolation: `organizationId` must come from the authenticated admin's
 *    session (see requireAdmin() at the createCustomerLogin call site), never from a
 *    client-supplied field, or one org could trigger a password-reset link for another
 *    org's customer.
 *
 * 5. Email enumeration: if generateLink fails, return a generic reason to the caller
 *    rather than surfacing Supabase's own error text, which could otherwise reveal
 *    account-existence details across tenants (two unrelated orgs can share a customer's
 *    email address in this app's data model).
 */

import "server-only";
import { Resend } from "resend";
import { renderWelcomeEmail } from "@/lib/mail/welcome-email";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SendWelcomeEmailParams {
  organizationId: string;
  customerId: string;
  customerEmail: string;
  customerFirstName: string;
  /** e.g. https://app.aquarunner247.com -- the recovery link's redirectTo is built from
   * this, through /auth/callback?next=/reset-password%3Fportal%3D1. */
  portalBaseUrl: string;
}

const RATE_LIMIT_MAX_SENDS = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Backed by the WelcomeEmailSend audit table this function already writes to -- no
 * separate rate-limit store needed. Counts sends to the same address regardless of which
 * org/customer triggered them, since the abuse case (spamming one inbox) doesn't care
 * which tenant is doing it. */
async function checkWelcomeEmailRateLimit(toEmail: string): Promise<boolean> {
  const count = await prisma.welcomeEmailSend.count({
    where: { toEmail, sentAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) } },
  });
  return count < RATE_LIMIT_MAX_SENDS;
}

export async function sendWelcomeEmail(params: SendWelcomeEmailParams): Promise<{ ok: true } | { ok: false; reason: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: {
      name: true,
      welcomeEmailEnabled: true,
      brandingLogoUrl: true,
      brandingPrimaryColor: true,
      brandingHeaderColor: true,
      welcomeEmailSupportEmail: true,
      welcomeEmailSupportPhone: true,
      welcomeEmailIntroText: true,
    },
  });

  if (!org) return { ok: false, reason: "Organization not found." };
  if (org.welcomeEmailEnabled === false) return { ok: false, reason: "Welcome email disabled for this org." };

  if (!(await checkWelcomeEmailRateLimit(params.customerEmail))) {
    // No audit row on a rate-limit refusal -- nothing was attempted against Supabase or
    // Resend, so there's nothing to log an outcome for.
    return { ok: false, reason: "Too many emails sent to this address recently." };
  }

  const supabaseAdmin = createSupabaseAdminClient();

  // Redirects through this app's existing password-set flow -- see this file's header
  // comment. ?portal=1 is read by app/reset-password/page.tsx so the post-set redirect
  // goes to /portal/login instead of the staff /login page.
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: params.customerEmail,
    options: {
      redirectTo: `${params.portalBaseUrl}/auth/callback?next=${encodeURIComponent("/reset-password?portal=1")}`,
    },
  });

  if (error || !data?.properties?.action_link) {
    await logSend(params, "failed", error?.message ?? "No action_link returned");
    // Generic reason to the caller -- never surface Supabase's own message, which can
    // otherwise leak cross-tenant account-existence details.
    return { ok: false, reason: "Could not generate an activation link." };
  }

  const { subject, html, text } = renderWelcomeEmail({
    orgName: org.name,
    customerFirstName: params.customerFirstName,
    activationUrl: data.properties.action_link,
    logoUrl: org.brandingLogoUrl,
    primaryColor: org.brandingPrimaryColor,
    headerColor: org.brandingHeaderColor,
    supportEmail: org.welcomeEmailSupportEmail,
    supportPhone: org.welcomeEmailSupportPhone,
    introText: org.welcomeEmailIntroText,
  });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await logSend(params, "failed", "RESEND_API_KEY not set");
    return { ok: false, reason: "Email failed to send." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from: fromAddress,
    to: params.customerEmail,
    subject,
    html,
    text,
    tags: [{ name: "category", value: "welcome_email" }],
  });

  if (result.error) {
    await logSend(params, "failed", result.error.message);
    return { ok: false, reason: "Email failed to send." };
  }

  await logSend(params, "sent", null);
  return { ok: true };
}

async function logSend(params: SendWelcomeEmailParams, status: "sent" | "failed" | "resent", errorMessage: string | null) {
  await prisma.welcomeEmailSend.create({
    data: {
      organizationId: params.organizationId,
      customerId: params.customerId,
      toEmail: params.customerEmail,
      status,
      errorMessage: errorMessage ?? undefined,
    },
  });
}
