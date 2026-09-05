import twilio from "twilio";
import OpenAI from "openai";
import { OpenAIRealtimeWS } from "openai/realtime/ws";
import { finalizeCallTicket } from "@/lib/phone-agent-ticket";
import { answerRealtimeTool } from "@/lib/phone-agent-status";
import { WEEKDAY_KEYS, type BusinessHours } from "@/lib/phone-agent";
import type { RealtimeFunctionTool } from "openai/resources/realtime/realtime";
import type { OrgPhoneAgentSettings, PhoneAgentCall, PhoneAgentIssueType } from "@/generated/prisma/client";

const { VoiceResponse } = twilio.twiml;

const CONFERENCE_NAME_PREFIX = "conversational-ai-";

/** Deterministic, not random -- derived from the Twilio CallSid so it's reconstructible
 * and loggable (grep a CallSid, find its conference) rather than an opaque UUID. */
export function conferenceNameForCall(callSid: string): string {
  return `${CONFERENCE_NAME_PREFIX}${callSid}`;
}

/** Reverses conferenceNameForCall -- used by the OpenAI accept-webhook, which only knows
 * the conference name (read back off the X-conferenceName SIP header Twilio attaches from
 * the SIP URI's query param, per Twilio's own convention for query params on a `sip:`
 * dial target), to find which PhoneAgentCall this incoming SIP session belongs to. */
export function callSidFromConferenceName(conferenceName: string): string | null {
  if (!conferenceName.startsWith(CONFERENCE_NAME_PREFIX)) return null;
  return conferenceName.slice(CONFERENCE_NAME_PREFIX.length);
}

/** SIP headers arrive as a name/value array, not an object, and header names are
 * conventionally case-insensitive. */
export function findSipHeader(headers: { name: string; value: string }[], name: string): string | null {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/** System instructions for the live conversational agent -- covers the same ground the
 * scripted phone-tree prompt does today (why calling, urgency, callback info), reframed
 * as guidance for a model instead of a TwiML string. Deliberately does not speak a
 * caller's own matched name/address into the conversation unprompted, for the same
 * reason RECOGNIZED_CALLER_PROMPT in lib/phone-agent-flow.ts doesn't -- Caller ID is this
 * system's only authentication factor and can be spoofed. */
type TranscriptLine = { speaker: "Caller" | "Agent"; text: string };

const SIDEBAND_CONNECT_MAX_ATTEMPTS = 15;
const SIDEBAND_CONNECT_RETRY_DELAY_MS = 350;

/** A 200 from accept() only means the SIP leg is ringing and the Realtime session is
 * being established -- attaching the sideband WebSocket immediately after can race that
 * setup and 404 (per OpenAI support). Retries with a fresh connection attempt each time
 * (a socket that's already errored/closed can't be reused). Polls every 350ms rather than
 * a coarser interval so the connect (and the greeting it triggers, see
 * monitorRealtimeCallTranscript) lands as close as possible to whenever the session
 * actually becomes attachable, instead of quantized dead air on top of it -- ~4.9s total
 * ceiling, covering OpenAI's own suggested 2-5s window with margin. This doesn't shrink
 * OpenAI's actual server-side session-setup time, only the polling overshoot on top of it. */
async function connectSidebandWithRetry(openaiCallId: string, client: OpenAI): Promise<OpenAIRealtimeWS | null> {
  for (let attempt = 1; attempt <= SIDEBAND_CONNECT_MAX_ATTEMPTS; attempt++) {
    const realtime = new OpenAIRealtimeWS({ callID: openaiCallId }, client);

    const connected = await new Promise<boolean>((resolve) => {
      let settled = false;
      const onOpen = () => {
        if (settled) return;
        settled = true;
        realtime.socket.off("open", onOpen);
        realtime.socket.off("error", onError);
        resolve(true);
      };
      const onError = (err: unknown) => {
        if (settled) return;
        settled = true;
        realtime.socket.off("open", onOpen);
        realtime.socket.off("error", onError);
        // A retry succeeding after this is normal (see the function's own doc comment on
        // the accept()/session-establishment race) -- warn, not error, per attempt.
        console.warn(`[conversational AI] sideband WS attempt ${attempt}/${SIDEBAND_CONNECT_MAX_ATTEMPTS} failed:`, err);
        resolve(false);
      };
      // The SDK's own docs warn that a failed connection is reported as an unhandled
      // promise rejection unless something is subscribed to the emitter's own "error"
      // event (not just the raw socket's) -- confirmed by reading its internal _onError,
      // which re-emits at this level. Without this listener, every failed retry attempt
      // crashed the background function with "Node.js process exited with exit status: 128".
      realtime.on("error", () => {});
      realtime.socket.on("open", onOpen);
      realtime.socket.on("error", onError);
    });

    if (connected) return realtime;
    if (attempt < SIDEBAND_CONNECT_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, SIDEBAND_CONNECT_RETRY_DELAY_MS));
    }
  }
  return null;
}

