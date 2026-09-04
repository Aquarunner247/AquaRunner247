import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, publicRequestUrl, readTwilioParams } from "@/lib/twilio-verify";
import { unavailableTwiml, recordTwiml, emergencyRedialTwiml } from "@/lib/phone-agent-flow";
import { detectIntent } from "@/lib/dialogflow";
import type { PhoneAgentPhoneTreeSelection } from "@/generated/prisma/client";

export const runtime = "nodejs";

function xmlResponse(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

const DEFAULT_MAX_RECORD_SECONDS = 120;

/** 1=new request, 2=existing customer, 3=urgent, 4=leave a message. Anything else
 * (invalid digit, or no digit) defaults to MESSAGE rather than failing the call. */
function mapDigitToSelection(digits: string): PhoneAgentPhoneTreeSelection {
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
 * Handles whatever the caller gave the phone-tree Gather step -- a DTMF digit (checked
 * first, since it's the original, still fully-supported path) or spoken words (routed
 * through the Dialogflow ES agent -- see lib/dialogflow.ts), or neither on a total
 * timeout. URGENT gets a second real ring attempt on the primary line instead of going
 * to voicemail (see emergencyRedialTwiml); every other selection converges on the same
 * <Record> step, with the selection only deciding what gets stored as phoneTreeSelection
 * and a short tailored prompt before recording.
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

  let selection: PhoneAgentPhoneTreeSelection;
  let spokenConfirmation: string | null = null;

  if (params.Digits) {
    selection = mapDigitToSelection(params.Digits);
  } else if (params.SpeechResult) {
    const result = await detectIntent(callSid, params.SpeechResult);
    selection = result?.selection ?? "MESSAGE";
    spokenConfirmation = result?.fulfillmentText ?? null;
  } else {
    // Gather's own timeout elapsed with neither a digit nor speech -- same default as an
    // unrecognized digit.
    selection = "MESSAGE";
  }

  await prisma.phoneAgentCall.update({ where: { id: call.id }, data: { phoneTreeSelection: selection } });

  // Urgent calls get one more real ring attempt on the org's actual business line instead
  // of going straight to voicemail like every other selection -- only if a primary number
  // is even configured; otherwise there's nothing to redial, fall through to <Record>.
  if (selection === "URGENT" && settings?.primaryPhoneNumber) {
    const emergencyDialStatusUrl = new URL("/api/twilio/voice/emergency-dial-status", url);
    emergencyDialStatusUrl.searchParams.set("orgId", call.organizationId);
    const twiml = emergencyRedialTwiml(
      settings.primaryPhoneNumber,
      settings.ringTimeoutSeconds,
      emergencyDialStatusUrl.toString(),
      spokenConfirmation,
    );
    return xmlResponse(twiml);
  }

  const recordUrl = new URL("/api/twilio/voice/recording", url);
  const transcribeUrl = new URL("/api/twilio/voice/transcription", url);
  const instructions =
    selection === "URGENT"
      ? "Go ahead and describe the urgent issue and your address after the tone. We'll prioritize getting back to you."
      : "After the tone, go ahead and share your name, address, and a good number to reach you, along with what you need.";
  const prompt = spokenConfirmation ? `${spokenConfirmation} ${instructions}` : instructions;
  const twiml = recordTwiml(recordUrl.toString(), transcribeUrl.toString(), maxSeconds, prompt);
  return xmlResponse(twiml);
}
