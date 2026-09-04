import { NextResponse } from "next/server";
import twilio from "twilio";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { resolveOrgForNumber, isOverDailyCap, unavailableTwiml, capExceededTwiml, handleFallthrough } from "@/lib/phone-agent-flow";

export const runtime = "nodejs";

function xmlResponse(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

/**
 * Initial inbound-call webhook. Rings the org's real business line first (<Dial>); only
 * falls through to the interactive-voicemail agent if that leg comes back no-answer/busy/
 * failed (handled in dial-status/route.ts's action callback). This is what makes the
 * agent work both genuinely after-hours (nobody's there) and during business hours when
 * the owner is just busy (rings, no answer, falls through) -- the org's configured hours
 * never gate *whether* the agent answers, only what the caller hears once it does.
 */
export async function POST(req: Request) {
  const url = publicRequestUrl(req);
  const params = await readTwilioParams(req);
  if (!verifyTwilioSignature(req, url, params)) {
    return new NextResponse(null, { status: 403 });
  }

  const toNumber = params.To;
  const callSid = params.CallSid;
  const callerNumber = params.From;
  const settings = toNumber ? await resolveOrgForNumber(toNumber) : null;
  if (!settings || !callSid || !callerNumber) {
    return xmlResponse(unavailableTwiml());
  }

  if (await isOverDailyCap(settings.organizationId, settings)) {
    return xmlResponse(capExceededTwiml());
  }

  const { VoiceResponse } = twilio.twiml;

  if (!settings.primaryPhoneNumber) {
    // No primary line configured yet for this org -- there's nothing to dial, so go
    // straight to the fallback flow instead of dialing an empty number.
    const gatherUrl = new URL("/api/twilio/voice/gather", url);
    gatherUrl.searchParams.set("orgId", settings.organizationId);
    const twiml = await handleFallthrough(settings, callSid, callerNumber, gatherUrl.toString());
    return xmlResponse(twiml);
  }

  const dialStatusUrl = new URL("/api/twilio/voice/dial-status", url);
  dialStatusUrl.searchParams.set("orgId", settings.organizationId);
  // CallToken is only ever present on this first inbound webhook -- capture and thread it
  // through now (same pattern as orgId above), since dial-status needs it later to add
  // OpenAI's Realtime SIP endpoint as a conference participant (see
  // lib/conversational-ai.ts), and by then Twilio no longer supplies it.
  if (params.CallToken) {
    dialStatusUrl.searchParams.set("callToken", params.CallToken);
  }

  const response = new VoiceResponse();
  const dial = response.dial({
    timeout: settings.ringTimeoutSeconds,
    action: dialStatusUrl.toString(),
    method: "POST",
  });
  dial.number(settings.primaryPhoneNumber);
  return xmlResponse(response.toString());
}
