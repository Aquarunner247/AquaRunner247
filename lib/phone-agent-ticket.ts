import { prisma } from "@/lib/prisma";
import { parseCallTranscript } from "@/lib/phone-agent-intake";
import { sendPhoneAgentTicketEmail } from "@/lib/email";
import type { PhoneAgentCall, PhoneAgentIssueType, PhoneAgentUrgency } from "@/generated/prisma/client";

/**
 * Turns a finished call's raw transcript into structured ticket fields and sends the
 * escalation email -- shared by both ticket-producing paths: the voicemail path
 * (app/api/twilio/voice/transcription/route.ts, transcript from Twilio's own async
 * transcription) and the conversational-AI path (app/api/openai/realtime-incoming's
 * background transcript accumulator, transcript built live from Realtime events).
 * Extracted here specifically so both paths produce identically-shaped tickets rather
 * than two hand-maintained copies of the same ~50 lines.
 *
 * Idempotent on rawTranscript already being set, same as the original inline version --
 * a retry (or, for the conversational path, an unexpected double-finalize) must not
 * re-run the LLM call or re-send the notification email.
 */
export async function finalizeCallTicket(callId: string, rawTranscript: string, transcriptOk: boolean): Promise<void> {
  const call = await prisma.phoneAgentCall.findUnique({ where: { id: callId } });
  if (!call || call.rawTranscript != null) return;

  const settings = await prisma.orgPhoneAgentSettings.findUnique({ where: { organizationId: call.organizationId } });
  const organization = await prisma.organization.findUnique({
    where: { id: call.organizationId },
    select: { name: true },
  });

  let parsed: Awaited<ReturnType<typeof parseCallTranscript>> | null = null;
  if (transcriptOk) {
    try {
      parsed = await parseCallTranscript(rawTranscript, settings?.allowedIssueTypes ?? []);
    } catch (err) {
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
      // See parseCallTranscript's own comment -- these values are always valid enum
      // members by construction, TypeScript just can't narrow the dynamically-built
      // zod schema's enum type on its own.
      issueType: (parsed?.issueType as PhoneAgentIssueType | undefined) ?? null,
      urgency: (parsed?.urgency as PhoneAgentUrgency | undefined) ?? null,
      requestedCallbackTime: parsed?.requestedCallbackTime ?? null,
      callStatus: "COMPLETED",
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
}

export type { PhoneAgentCall };
