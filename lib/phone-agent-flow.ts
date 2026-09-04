import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { resolveRouteReason } from "@/lib/phone-agent";
import { matchCallerToProperty, normalizePhone, type PhoneMatch } from "@/lib/phone-match";
import type { OrgPhoneAgentSettings, PhoneAgentRouteReason } from "@/generated/prisma/client";
import type VoiceResponseNamespace from "twilio/lib/twiml/VoiceResponse";

const { VoiceResponse } = twilio.twiml;

/** Prisma-backed lookup, always scoped to one organization -- never queries across orgs.
 * Scans every property in the org per call; fine at current org sizes (see
 * phone-agent-setup.md's Open items for the indexed-column follow-up if this ever
 * matters at scale). Kept here (not in lib/phone-match.ts) so that file stays free of
 * any Prisma import and its pure matching logic can be unit-tested without a database. */
async function findPropertyByCallerNumber(organizationId: string, callerNumber: string): Promise<PhoneMatch | null> {
  if (!normalizePhone(callerNumber)) return null;

  const properties = await prisma.property.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      customerId: true,
      customer: { select: { name: true } },
      managerBusinessPhone: true,
      managerMobilePhone: true,
      managerPhone: true,
      maintenanceCellPhone: true,
      ownerMobilePhone: true,
      ownerHomePhone: true,
    },
  });

  return matchCallerToProperty(callerNumber, properties);
}

/** Chosen in Dialogflow's voice picker, then matched to Twilio's <Say> support -- Twilio's
 * Google Chirp3-HD offering only covers 8 voice names (Aoede, Charon, Fenrir, Kore, Leda,
 * Orus, Puck, Zephyr) per locale, not Google's full Chirp3-HD roster, so the exact voice
 * saved in Dialogflow (en-US-Chirp3-HD-Laomedeia) isn't available here -- Aoede was picked
 * as the closest available match. Dialogflow's own voice setting has no effect on what
 * callers actually hear: this app only uses Dialogflow's detectIntent for text-based intent
 * classification, never its TTS/audio output -- all spoken audio comes from Twilio's <Say>. */
const AGENT_VOICE = "Google.en-US-Chirp3-HD-Aoede" as const;
/** 1.1x speaking rate / +3dB volume, as configured in Dialogflow -- applied here via SSML
 * <prosody> since that's what actually reaches callers. rate uses Twilio/SSML's percentage
 * format (Dialogflow's 1.1x multiplier -> "110%"), not Dialogflow's own rate scale. */
const AGENT_PROSODY = { rate: "110%", volume: "+3dB" } as const;

/** Speaks `text` in the configured agent voice/rate/volume. Works on both VoiceResponse
 * itself and a <Gather> (both expose the same .say() shape) -- matches every call site in
 * this file, which alternates between the two depending on whether the prompt needs to
 * also collect input. */
function say(container: InstanceType<typeof VoiceResponse> | VoiceResponseNamespace.Gather, text: string) {
  container.say({ voice: AGENT_VOICE }, "").prosody(AGENT_PROSODY, text);
}

/** Defense-in-depth beyond the aiPhoneAgentEnabled flag itself -- every route falls back
 * to this if it somehow receives a call for a number with no enabled org attached. */
export function unavailableTwiml(): string {
  const response = new VoiceResponse();
  say(response, "This service is not available. Goodbye.");
  response.hangup();
  return response.toString();
}

export function capExceededTwiml(): string {
  const response = new VoiceResponse();
  say(response, "We're unable to take your call right now. Please call back during business hours, or try again later. Goodbye.");
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
  // Only run the caller-ID match on first creation, not the early-return above -- a
  // Twilio webhook retry (timeout/5xx) hitting this again shouldn't re-scan the org's
  // properties for a call that's already been matched (or already came up empty).
  const match = await findPropertyByCallerNumber(organizationId, callerNumber);
  return prisma.phoneAgentCall.create({
    data: {
      organizationId,
      twilioCallSid: callSid,
      callerNumber,
      routedAs,
      callStatus: "IN_PROGRESS",
      matchedPropertyId: match?.propertyId ?? null,
      matchedPhoneField: match?.matchedField ?? null,
    },
  });
}

