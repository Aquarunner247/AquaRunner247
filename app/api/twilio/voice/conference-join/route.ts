import { NextResponse } from "next/server";
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
  const callerNumber = searchParams.get("callerNumber");
  const callToken = searchParams.get("callToken");
  const conferenceSid = params.ConferenceSid;

  if (!originalCallSid || !callerNumber || !conferenceSid || params.CallSid !== originalCallSid) {
    // Either malformed, or this is the OpenAI leg's own join firing the same callback --
    // nothing to do either way.
    return new NextResponse(null, { status: 204 });
  }

  const client = getTwilioClient();
  if (!client) {
    console.error("[conversational AI] Twilio REST client unavailable -- missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN");
    return new NextResponse(null, { status: 204 });
  }

  try {
    await client.conferences(conferenceSid).participants.create({
      from: callerNumber,
      to: openaiSipUri(params.FriendlyName ?? ""),
      ...(callToken ? { callToken } : {}),
    });
  } catch (err) {
    console.error("[conversational AI] failed to add OpenAI Realtime SIP participant:", err);
  }

  return new NextResponse(null, { status: 204 });
}