/**
 * Attaches to an already-accepted Realtime SIP call (see
 * app/api/openai/realtime-incoming/route.ts) purely to accumulate a transcript for the
 * existing ticket pipeline -- audio itself flows directly Twilio <-> OpenAI over the SIP
 * leg, never through this process. Runs for the call's duration via Vercel's waitUntil,
 * so it's still bound by the hosting function's max-duration ceiling (see
 * phone-agent-setup.md's Open Items) -- if that's hit before the call ends, whatever
 * transcript was captured so far is still finalized rather than lost entirely.
 *
 * No documented realtime.call.ended webhook or post-call transcript endpoint exists as
 * of this writing (verified during planning) -- this live-accumulation approach is the
 * only way to get a transcript at all, not a choice made for its own sake.
 */
export async function monitorRealtimeCallTranscript(
  call: Pick<PhoneAgentCall, "id" | "organizationId" | "matchedPropertyId">,
  openaiCallId: string,
  client: OpenAI,
): Promise<void> {
  const lines: TranscriptLine[] = [];

  const realtime = await connectSidebandWithRetry(openaiCallId, client);
  if (!realtime) {
    console.error("[conversational AI] sideband WS never connected after retries -- no transcript for this call");
    await finalizeCallTicket(call.id, "(transcription unavailable)", false);
    return;
  }

  // Without this, the model just waits on server VAD for the caller to speak first --
  // normal phone etiquette is the opposite (whoever picks up greets first), and the
  // caller has no way to know they've reached an AI agent rather than dead air. Fires as
  // soon as the sideband WS attaches (same ~0-4s race window as the attach itself, see
  // connectSidebandWithRetry's doc comment) -- a short delay before the greeting starts is
  // an accepted tradeoff of this architecture, not something worth engineering around here.
  realtime.send({ type: "response.create" });

  realtime.on("conversation.item.input_audio_transcription.completed", (event) => {
    if (event.transcript.trim()) lines.push({ speaker: "Caller", text: event.transcript.trim() });
  });
  realtime.on("response.output_audio_transcript.done", (event) => {
    if (event.transcript.trim()) lines.push({ speaker: "Agent", text: event.transcript.trim() });
  });
  // Only ever registered on accept() when call.matchedPropertyId is set (see
  // REALTIME_STATUS_TOOLS's call site in the accept-webhook) -- answerRealtimeTool's own
  // security check (no matchedPropertyId, no answer) is a second, redundant guard, not
  // the only one.
  realtime.on("response.function_call_arguments.done", (event) => {
    void (async () => {
      const output = await answerRealtimeTool(event.name, call);
      realtime.send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: event.call_id, output },
      });
      realtime.send({ type: "response.create" });
    })();
  });
  realtime.on("error", (err) => {
    console.error("[conversational AI] realtime monitoring connection error:", err);
  });

  await new Promise<void>((resolve) => {
    realtime.socket.on("close", () => resolve());
  });

  const rawTranscript = lines.length > 0 ? lines.map((l) => `${l.speaker}: ${l.text}`).join("\n") : "(transcription unavailable)";
  await finalizeCallTicket(call.id, rawTranscript, lines.length > 0);
}

const ISSUE_TYPE_SPOKEN_LABEL: Record<PhoneAgentIssueType, string> = {
  EQUIPMENT_FAILURE: "equipment problems",
  CHEMICAL_WATER_QUALITY: "chemical or water quality issues",
  LEAK: "leaks",
  NO_SHOW_COMPLAINT: "no-show complaints",
  BILLING: "billing questions",
  OTHER: "anything else pool-service related",
};

/** Prose rendering of OrgPhoneAgentSettings.businessHours -- lib/phone-agent.ts already
 * parses this same JSON shape for AFTER_HOURS/BUSY_OVERFLOW framing, but has no
 * spoken-prose renderer of its own since it never needed one until now. */
