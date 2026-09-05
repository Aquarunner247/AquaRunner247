import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { getTwilioClient } from "@/lib/twilio-client";
import { openaiSipUri } from "@/lib/conversational-ai";

export const runtime = "nodejs";

/**
 * Twilio's <Conference statusCallbackEvent="join"> callback. Fires once for our own
 * caller joining (the trigger to bring OpenAI's Realtime SIP endpoint into this same
 * conference as a second participant) and again when that OpenAI leg itself joins --
 * `originalCallSid` (threaded through from dial-status/route.ts) distinguishes the two so
 * the second firing is a no-op rather than trying to add a participant twice.
 */
export async function POST(req: Request) {
  const url = publicRequestUrl(req);
  const params = await readTwilioParams(req);
  if (!verifyTwilioSignature(req, url, params)) {
    return new NextResponse(null, { status: 403 });
  }

  const searchParams = new URL(req.url).searchParams;
  const originalCallSid = searchParams.get("originalCallSid");
  const orgId = searchParams.get("orgId");
  const conferenceSid = params.ConferenceSid;

  if (!originalCallSid || !orgId || !conferenceSid || params.CallSid !== originalCallSid) {
    // Either malformed, or this is the OpenAI leg's own join firing the same callback --
    // nothing to do either way.
    return new NextResponse(null, { status: 204 });
  }

  const client = getTwilioClient();
  if (!client) {
    console.error("[conversational AI] Twilio REST client unavailable -- missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN");
    return new NextResponse(null, { status: 204 });
  }

  // `from`, when formatted as a phone number, must be a number this Twilio account owns
  // or has verified as an outgoing caller ID (per Twilio's own docs) -- the org's own
  // Twilio number is the one guaranteed to qualify. This alone does not resolve every
  // failure mode seen against OpenAI's SIP endpoint (see phone-agent-setup.md's Open
  // Items -- calls have failed with a SIP 400 immediately, 0-duration, that diagnostics
  // traced to OpenAI's own gateway rejecting the INVITE, not anything here), but it's
  // still the correct value to send regardless.
  const settings = await prisma.orgPhoneAgentSettings.findUnique({
    where: { organizationId: orgId },
    select: { twilioPhoneNumber: true },
  });
  if (!settings?.twilioPhoneNumber) {
    console.error("[conversational AI] no twilioPhoneNumber configured for org", orgId);
    return new NextResponse(null, { status: 204 });
  }

  try {
    await client.conferences(conferenceSid).participants.create({
      from: settings.twilioPhoneNumber,
      to: openaiSipUri(params.FriendlyName ?? ""),
    });
  } catch (err) {
    console.error("[conversational AI] failed to add OpenAI Realtime SIP participant:", err);
  }

  return new NextResponse(null, { status: 204 });
}
