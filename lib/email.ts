import { Resend } from "resend";
import { escapeEmailHtml, resolveEmailBranding, type EmailBrandingInput } from "@/lib/mail/email-branding";
import { resolveFromAddress } from "@/lib/mail/from-address";
import { renderTaskDigestEmail, type TaskDigestInput } from "@/lib/mail/task-digest-email";

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
  const fromAddress = resolveFromAddress();

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

/**
 * One body of water's own record. A pool and its spa are serviced on one walk-up but stay separate
 * compliance records, so the customer gets a single email holding both rather than two emails for
 * one visit -- see lib/service-summary-bundle.ts for what counts as one visit.
 */
/** One photo, as the email needs it: one URL to show it and one to save it. */
export type ServiceSummaryPhoto = {
  url: string;
  /** Signed with a download disposition and a filename, so a click saves the file. */
  downloadUrl: string;
};

export type ServiceSummaryBody = {
  bodyOfWaterName: string;
  /** Which disinfectant this body uses (BodyOfWater.disinfectionMethod) -- decides whether the
   * summary shows Free Chlorine or Bromine, since a reading only ever has one of the two filled
   * in. Per body, because a pool and its spa can differ. */
  usesBromine: boolean;
  reading: ReadingSummary | null;
  doses: DoseSummary[];
  checklistLabels: string[];
  techNotes: string | null;
  /**
   * Signed Supabase Storage URLs (see VISIT_PHOTOS_BUCKET) -- the bucket is private, so these must
   * already be signed by the caller, with an expiry long enough to still resolve whenever the
   * recipient actually opens the email, not the short-lived one used for a page that regenerates it on
   * every load.
   *
   * Two URLs per photo, because one is not enough. `url` is what the <img> displays. `downloadUrl` is
   * the same object signed with a download disposition and a real filename, behind a visible link: a
   * customer asked to keep a photo and could not, and right-clicking an inline image is not a reliable
   * way to save one -- Gmail serves it through its own proxy, and a phone's mail client often offers no
   * way at all. A link they can tap always works.
   */
  photos: ServiceSummaryPhoto[];
  /** The latest moment there is evidence of work at this body -- the newest photo's own capture
   *  time. Null when no photo was taken. Used only to decide whether the visit's completion
   *  timestamp is close enough to the work to support an "on site" duration; never shown. */
  lastWorkEvidenceAt?: Date | null;
  /** When this body in particular was finished. The header strip shows the last of them, which is
   * when the visit as a whole ended. */
  completedAt: Date;
  /** The message the technician picked for this body, already interpolated. Rendered once above
   * everything when every body carries the same one, and inside each body's block otherwise -- a
   * pool that went fine and a spa skipped for lightning do not share a message. */
  serviceMessage: string | null;
  /**
   * What happened to this body. Named in the email either way, with no readings unless serviced, so
   * a customer expecting two reports is never left wondering where the second went.
   *
   * "incomplete" is distinct from "skipped" on purpose: a skipped body was a decision the technician
   * made and can be stated as such, while an unfinished one is just unfinished, and saying it was
   * skipped would be a claim nobody made.
   */
  outcome: "serviced" | "skipped" | "incomplete";
};

type ServiceSummaryEmailInput = {
  /** One address for the automatic send to the property contact, several for a resend the office
   *  addresses by hand (see resendServiceSummary). */
  to: string | string[];
  /** The org's branding when it's on a tier that includes white-labelling, else null. Resolved
   * by the caller (see the completion route) so the tier gate lives with the other org lookups
   * rather than being re-derived here. Null yields the platform's own look. */
  branding?: EmailBrandingInput | null;
  propertyName: string;
  /** Every body of water this visit covered, in route order. One entry is the ordinary case. */
  bodies: ServiceSummaryBody[];
  address: string | null;
  technicianName: string | null;
  /** Null for a visit that was never logged through the GPS auto-arrival flow (see
   * app/api/visits/[id]/arrival/route.ts) -- completedAt still backfills it at completion
   * time on the ServiceVisit row itself (see the completion route), but that backfilled
   * value would show arrival and completion as the exact same instant, which is more
   * misleading than just omitting the arrival line for a visit that genuinely has no
   * separate arrival timestamp. Only render "Arrived" when this is a real, distinct time. */
  startedAt: Date | null;
  completedAt: Date;
  /** IANA zone, e.g. "America/Los_Angeles" -- resolve via lib/timezone.ts's
   * timeZoneForState(org.state) at the call site. This function runs server-side, where
   * the process timezone is UTC, not the business's own -- without this, the email shows
   * the visit's raw UTC clock reading instead of local time. */
  timeZone: string;
  /** Organization.serviceSummaryCcEmail, if the org has set one -- BCC'd so the org keeps
   * its own copy of everything sent to a customer, without the customer ever seeing that
   * address in the message headers. Null (most orgs) sends only to `to`, unchanged. */
  ccEmail?: string | null;
  /** See CustomerAlertEmailInput.replyTo (lib/email.ts) -- same Organization.
   * welcomeEmailSupportEmail source, same reasoning: without it a reply goes to the `from`
   * address (see lib/mail/from-address.ts), which only receives if inbound forwarding has been set
   * up on the domain -- Resend does not accept inbound mail by default. This is what actually gets
   * a customer's reply to a human. */
  replyTo?: string | null;
};

