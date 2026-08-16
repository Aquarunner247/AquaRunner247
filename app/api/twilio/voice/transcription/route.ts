import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { parseCallTranscript } from "@/lib/phone-agent-intake";
import { sendPhoneAgentTicketEmail } from "@/lib/email";
import type { PhoneAgentIssueType, PhoneAgentUrgency } from "@/generated/prisma/client";

export const runtime = "nodejs";

/**
 * Twilio's transcribeCallback -- fires asynchronously once transcription of the
 * <Record>'d message finishes, well after the call itself has already ended (so this
 * responds plain 200, not TwiML -- there's no live call to steer anymore). This is where
 * the actual LLM parsing (lib/phone-agent-intake.ts) and the escalation-contact
 * notification email happen, since both need real transcript text that doesn't exist yet
 * when recording/route.ts runs.
 *
 * Idempotent on whether rawTranscript is already set -- a Twilio retry of this webhook
 * must not re-run the LLM call or re-send the notification email.
 */
export async function POST(req: Request) {
  const url = publicRequestUrl(req);
  const params = await readTwilioParams(req);
  if (!verifyTwilioSignature(req, url, params)) {
    return new NextResponse(null, { status: 403 });
  }

  const callSid = params.CallSid;
  if (!callSid) {
    return new NextResponse(null, { status: 200 });
  }

  const call = await prisma.phoneAgentCall.findUnique({ where: { twilioCallSid: callSid } });
  if (!call || call.rawTranscript != null) {
    // No matching call, or already processed (retry) -- nothing to do.
    return new NextResponse(null, { status: 200 });
  }

  const settings = await prisma.orgPhoneAgentSettings.findUnique({ where: { organizationId: call.organizationId } });
  const organization = await prisma.organization.findUnique({
    where: { id: call.organizationId },
    select: { name: true },
  });

  const transcriptOk = params.TranscriptionStatus === "completed" && Boolean(params.TranscriptionText?.trim());
  const rawTranscript = params.TranscriptionText?.trim() || "(transcription unavailable)";

  let parsed: Awaited<ReturnType<typeof parseCallTranscript>> | null = null;
  if (transcriptOk) {
    try {
      parsed = await parseCallTranscript(rawTranscript, settings?.allowedIssueTypes ?? []);
    } catch (err) {
      // LLM call failed -- still record the raw transcript and notify with what we have
      // (parsed stays null) rather than losing the ticket entirely.
      console.error("[phone agent] transcript parsing failed:", err);
    }
  }

  await prisma.phoneAgentCall.update({
    where: { id: call.id },
    data: {
      rawTranscript,
      aiSummary: parsed?.summary ?? null,
      callerName: parsed?.callerName ?? null,
      callerCallbackNumber: parsed?.callerCallbackNumber ?? null,
      propertyAddress: parsed?.propertyAddress ?? null,
      // parseCallTranscript's zod schema is built dynamically (its enum values come from
      // a runtime array), so TypeScript can't narrow it to the Prisma enum type on its
      // own -- the values are always valid members of it by construction (schemaFor()
      // only ever builds the enum from PhoneAgentIssueType values plus "OTHER").
      issueType: (parsed?.issueType as PhoneAgentIssueType | undefined) ?? null,
      urgency: (parsed?.urgency as PhoneAgentUrgency | undefined) ?? null,
      requestedCallbackTime: parsed?.requestedCallbackTime ?? null,
    },
  });

  const escalationEmails = settings?.escalationEmails ?? [];
  if (escalationEmails.length > 0) {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://aquarunner247.com"}/dashboard/phone-agent`;
    await Promise.all(
      escalationEmails.map((to) =>
        sendPhoneAgentTicketEmail({
          to,
          organizationName: organization?.name ?? "Your organization",
          routedAs: call.routedAs,
          callerNumber: call.callerNumber,
          callerName: parsed?.callerName ?? null,
          callerCallbackNumber: parsed?.callerCallbackNumber ?? null,
          propertyAddress: parsed?.propertyAddress ?? null,
          issueType: parsed?.issueType ?? null,
          urgency: parsed?.urgency ?? null,
          requestedCallbackTime: parsed?.requestedCallbackTime ?? null,
          summary: parsed?.summary ?? null,
          recordingUrl: call.recordingUrl,
          dashboardUrl,
        }),
      ),
    );
  }

  return new NextResponse(null, { status: 200 });
}
