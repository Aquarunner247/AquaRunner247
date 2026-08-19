import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { resolveRouteReason } from "@/lib/phone-agent";
import type { OrgPhoneAgentSettings, PhoneAgentRouteReason } from "@/generated/prisma/client";

const { VoiceResponse } = twilio.twiml;

/** Defense-in-depth beyond the aiPhoneAgentEnabled flag itself -- every route falls back
 * to this if it somehow receives a call for a number with no enabled org attached. */
export function unavailableTwiml(): string {
  const response = new VoiceResponse();
  response.say("This service is not available. Goodbye.");
  response.hangup();
  return response.toString();
}

export function capExceededTwiml(): string {
  const response = new VoiceResponse();
  response.say(
    "We're unable to take your call right now. Please call back during business hours, or try again later. Goodbye.",
  );
  response.hangup();
  return response.toString();
}

/** Looks up the org+settings for an inbound call's `To` number. Null covers both "no org
 * has this number" and "the org exists but the flag is off" -- callers treat both
 * identically (respond with unavailableTwiml()). */
export async function resolveOrgForNumber(toNumber: string) {
  const settings = await prisma.orgPhoneAgentSettings.findUnique({
    where: { twilioPhoneNumber: toNumber },
    include: { organization: true },
  });
  if (!settings || !settings.organization.aiPhoneAgentEnabled) return null;
  return settings;
}

/** Today's usage already at or over this org's configured caps? No caps configured (both
 * null) means unlimited -- caps are opt-in, not a default restriction. */
export async function isOverDailyCap(organizationId: string, settings: OrgPhoneAgentSettings): Promise<boolean> {
  if (settings.maxCallsPerDay == null && settings.maxMinutesPerDay == null) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usage = await prisma.phoneAgentDailyUsage.findUnique({
    where: { organizationId_date: { organizationId, date: today } },
  });
  if (!usage) return false;
  if (settings.maxCallsPerDay != null && usage.callCount >= settings.maxCallsPerDay) return true;
  if (settings.maxMinutesPerDay != null && usage.totalDurationSeconds >= settings.maxMinutesPerDay * 60) return true;
  return false;
}

/** Creates the PhoneAgentCall row the first time a call falls through to the fallback
 * flow, idempotent on twilioCallSid -- a Twilio retry of the step that calls this must
 * not create a duplicate row. Created early (here) rather than at the end of the call, so
 * a caller who hangs up before ever reaching <Record> still leaves a visible row. */
export async function ensureFallbackCall(
  organizationId: string,
  settings: Pick<OrgPhoneAgentSettings, "businessHours">,
  callSid: string,
  callerNumber: string,
) {
  const existing = await prisma.phoneAgentCall.findUnique({ where: { twilioCallSid: callSid } });
  if (existing) return existing;
  const routedAs: PhoneAgentRouteReason = resolveRouteReason(settings, new Date());
  return prisma.phoneAgentCall.create({
    data: { organizationId, twilioCallSid: callSid, callerNumber, routedAs, callStatus: "IN_PROGRESS" },
  });
}

/** The phone-tree prompt -- listens for BOTH speech and DTMF at once (Twilio's Gather
 * `input: ["speech", "dtmf"]`), so a caller can either say why they're calling (routed
 * through the Dialogflow agent, see lib/dialogflow.ts) or press a digit (the original,
 * still fully-supported path -- kept as a guaranteed fallback for anyone who'd rather not
 * talk, or whose speech doesn't get recognized). Every branch, including a total timeout
 * with neither, converges on the same <Record> step in gather/route.ts -- this only
 * decides which greeting plays and what phoneTreeSelection eventually gets recorded. */
export function phoneTreeTwiml(
  settings: Pick<OrgPhoneAgentSettings, "afterHoursGreeting" | "busyOverflowGreeting">,
  routedAs: PhoneAgentRouteReason,
  gatherActionUrl: string,
): string {
  const configuredGreeting = routedAs === "AFTER_HOURS" ? settings.afterHoursGreeting : settings.busyOverflowGreeting;
  const defaultGreeting = routedAs === "AFTER_HOURS" ? "We're closed right now." : "We're unable to take your call right now.";
  const greeting = configuredGreeting ?? defaultGreeting;

  const response = new VoiceResponse();
  const gather = response.gather({
    input: ["speech", "dtmf"],
    numDigits: 1,
    speechTimeout: "auto",
    action: gatherActionUrl,
    method: "POST",
    timeout: 8,
  });
  gather.say(
    `${greeting} Briefly tell me why you're calling, or press 1 for a new service request, 2 if you're an existing customer, 3 if this is urgent, or 4 to leave a message.`,
  );
  // If Gather's own timeout elapses with neither speech nor a digit, Twilio still calls
  // `action` with both empty -- gather/route.ts treats that the same as pressing 4.
  return response.toString();
}

export function recordTwiml(
  recordActionUrl: string,
  transcribeCallbackUrl: string,
  maxDurationSeconds: number,
  prompt: string,
): string {
  const response = new VoiceResponse();
  response.say(prompt);
  response.record({
    action: recordActionUrl,
    method: "POST",
    maxLength: maxDurationSeconds,
    playBeep: true,
    // Twilio's own transcription -- async, arrives later via transcribeCallback (a
    // separate webhook, voice/transcription/route.ts) once processing finishes, not
    // synchronously within this call. recordActionUrl (recording/route.ts) only ever
    // sees the audio metadata, never transcript text.
    transcribe: true,
    transcribeCallback: transcribeCallbackUrl,
  });
  // If the caller hangs up without ever triggering <Record>'s action (e.g. mid-prompt),
  // the call simply ends here -- the PhoneAgentCall row stays callStatus: IN_PROGRESS,
  // which is exactly the "still visible, not silently lost" behavior the ABANDONED status
  // exists for (a periodic sweep marking stale IN_PROGRESS rows is a documented follow-up,
  // not built in this pass).
  return response.toString();
}

/** Shared by both callers of the fallback flow -- voice/route.ts (no primary number
 * configured at all) and dial-status/route.ts (primary line rang unanswered/busy/failed).
 * Ensures the call row exists, then builds the phone-tree TwiML for it. */
export async function handleFallthrough(
  settings: OrgPhoneAgentSettings,
  callSid: string,
  callerNumber: string,
  gatherActionUrl: string,
): Promise<string> {
  const call = await ensureFallbackCall(settings.organizationId, settings, callSid, callerNumber);
  return phoneTreeTwiml(settings, call.routedAs, gatherActionUrl);
}

export function callCompleteTwiml(): string {
  const response = new VoiceResponse();
  response.say("Thanks, we've got your message and will get back to you. Goodbye.");
  response.hangup();
  return response.toString();
}
