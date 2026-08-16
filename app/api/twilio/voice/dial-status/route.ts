import { NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { unavailableTwiml, handleFallthrough } from "@/lib/phone-agent-flow";

export const runtime = "nodejs";

function xmlResponse(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

/**
 * Twilio's <Dial action> callback -- fires once the primary-line leg ends, with
 * DialCallStatus telling us how. "completed" means someone picked up live; anything else
 * (no-answer/busy/failed/canceled) means it's time to fall through to the interactive
 * voicemail agent, framed as either after-hours or business-hours overflow depending on
 * the org's configured hours at this moment (see lib/phone-agent.ts's resolveRouteReason).
 */
export async function POST(req: Request) {
  const url = publicRequestUrl(req);
  const params = await readTwilioParams(req);
  if (!verifyTwilioSignature(req, url, params)) {
    return new NextResponse(null, { status: 403 });
  }

  const orgId = new URL(req.url).searchParams.get("orgId");
  const callSid = params.CallSid;
  const callerNumber = params.From;
  if (!orgId || !callSid || !callerNumber) {
    return xmlResponse(unavailableTwiml());
  }

  const settings = await prisma.orgPhoneAgentSettings.findUnique({ where: { organizationId: orgId } });
  if (!settings) {
    return xmlResponse(unavailableTwiml());
  }

  if (params.DialCallStatus === "completed") {
    // Picked up live on the primary line -- nothing for the agent to do.
    const response = new twilio.twiml.VoiceResponse();
    response.hangup();
    return xmlResponse(response.toString());
  }

  const gatherUrl = new URL("/api/twilio/voice/gather", url);
  gatherUrl.searchParams.set("orgId", orgId);
  const twiml = await handleFallthrough(settings, callSid, callerNumber, gatherUrl.toString());
  return xmlResponse(twiml);
}
