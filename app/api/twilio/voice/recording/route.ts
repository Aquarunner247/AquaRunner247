import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { unavailableTwiml, callCompleteTwiml } from "@/lib/phone-agent-flow";

export const runtime = "nodejs";

function xmlResponse(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

/**
 * <Record>'s action callback -- fires once the caller's message is captured (max length
 * reached, silence detected, or they hung up). Marks the call COMPLETED and records
 * recording/duration, increments the org's daily usage, and responds with a closing
 * message. Idempotent on callStatus -- if Twilio retries this webhook (timeout/5xx), a
 * call already COMPLETED is left untouched rather than double-counting usage or
 * double-sending the notification email once that's wired in.
 *
 * Transcript-fetch + LLM parsing (lib/phone-agent-intake.ts) and the notification email
 * (lib/email.ts) are wired in here in later build phases, not this one -- this phase is
 * the TwiML call-flow only. `rawTranscript`/`aiSummary` stay null until then.
 */
export async function POST(req: Request) {
  const url = publicRequestUrl(req);
  const params = await readTwilioParams(req);
  if (!verifyTwilioSignature(req, url, params)) {
    return new NextResponse(null, { status: 403 });
  }

  const callSid = params.CallSid;
  if (!callSid) {
    return xmlResponse(unavailableTwiml());
  }

  const call = await prisma.phoneAgentCall.findUnique({ where: { twilioCallSid: callSid } });
  if (!call) {
    return xmlResponse(unavailableTwiml());
  }

  if (call.callStatus === "COMPLETED") {
    // Already processed -- a Twilio retry of this exact webhook, not a new event.
    return xmlResponse(callCompleteTwiml());
  }

  const recordingUrl = params.RecordingUrl || null;
  const durationSeconds = params.RecordingDuration ? Number(params.RecordingDuration) : null;

  await prisma.$transaction(async (tx) => {
    await tx.phoneAgentCall.update({
      where: { id: call.id },
      data: { callStatus: "COMPLETED", recordingUrl, durationSeconds },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await tx.phoneAgentDailyUsage.upsert({
      where: { organizationId_date: { organizationId: call.organizationId, date: today } },
      create: { organizationId: call.organizationId, date: today, callCount: 1, totalDurationSeconds: durationSeconds ?? 0 },
      update: { callCount: { increment: 1 }, totalDurationSeconds: { increment: durationSeconds ?? 0 } },
    });
  });

  return xmlResponse(callCompleteTwiml());
}
