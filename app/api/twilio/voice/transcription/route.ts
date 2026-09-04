import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { finalizeCallTicket } from "@/lib/phone-agent-ticket";

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

  const transcriptOk = params.TranscriptionStatus === "completed" && Boolean(params.TranscriptionText?.trim());
  const rawTranscript = params.TranscriptionText?.trim() || "(transcription unavailable)";

  await finalizeCallTicket(call.id, rawTranscript, transcriptOk);

  return new NextResponse(null, { status: 200 });
}
