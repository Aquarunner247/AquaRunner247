import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { unavailableTwiml, recordTwiml } from "@/lib/phone-agent-flow";
import type { PhoneAgentPhoneTreeSelection } from "@/generated/prisma/client";

export const runtime = "nodejs";

function xmlResponse(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

const DEFAULT_MAX_RECORD_SECONDS = 120;

/** 1=new request, 2=existing customer, 3=urgent, 4=leave a message. Anything else
 * (invalid digit, or no digit -- Gather's own timeout still calls this action with empty
 * Digits) defaults to MESSAGE rather than failing the call. */
function mapDigitToSelection(digits: string | undefined): PhoneAgentPhoneTreeSelection {
  switch (digits) {
    case "1":
      return "NEW_REQUEST";
    case "2":
      return "EXISTING_CUSTOMER";
    case "3":
      return "URGENT";
    default:
      return "MESSAGE";
  }
}

/**
 * Handles the DTMF digit pressed in the phone tree (or its absence, on Gather timeout).
 * Every branch converges on the same <Record> step -- the digit only decides what gets
 * stored as phoneTreeSelection and a short tailored prompt before recording.
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

  const settings = await prisma.orgPhoneAgentSettings.findUnique({ where: { organizationId: call.organizationId } });
  const maxSeconds = settings?.maxCallDurationSeconds ?? DEFAULT_MAX_RECORD_SECONDS;

  const selection = mapDigitToSelection(params.Digits);
  await prisma.phoneAgentCall.update({ where: { id: call.id }, data: { phoneTreeSelection: selection } });

  const recordUrl = new URL("/api/twilio/voice/recording", url);
  const prompt =
    selection === "URGENT"
      ? "Please describe the urgent issue and your address after the tone. We'll prioritize a callback."
      : "Please describe your request, including your name, address, and a good callback number, after the tone.";
  const twiml = recordTwiml(recordUrl.toString(), maxSeconds, prompt);
  return xmlResponse(twiml);
}
