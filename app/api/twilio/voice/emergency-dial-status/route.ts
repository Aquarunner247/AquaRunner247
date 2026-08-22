import { NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { unavailableTwiml, recordTwiml } from "@/lib/phone-agent-flow";

export const runtime = "nodejs";

function xmlResponse(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

const DEFAULT_MAX_RECORD_SECONDS = 120;

/**
 * <Dial action> callback for the emergency re-dial (gather/route.ts's URGENT branch tries
 * the org's real business line a second time before giving up). "completed" means someone
 * picked up live this time -- otherwise falls straight to <Record> with an urgent-specific
 * prompt, skipping the phone tree entirely since we already know this call is urgent.
 */
export async function POST(req: Request) {
  const url = publicRequestUrl(req);
  const params = await readTwilioParams(req);
  if (!verifyTwilioSignature(req, url, params)) {
    return new NextResponse(null, { status: 403 });
  }

  const orgId = new URL(req.url).searchParams.get("orgId");
  const callSid = params.CallSid;
  if (!orgId || !callSid) {
    return xmlResponse(unavailableTwiml());
  }

  if (params.DialCallStatus === "completed") {
    // Picked up live on the second attempt -- nothing more for the agent to do.
    const response = new twilio.twiml.VoiceResponse();
    response.hangup();
    return xmlResponse(response.toString());
  }

  const settings = await prisma.orgPhoneAgentSettings.findUnique({ where: { organizationId: orgId } });
  const maxSeconds = settings?.maxCallDurationSeconds ?? DEFAULT_MAX_RECORD_SECONDS;

  const recordUrl = new URL("/api/twilio/voice/recording", url);
  const transcribeUrl = new URL("/api/twilio/voice/transcription", url);
  const twiml = recordTwiml(
    recordUrl.toString(),
    transcribeUrl.toString(),
    maxSeconds,
    "We still couldn't reach anyone. Please describe the urgent issue and your address after the tone -- we'll prioritize a callback.",
  );
  return xmlResponse(twiml);
}
