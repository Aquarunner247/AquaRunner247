import { Resend } from "resend";

/**
 * Notifies the site owner of a new waitlist signup. Best-effort — the WaitlistSignup
 * DB row is the durable record either way, this is just an immediate ping. Skipped
 * entirely (not an error) if WAITLIST_NOTIFICATION_EMAIL isn't configured.
 */
export async function sendWaitlistNotificationEmail(signupEmail: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.WAITLIST_NOTIFICATION_EMAIL;
  if (!apiKey || !notifyTo) {
    return { ok: false, error: "RESEND_API_KEY or WAITLIST_NOTIFICATION_EMAIL not set — notification not sent." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: notifyTo,
      subject: `New waitlist signup — ${signupEmail}`,
      html: `<p style="font-family: Arial, sans-serif; font-size:14px; color:#06333B;">New waitlist signup: <strong>${signupEmail}</strong></p>`,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

type ReadingSummary = {
  ph: number | null;
  freeChlorinePpm: number | null;
  brominePpm: number | null;
  alkalinityPpm: number | null;
  cyanuricAcidPpm: number | null;
  temperatureF: number | null;
  backwashAt: Date | null;
};

type DoseSummary = { productName: string; quantity: number; unit: string };

type ServiceSummaryEmailInput = {
  to: string;
  propertyName: string;
  bodyOfWaterName: string;
  technicianName: string | null;
  completedAt: Date;
  /** IANA zone, e.g. "America/Los_Angeles" -- resolve via lib/timezone.ts's
   * timeZoneForState(org.state) at the call site. This function runs server-side, where
   * the process timezone is UTC, not the business's own -- without this, the email shows
   * the visit's raw UTC clock reading instead of local time. */
  timeZone: string;
  reading: ReadingSummary | null;
  /** Which disinfectant this body of water uses (BodyOfWater.disinfectionMethod) --
   * decides whether the summary shows Free Chlorine or Bromine, since a reading only
   * ever has one of the two filled in. */
  usesBromine: boolean;
  doses: DoseSummary[];
  checklistLabels: string[];
  techNotes: string | null;
};

function fmt(n: number | null, digits = 1): string {
  return n == null ? "—" : n.toFixed(digits);
}

export async function sendServiceSummaryEmail(input: ServiceSummaryEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(apiKey);

  const dateStr = input.completedAt.toLocaleDateString(undefined, { timeZone: input.timeZone, year: "numeric", month: "long", day: "numeric" });
  const timeStr = input.completedAt.toLocaleTimeString(undefined, { timeZone: input.timeZone, hour: "numeric", minute: "2-digit" });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:#06333B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Service Summary</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${input.propertyName} — ${input.bodyOfWaterName}</h1>
        <p style="color:#9CC3C6; font-size:13px; margin:6px 0 0;">${dateStr} at ${timeStr}</p>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size:14px; margin:0 0 12px;">Technician: <strong>${input.technicianName ?? "—"}</strong></p>

        <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
          <tr><td style="padding:4px 0; color:#55696C;">${input.usesBromine ? "Bromine" : "Free Chlorine"}</td><td style="text-align:right;">${fmt(input.usesBromine ? (input.reading?.brominePpm ?? null) : (input.reading?.freeChlorinePpm ?? null))} ppm</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">pH</td><td style="text-align:right;">${fmt(input.reading?.ph ?? null)}</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Total Alkalinity</td><td style="text-align:right;">${fmt(input.reading?.alkalinityPpm ?? null, 0)} ppm</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Cyanuric Acid</td><td style="text-align:right;">${fmt(input.reading?.cyanuricAcidPpm ?? null, 0)} ppm</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Water Temperature</td><td style="text-align:right;">${fmt(input.reading?.temperatureF ?? null, 0)}°F</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Backwash</td><td style="text-align:right;">${input.reading?.backwashAt ? "Yes" : "No"}</td></tr>
        </table>

        ${
          input.doses.length
            ? `<p style="font-size:13px; font-weight:bold; margin:0 0 4px;">Chemicals added</p>
               <ul style="font-size:14px; margin:0 0 16px; padding-left:18px;">
                 ${input.doses.map((d) => `<li>${d.productName}: ${d.quantity} ${d.unit}</li>`).join("")}
               </ul>`
            : ""
        }

        ${
          input.checklistLabels.length
            ? `<p style="font-size:13px; font-weight:bold; margin:0 0 4px;">Service checklist completed</p>
               <p style="font-size:14px; margin:0 0 16px;">${input.checklistLabels.join(", ")}</p>`
            : ""
        }

        ${
          input.techNotes
            ? `<p style="font-size:13px; font-weight:bold; margin:0 0 4px;">Notes</p>
               <p style="font-size:14px; margin:0 0 16px; white-space:pre-wrap;">${input.techNotes}</p>`
            : ""
        }

        <p style="font-size:12px; color:#55696C; margin-top:20px; border-top:1px solid #C4D9DA; padding-top:12px;">
          This is an automated summary from AquaRunner 24/7 Pro.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: `Service Summary — ${input.propertyName} — ${input.bodyOfWaterName} — ${dateStr}`,
      html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

type PhoneAgentTicketEmailInput = {
  to: string;
  organizationName: string;
  routedAs: "AFTER_HOURS" | "BUSY_OVERFLOW";
  callerNumber: string;
  callerName: string | null;
  callerCallbackNumber: string | null;
  propertyAddress: string | null;
  issueType: string | null;
  urgency: string | null;
  requestedCallbackTime: string | null;
  /** Null when transcription failed/came back empty -- the email still goes out (with the
   * recording link) rather than silently dropping the ticket. */
  summary: string | null;
  recordingUrl: string | null;
  dashboardUrl: string;
};

/** One call per recipient, same convention as sendCustomerAlertEmail -- the caller
 * (voice/transcription/route.ts) loops over OrgPhoneAgentSettings.escalationEmails. */
export async function sendPhoneAgentTicketEmail(input: PhoneAgentTicketEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(apiKey);

  const routedLabel = input.routedAs === "AFTER_HOURS" ? "After-hours" : "Overflow — rang during business hours, unanswered";
  const urgencyLabel = input.urgency ?? "—";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:#06333B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">New Phone Agent Ticket — ${routedLabel}</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${input.callerName ?? "Unknown caller"} — ${input.callerNumber}</h1>
        <p style="color:#9CC3C6; font-size:13px; margin:6px 0 0;">${input.organizationName}</p>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
          <tr><td style="padding:4px 0; color:#55696C;">Urgency</td><td style="text-align:right;">${urgencyLabel}</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Issue type</td><td style="text-align:right;">${input.issueType ?? "—"}</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Property address</td><td style="text-align:right;">${input.propertyAddress ?? "—"}</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Callback number</td><td style="text-align:right;">${input.callerCallbackNumber ?? input.callerNumber}</td></tr>
          <tr><td style="padding:4px 0; color:#55696C;">Requested callback time</td><td style="text-align:right;">${input.requestedCallbackTime ?? "—"}</td></tr>
        </table>

        <p style="font-size:13px; font-weight:bold; margin:0 0 4px;">Summary</p>
        <p style="font-size:14px; margin:0 0 16px; white-space:pre-wrap;">${input.summary ?? "Transcription wasn't available for this call — listen to the recording below."}</p>

        ${
          input.recordingUrl
            ? `<p style="font-size:13px; margin:0 0 16px;"><a href="${input.recordingUrl}" style="color:#0A6E7C;">Listen to the recording</a></p>`
            : ""
        }

        <p style="font-size:13px; margin:0 0 16px;"><a href="${input.dashboardUrl}" style="color:#0A6E7C;">View in AquaRunner</a></p>

        <p style="font-size:12px; color:#55696C; margin-top:20px; border-top:1px solid #C4D9DA; padding-top:12px;">
          This is an automated ticket from AquaRunner 24/7 Pro's phone agent.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: `New ${urgencyLabel !== "—" ? urgencyLabel.toLowerCase() + " " : ""}ticket — ${input.callerName ?? input.callerNumber}`,
      html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

type CancellationScrubWarningEmailInput = {
  to: string;
  organizationName: string;
  scrubScheduledAt: Date;
  /** IANA zone -- see ServiceSummaryEmailInput.timeZone's doc comment for why this is
   * required rather than defaulting. */
  timeZone: string;
  billingUrl: string;
};

/** Sent to every ADMIN user the moment a subscription's cancellation webhook fires --
 * see the customer.subscription.deleted handler in app/api/stripe/webhook/route.ts.
 * One call per recipient, same convention as sendPhoneAgentTicketEmail. */
export async function sendCancellationScrubWarningEmail(input: CancellationScrubWarningEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(apiKey);

  const deadlineStr = input.scrubScheduledAt.toLocaleString(undefined, {
    timeZone: input.timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:#06333B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Action needed — subscription ended</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${input.organizationName}</h1>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size:14px; margin:0 0 12px;">
          Your AquaRunner 24/7 Pro subscription has ended. Unless you reactivate first, your account's data — visits,
          chemistry readings, chemical doses, checklists, photos, and everything else not required for ongoing
          compliance logging — will be <strong>permanently deleted on ${deadlineStr}</strong>.
        </p>
        <p style="font-size:14px; margin:0 0 16px;">
          Water-reading logs, contamination incident records, and inspection reports required for state health-department
          compliance will keep being accessible through your properties' existing QR-code log pages even after
          deletion — everything else will not be recoverable.
        </p>
        <p style="font-size:14px; margin:0 0 20px;">
          If you want a full copy of your data, export it now — this takes one click and does not require
          reactivating.
        </p>
        <p style="margin:0 0 16px;">
          <a href="${input.billingUrl}" style="display:inline-block; background:#0A6E7C; color:white; font-size:14px; font-weight:600; padding:10px 18px; border-radius:6px; text-decoration:none;">
            Export my data
          </a>
        </p>
        <p style="font-size:12px; color:#55696C; margin-top:20px; border-top:1px solid #C4D9DA; padding-top:12px;">
          This is an automated notice from AquaRunner 24/7 Pro.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: `Action needed: your data will be deleted on ${deadlineStr}`,
      html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

type CustomerAlertEmailInput = {
  to: string;
  customerName: string;
  subject: string;
  message: string;
};

export async function sendCustomerAlertEmail(input: CustomerAlertEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(apiKey);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:#06333B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Update from AquaRunner 24/7 Pro</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${input.subject}</h1>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size:14px; margin:0 0 12px; color:#55696C;">Hi ${input.customerName},</p>
        <p style="font-size:14px; margin:0 0 16px; white-space:pre-wrap;">${input.message}</p>

        <p style="font-size:12px; color:#55696C; margin-top:20px; border-top:1px solid #C4D9DA; padding-top:12px;">
          Sign in to your customer portal to see this and other updates.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: input.subject,
      html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

type CustomerAccessEndedEmailInput = {
  to: string;
  customerName: string;
  organizationName: string;
  subscribeUrl: string;
};

/**
 * Sent when a customer's relationship with a service-company org ends -- either that one
 * customer specifically (endCustomerRelationship) or the whole org canceling its own
 * subscription (the Stripe webhook's customer.subscription.deleted handler). Their portal
 * login is blocked, not deleted, and their historical data is untouched either way -- this
 * tells them how to get full access back on their own, via AquaRunner Compliance.
 */
export async function sendCustomerAccessEndedEmail(input: CustomerAccessEndedEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(apiKey);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:#06333B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Your portal access has changed</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${input.organizationName}</h1>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size:14px; margin:0 0 12px;">Hi ${input.customerName},</p>
        <p style="font-size:14px; margin:0 0 16px;">
          Your access to view your pool compliance records through ${input.organizationName} has ended. Your
          historical records — chemistry readings, inspection reports, and the QR-code log for each of your bodies of
          water — are safe and haven't been touched.
        </p>
        <p style="font-size:14px; margin:0 0 20px;">
          Subscribe to AquaRunner Compliance for $19/month to keep viewing your existing records and keep logging new
          readings yourself, on your own account.
        </p>
        <p style="margin:0 0 16px;">
          <a href="${input.subscribeUrl}" style="display:inline-block; background:#0A6E7C; color:white; font-size:14px; font-weight:600; padding:10px 18px; border-radius:6px; text-decoration:none;">
            Subscribe to keep my records
          </a>
        </p>
        <p style="font-size:12px; color:#55696C; margin-top:20px; border-top:1px solid #C4D9DA; padding-top:12px;">
          This is an automated notice from AquaRunner 24/7 Pro.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: "Your pool compliance portal access has changed",
      html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}