function fmt(n: number | null, digits = 1): string {
  return n == null ? "—" : n.toFixed(digits);
}

function fmtTime(d: Date, timeZone: string): string {
  return d.toLocaleTimeString(undefined, { timeZone, hour: "numeric", minute: "2-digit" });
}

/** "1h 12m" / "42m" / "<1m" -- never a raw minute count over 60 or a decimal, since this
 * is read at a glance next to two clock times, not computed from. */
function fmtDuration(startedAt: Date, completedAt: Date): string {
  const totalMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60_000);
  if (totalMinutes < 1) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** One label/value block in the visit-info strip -- same shape whether or not `sub` is
 * present, so the row of blocks stays evenly spaced regardless of which ones render. */
function infoBlock(label: string, value: string, sub?: string): string {
  return `
    <td style="padding:12px 16px; border-right:1px solid #0F4750; vertical-align:top;">
      <p style="margin:0; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; color:#9CC3C6;">${label}</p>
      <p style="margin:2px 0 0; font-size:15px; font-weight:bold; color:white;">${value}</p>
      ${sub ? `<p style="margin:1px 0 0; font-size:11px; color:#9CC3C6;">${sub}</p>` : ""}
    </td>`;
}

/** Section wrapper -- every section in the body gets the same label-then-content shape
 * (uppercase eyebrow label, divider above all but the first) so the email reads as a
 * sequence of distinct records rather than one running paragraph. */
function section(label: string, contentHtml: string, first = false): string {
  return `
    <div style="${first ? "" : "border-top:1px solid #E3EDEE; "}padding:16px 0;">
      <p style="margin:0 0 8px; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; color:#55696C;">${label}</p>
      ${contentHtml}
    </div>`;
}

/** Names one body of water above its own record. Only used for a bundle -- a single-body email
 *  already names it in the header, and repeating it there would read as a mistake. */
function bodyHeading(name: string): string {
  return `
    <div style="border-top:2px solid #0A6E7C; margin-top:16px; padding-top:12px;">
      <p style="margin:0; font-size:16px; font-weight:bold; color:#0A6E7C;">${escapeEmailHtml(name)}</p>
    </div>`;
}

/**
 * One body of water's sections: readings, chemicals, checklist, notes, photos. Identical to what a
 * single-body email has always rendered, so the ordinary case is unchanged and a bundle is simply
 * this repeated under a heading per body.
 *
 * Every interpolated string is escaped here. Product names, checklist labels and technician notes
 * previously went in raw -- their own staff's text reaching their own customer, so not an attack in
 * practice, but an ampersand or angle bracket in a note could mangle the message.
 */