/** The phone-tree prompt -- listens for BOTH speech and DTMF at once (Twilio's Gather
 * `input: ["speech", "dtmf"]`), so a caller can either say why they're calling (routed
 * through the Dialogflow agent, see lib/dialogflow.ts) or press a digit (the original,
 * still fully-supported path -- kept as a guaranteed fallback for anyone who'd rather not
 * talk, or whose speech doesn't get recognized). Every branch, including a total timeout
 * with neither, converges on the same <Record> step in gather/route.ts -- this only
 * decides which greeting plays and what phoneTreeSelection eventually gets recorded. */
/** For a caller matched to a Property by Caller ID (see lib/phone-match.ts), this
 * replaces the greeting + prompt entirely rather than layering onto it -- it already
 * functions as a complete, open-ended prompt on its own. Deliberately generic: no name,
 * address, or other account detail is ever spoken here, since Caller ID is this system's
 * only authentication factor and can be spoofed -- "we recognize this number" leaks
 * nothing a spoofed caller couldn't already have guessed by dialing in. */
const RECOGNIZED_CALLER_PROMPT =
  "Hello, we recognize the number you're calling from. Thank you for being our valued customer. How may I assist you today?";

export function phoneTreeTwiml(
  settings: Pick<OrgPhoneAgentSettings, "afterHoursGreeting" | "busyOverflowGreeting">,
  routedAs: PhoneAgentRouteReason,
  gatherActionUrl: string,
  matched: boolean,
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
  const prompt = matched
    ? RECOGNIZED_CALLER_PROMPT
    : `${greeting} Tell me briefly why you're calling -- for example, a new service request, a question about your existing service, if this is urgent, or if you'd just like to leave a message.`;
  say(gather, prompt);
  // DTMF is still accepted (input includes "dtmf" above) as a silent fallback for anyone
  // who presses a digit out of habit, but deliberately isn't announced anymore now that
  // speech recognition is confirmed working -- saying both "tell me" and "press 1/2/3/4"
  // read as confusing/redundant once natural speech is the primary path.
  // If Gather's own timeout elapses with neither speech nor a digit, Twilio still calls
  // `action` with both empty -- gather/route.ts treats that the same as pressing 4.
  return response.toString();
}

/** For a caller who flagged their call as urgent -- instead of funneling straight to
 * voicemail like every other selection, tries the org's real business line one more time.
 * `dialStatusUrl` should point at emergency-dial-status/route.ts, which falls back to
 * <Record> (skipping the phone tree entirely, since we already know this is urgent) if
 * this second attempt also goes unanswered. */
export function emergencyRedialTwiml(
  primaryPhoneNumber: string,
  ringTimeoutSeconds: number,
  dialStatusUrl: string,
  spokenConfirmation: string | null,
): string {
  const response = new VoiceResponse();
  const message = spokenConfirmation
    ? `${spokenConfirmation} Let me try connecting you to our team right now.`
    : "This sounds urgent -- let me try connecting you to our team right now.";
  say(response, message);
  const dial = response.dial({ timeout: ringTimeoutSeconds, action: dialStatusUrl, method: "POST" });
  dial.number(primaryPhoneNumber);
  return response.toString();
}

export function recordTwiml(
  recordActionUrl: string,
  transcribeCallbackUrl: string,
  maxDurationSeconds: number,
  prompt: string,
): string {
  const response = new VoiceResponse();
  say(response, prompt);
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
  return phoneTreeTwiml(settings, call.routedAs, gatherActionUrl, call.matchedPropertyId != null);
}

export function callCompleteTwiml(): string {
  const response = new VoiceResponse();
  say(response, "Thanks, we've got your message and will get back to you. Goodbye.");
  response.hangup();
  return response.toString();
}
