import { NextResponse } from "next/server";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";

export const runtime = "nodejs";

/**
 * TEMPORARY diagnostic route -- logs the full status callback for the OpenAI Realtime
 * SIP leg added as a conference participant, since we have no other way to see whether
 * that SIP dial actually rang/answered/failed. Remove once the "same as last time" call
 * failure is understood -- same pattern as the earlier phone-match diagnostic route.
 */
export async function POST(req: Request) {
  const url = publicRequestUrl(req);
  const params = await readTwilioParams(req);
  if (!verifyTwilioSignature(req, url, params)) {
    return new NextResponse(null, { status: 403 });
  }

  console.error("[conversational AI DEBUG] SIP participant status callback:", JSON.stringify(params));

  return new NextResponse(null, { status: 204 });
}