function renderBody(body: ServiceSummaryBody, timeZone: string, showHeading: boolean, showMessage: boolean): string {
  const firstSection = !showHeading && !showMessage;

  if (body.outcome !== "serviced") {
    const fallback =
      body.outcome === "skipped"
        ? "This one was skipped today and will be picked up on the next service call."
        : "Service for this one wasn't completed today. It will be picked up on the next service call.";
    return `
      ${showHeading ? bodyHeading(body.bodyOfWaterName) : ""}
      ${section(
        body.outcome === "skipped" ? "Not serviced this visit" : "Not completed this visit",
        `<p style="font-size:14px; margin:0; color:#55696C;">${
          body.serviceMessage ? escapeEmailHtml(body.serviceMessage) : fallback
        }</p>`,
        firstSection,
      )}`;
  }

  const readingRows = [
    [
      body.usesBromine ? "Bromine" : "Free Chlorine",
      `${fmt(body.usesBromine ? (body.reading?.brominePpm ?? null) : (body.reading?.freeChlorinePpm ?? null))} ppm`,
    ],
    ["pH", fmt(body.reading?.ph ?? null)],
    ["Total Alkalinity", `${fmt(body.reading?.alkalinityPpm ?? null, 0)} ppm`],
    ["Cyanuric Acid", `${fmt(body.reading?.cyanuricAcidPpm ?? null, 0)} ppm`],
    ["Water Temperature", `${fmt(body.reading?.temperatureF ?? null, 0)}°F`],
    ["Backwash", body.reading?.backwashAt ? `Yes (${fmtTime(body.reading.backwashAt, timeZone)})` : "No"],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:5px 0; font-size:14px; color:#55696C;">${label}</td><td style="padding:5px 0; font-size:14px; font-weight:bold; text-align:right;">${value}</td></tr>`,
    )
    .join("");

  return `
    ${showHeading ? bodyHeading(body.bodyOfWaterName) : ""}
    ${
      showMessage && body.serviceMessage
        ? `<p style="margin:16px 0 0; font-size:15px; line-height:1.5; color:#06333B;">${escapeEmailHtml(body.serviceMessage)}</p>`
        : ""
    }
    ${section("Water chemistry readings", `<table style="width:100%; border-collapse:collapse;">${readingRows}</table>`, firstSection)}
    ${
      body.doses.length
        ? section(
            "Chemicals added",
            `<ul style="font-size:14px; margin:0; padding-left:18px;">
               ${body.doses
                 .map(
                   (d) =>
                     `<li style="margin-bottom:2px;">${escapeEmailHtml(d.productName)}: <strong>${d.quantity} ${escapeEmailHtml(d.unit)}</strong></li>`,
                 )
                 .join("")}
             </ul>`,
          )
        : ""
    }
    ${
      body.checklistLabels.length
        ? section(
            "Service checklist completed",
            `<ul style="font-size:14px; margin:0; padding-left:0; list-style:none;">
               ${body.checklistLabels.map((label) => `<li style="margin-bottom:3px;">&#10003; ${escapeEmailHtml(label)}</li>`).join("")}
             </ul>`,
          )
        : ""
    }
    ${body.techNotes ? section("Notes", `<p style="font-size:14px; margin:0; white-space:pre-wrap;">${escapeEmailHtml(body.techNotes)}</p>`) : ""}
    ${
      body.photos.length
        ? section(
            body.photos.length === 1 ? "Photo from this visit" : "Photos from this visit",
            body.photos
              .map(
                (photo) =>
                  `<img src="${photo.url}" alt="Service visit photo" style="display:block; width:100%; max-width:512px; border-radius:8px; margin:0 0 6px; border:1px solid #C4D9DA;" />` +
                  // Under each photo rather than one link for all of them, so it is clear which image
                  // a link saves when there are several.
                  `<p style="font-size:13px; margin:0 0 14px;"><a href="${photo.downloadUrl}" style="color:#0A6E7C;">Save this photo</a></p>`,
              )
              .join(""),
          )
        : ""
    }`;
}