function formatBusinessHours(hours: BusinessHours | null): string | null {
  if (!hours) return null;
  const dayLabel: Record<(typeof WEEKDAY_KEYS)[number], string> = {
    sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
  };
  const parts = WEEKDAY_KEYS.filter((d) => hours[d]).map((d) => `${dayLabel[d]} ${hours[d]}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function buildRealtimeInstructions(
  settings: Pick<OrgPhoneAgentSettings, "serviceTerritoryDescription" | "businessHours" | "allowedIssueTypes">,
  hasAccountTools: boolean,
  organizationName: string | null,
): string {
  const territory = settings.serviceTerritoryDescription?.trim();
  const hours = formatBusinessHours((settings.businessHours as BusinessHours | null) ?? null);
  const issueTypes = settings.allowedIssueTypes.length > 0 ? settings.allowedIssueTypes.map((t) => ISSUE_TYPE_SPOKEN_LABEL[t]).join(", ") : null;

  return [
    "You are a friendly, efficient phone assistant for a pool service company, answering because the business's own line didn't pick up.",
    organizationName
      ? `As soon as the call connects, immediately greet the caller by name-dropping the business: say something like "Thanks for calling ${organizationName}, sorry we missed you -- how can I help?" Don't wait for the caller to speak first.`
      : "As soon as the call connects, immediately greet the caller and apologize that the business's line didn't pick up. Don't wait for the caller to speak first.",
    "Find out why the caller is calling: a new service request, a question about their existing service, something urgent, or just a message to pass along.",
    "For any request, get their name, the property address, and a good callback number before the call ends.",
    "If it sounds urgent (equipment failure, safety issue, contamination), say you'll flag it for an immediate callback and keep the conversation brief.",
    territory ? `Your service territory: ${territory}.` : null,
    hours ? `Normal business hours: ${hours} (24-hour time).` : null,
    issueTypes ? `The kinds of issues this business handles: ${issueTypes}.` : null,
    "Keep responses short and conversational, like a real phone call, not a script being read aloud.",
    hasAccountTools
      ? "This caller's number matches an account on file. Use the get_next_visit, get_last_visit, and get_assigned_technician tools to answer those specific questions with real information instead of saying you'll take a message -- but never guess or invent any other account detail (name, address, service history) beyond what a tool actually returns."
      : "You cannot see any account-specific details about this caller -- do not guess or invent their name, address, or service history; ask them directly.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Registered on accept() only for a recognized caller (matchedPropertyId set) -- see
 * app/api/openai/realtime-incoming/route.ts. No parameters: the property/org come from
 * the already-matched PhoneAgentCall row server-side, never from anything the model or
 * caller supplies (same reasoning as the Dialogflow fulfillment webhook -- letting the
 * model pass an address/account identifier would let a spoofed caller query arbitrary
 * accounts). Handled in monitorRealtimeCallTranscript's response.function_call_arguments.done
 * listener, via lib/phone-agent-status.ts's answerRealtimeTool. */
export const REALTIME_STATUS_TOOLS: RealtimeFunctionTool[] = [
  {
    type: "function",
    name: "get_next_visit",
    description: "Look up this caller's next scheduled service visit. Use when they ask when their next visit is.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "get_last_visit",
    description: "Look up this caller's most recently completed service visit. Use when they ask if or when their pool was last serviced.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "get_assigned_technician",
    description: "Look up which technician is assigned to this caller's property. Use when they ask who their technician is.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

export function openaiSipUri(conferenceName: string): string {
  const projectId = process.env.OPENAI_PROJECT_ID;
  return `sip:${projectId}@sip.api.openai.com;transport=tls?X-conferenceName=${encodeURIComponent(conferenceName)}`;
}

/**
 * TwiML for the conversational-AI fallback path: puts the caller into a conference
 * (alone, at first) rather than the deterministic phone tree. `statusCallbackUrl` must
 * fire on the "join" event (not just "start", which only fires once a second participant
 * is present -- we need the ConferenceSid the moment our own caller joins, since that's
 * what triggers adding OpenAI's Realtime SIP endpoint as the second participant; see
 * app/api/twilio/voice/conference-join/route.ts). Recorded as a fallback transcript
 * source, since caller-side audio transcription over the OpenAI SIP leg has documented
 * reliability gaps -- same "listen to the recording" safety net the existing voicemail
 * path already relies on.
 */
export function conversationalAiTwiml(conferenceName: string, statusCallbackUrl: string): string {
  const response = new VoiceResponse();
  const dial = response.dial();
  dial.conference(
    {
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ["join"],
      statusCallbackMethod: "POST",
      record: "record-from-start",
    },
    conferenceName,
  );
  return response.toString();
}