export async function sendServiceSummaryEmail(input: ServiceSummaryEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  // The org's own name when it is white-labelled, so the sender line matches the branded body
  // instead of showing aquarunner247.com. `branding` is already null unless the tier includes
  // white-labelling, so that gate travels with it.
  const fromAddress = resolveFromAddress(input.branding?.orgName);

  const resend = new Resend(apiKey);
  const brand = resolveEmailBranding(input.branding ?? null);

  const dateStr = input.completedAt.toLocaleDateString(undefined, { timeZone: input.timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric" });
  // Only a genuinely distinct arrival timestamp gets its own blocks -- see startedAt's
  // doc comment on why a backfilled (arrival === completion) value is excluded instead of
  // shown as a zero-length visit.
  const hasDistinctArrival = input.startedAt != null && input.startedAt.getTime() !== input.completedAt.getTime();

  /**
   * Whether "Xh Ym on site" is a claim this data can actually support.
   *
   * It is derived from arrival to completion, and completion is when someone pressed Complete -- not
   * when the technician finished. An admin tidying up pending visits that evening sets it hours late,
   * and the email then told the customer their pool had been serviced for eight hours. Seen live:
   * Elkhorn Pointe arrived 06:44 with its photo at 06:47 and reported 8h 10m; The Alcove reported
   * 14h 11m for 42 minutes of work.
   *
   * There is no trustworthy "work ended" timestamp to substitute -- a photo's takenAt proves work was
   * happening at that moment, not that it stopped there -- so rather than invent a duration, the
   * duration is simply withheld whenever completion is implausibly far from the last evidence of
   * work. Arrival and completion times are still shown; only the inference is dropped.
   */
  const lastEvidence = input.bodies
    .map((b) => b.lastWorkEvidenceAt)
    .filter((d): d is Date => d != null)
    .reduce<Date | null>((latest, d) => (latest == null || d > latest ? d : latest), null);
  const COMPLETION_LAG_TOLERANCE_MS = 45 * 60 * 1000;
  const onSiteCredible =
    hasDistinctArrival &&
    lastEvidence != null &&
    input.completedAt.getTime() - lastEvidence.getTime() <= COMPLETION_LAG_TOLERANCE_MS;

  const infoBlocks = [
    infoBlock("Technician", input.technicianName ?? "—"),
    hasDistinctArrival ? infoBlock("Arrived", fmtTime(input.startedAt!, input.timeZone)) : null,
    infoBlock(
      "Completed",
      fmtTime(input.completedAt, input.timeZone),
      onSiteCredible ? `${fmtDuration(input.startedAt!, input.completedAt)} on site` : undefined,
    ),
  ]
    .filter((b): b is string => b != null)
    .map((b, i, arr) => (i === arr.length - 1 ? b.replace("border-right:1px solid #0F4750; ", "") : b))
    .join("");

  // The bodies' names as the header and subject say them: "Pool & Spa", or a comma list at three.
  const bodyNames = input.bodies.map((b) => b.bodyOfWaterName);
  const bodyLabel =
    bodyNames.length <= 1
      ? (bodyNames[0] ?? "")
      : bodyNames.length === 2
        ? `${bodyNames[0]} & ${bodyNames[1]}`
        : `${bodyNames.slice(0, -1).join(", ")} & ${bodyNames[bodyNames.length - 1]}`;

  // One message above everything when every body carries the same text, which is the ordinary case:
  // a technician usually picks the same message for a pool and its spa. When they differ, each
  // body's message goes inside its own block instead, so neither is attributed to the wrong water.
  const messages = input.bodies.map((b) => b.serviceMessage ?? "");
  const sharedMessage = messages.length > 0 && messages.every((m) => m === messages[0]) ? (messages[0] || null) : null;
  const multi = input.bodies.length > 1;

  const bodiesHtml = input.bodies.map((body) => renderBody(body, input.timeZone, multi, sharedMessage == null)).join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:${brand.headerColor}; padding: 20px 24px 0; border-radius: 8px 8px 0 0;">
        ${brand.logoBlock}
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Service Summary</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 2px;">${escapeEmailHtml(input.propertyName)} — ${escapeEmailHtml(bodyLabel)}</h1>
        ${input.address ? `<p style="color:#9CC3C6; font-size:13px; margin:0 0 2px;">${escapeEmailHtml(input.address)}</p>` : ""}
        <p style="color:#9CC3C6; font-size:13px; margin:0 0 16px;">${dateStr}</p>
        <table style="width:100%; border-collapse:collapse; table-layout:fixed;"><tr>${infoBlocks}</tr></table>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 0 24px; border-radius: 0 0 8px 8px;">
        ${
          sharedMessage
            ? `<p style="margin:16px 0 0; font-size:15px; line-height:1.5; color:#06333B;">${escapeEmailHtml(sharedMessage)}</p>`
            : ""
        }
        ${bodiesHtml}

        <p style="font-size:12px; color:#55696C; margin:16px 0 0; border-top:1px solid #C4D9DA; padding:12px 0 20px;">
          ${brand.footerAttribution}
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      bcc: input.ccEmail ?? undefined,
      replyTo: input.replyTo ?? undefined,
      subject: `Service Summary — ${input.propertyName} — ${bodyLabel} — ${dateStr}`,
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
  const fromAddress = resolveFromAddress();

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
  const fromAddress = resolveFromAddress();

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
  /** The sending org's branding when its tier includes white-labelling, else null. A customer
   * getting "Update from AquaRunner 24/7 Pro" about their own pool is the bug this fixes. */
  branding?: EmailBrandingInput | null;
  message: string;
  /** Organization.welcomeEmailSupportEmail, if the org has set one -- without this, a reply goes to
   * the `from` address (see lib/mail/from-address.ts), which only receives if inbound forwarding has
   * been set up on the domain; Resend accepts no inbound mail by default. Null sends with no
   * reply-to header, same as before this field existed (falls back to whatever Resend/the client
   * does by default, i.e. replying to the from address). */
  replyTo?: string | null;
};

export async function sendCustomerAlertEmail(input: CustomerAlertEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  // The org's own name when it is white-labelled, so the sender line matches the branded body
  // instead of showing aquarunner247.com. `branding` is already null unless the tier includes
  // white-labelling, so that gate travels with it.
  const fromAddress = resolveFromAddress(input.branding?.orgName);

  const resend = new Resend(apiKey);
  const brand = resolveEmailBranding(input.branding ?? null);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:${brand.headerColor}; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        ${brand.logoBlock}
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Update from ${brand.orgName}</p>
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
      replyTo: input.replyTo ?? undefined,
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
  /** See CustomerAlertEmailInput.replyTo -- same reasoning, same fallback. */
  replyTo?: string | null;
};

/**
 * Sent when a customer's relationship with a service-company org ends -- either that one
 * customer specifically (endCustomerRelationship) or the whole org canceling its own
 * subscription (the Stripe webhook's customer.subscription.deleted handler). Their portal
 * login is blocked, not deleted, and their historical data is untouched either way -- this
 * tells them how to get full access back on their own, via AquaRunner Compliance.
 */
export interface PortalActivationEmailInput {
  /** The organization's own people -- this is an internal notice, never the customer. */
  to: string[];
  organizationName: string;
  customerName: string;
  personName: string;
  personEmail: string;
  /** "their maintenance log" vs "the customer portal" -- the two are different news. */
  isMaintenanceLogin: boolean;
  /** Deep link to the customer in the dashboard, so the office can act on it in one click. */
  customerUrl: string;
}

/**
 * Tells the organization that a portal login they created has actually been used for the first time.
 *
 * Creating a login sends the customer an email and then tells the office nothing ever again: whether
 * they set a password, whether the invitation went to a dead address, whether it is worth following up
 * by phone. This closes that loop once per login, on first sign-in.
 *
 * Platform identity, not the pool company's -- it is AquaRunner reporting to its own customer about
 * their account, the same reasoning as sendCustomerAccessEndedEmail. No white-label branding.
 */
export async function sendPortalActivationEmail(input: PortalActivationEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  if (input.to.length === 0) {
    return { ok: false, error: "No recipient — organization has no support address or admin users." };
  }
  const fromAddress = resolveFromAddress();
  const resend = new Resend(apiKey);

  const what = input.isMaintenanceLogin
    ? `signed in to the daily chemistry log for ${escapeEmailHtml(input.customerName)}`
    : `signed in to the customer portal for ${escapeEmailHtml(input.customerName)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:#06333B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Account activated</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${escapeEmailHtml(input.customerName)}</h1>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size:14px; margin:0 0 16px;">
          <strong>${escapeEmailHtml(input.personName)}</strong> (${escapeEmailHtml(input.personEmail)}) has ${what}
          for the first time, so the welcome email reached them and they have set their own password.
        </p>
        <p style="margin:0 0 16px;">
          <a href="${escapeEmailHtml(input.customerUrl)}" style="display:inline-block; background:#0A6E7C; color:white; font-size:14px; font-weight:600; padding:10px 18px; border-radius:6px; text-decoration:none;">
            Open ${escapeEmailHtml(input.customerName)}
          </a>
        </p>
        <p style="font-size:12px; color:#55696C; margin-top:20px; border-top:1px solid #C4D9DA; padding-top:12px;">
          Sent once per login, the first time it is used. An automated notice from AquaRunner 24/7 Pro
          to ${escapeEmailHtml(input.organizationName)}.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: `${input.personName} activated their login — ${input.customerName}`,
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

export interface TaskDigestEmailInput extends TaskDigestInput {
  /** The organization's own people. Internal; a customer must never receive this. */
  to: string[];
}

/**
 * The day's to-do list, emailed to the office each morning.
 *
 * Exists because the notification bell only exists while somebody has the dashboard open, and "send over
 * a bid ASAP" is exactly the sort of thing written down by someone about to get busy with something else.
 *
 * Only called when there is something to say -- see the cron. A digest that arrives every morning saying
 * "nothing due" is one people stop opening, and then the morning it matters it goes unread with the rest.
 *
 * Platform identity like the other internal notices: AquaRunner reporting to its own customer about their
 * account, so no white-label branding. The markup is rendered by lib/mail/task-digest-email.ts, which is
 * pure so it can be looked at without sending anything.
 */
export async function sendTaskDigestEmail(input: TaskDigestEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  if (input.to.length === 0) return { ok: false, error: "No recipient — no support address and no admin users." };

  const { subject, html } = renderTaskDigestEmail(input);
  const resend = new Resend(apiKey);
  try {
    const result = await resend.emails.send({ from: resolveFromAddress(), to: input.to, subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

export async function sendCustomerAccessEndedEmail(input: CustomerAccessEndedEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  // Platform identity deliberately, unlike the other customer-facing emails: this one is AquaRunner
  // telling a customer their access ended and offering AquaRunner Compliance, so it carries no
  // white-label branding and sending it as the pool company would misattribute it.
  const fromAddress = resolveFromAddress();

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
      replyTo: input.replyTo ?? undefined,
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
