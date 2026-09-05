import twilio from "twilio";
import OpenAI from "openai";
import { OpenAIRealtimeWS } from "openai/realtime/ws";
import { finalizeCallTicket } from "@/lib/phone-agent-ticket";
import type { OrgPhoneAgentSettings } from "@/generated/prisma/client";

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
export async function monitorRealtimeCallTranscript(callId: string, openaiCallId: string, client: OpenAI): Promise<void> {
  const lines: TranscriptLine[] = [];

  const realtime = new OpenAIRealtimeWS({ callID: openaiCallId }, client);
  // TEMPORARY diagnostics -- OpenAI support asked for the exact call_id and the exact WS
  // URL string logged right before connecting, to rule out a blank/malformed call_id.
  console.error("[conversational AI DEBUG] sideband WS", JSON.stringify({ openaiCallId, url: realtime.url.toString() }));

  realtime.on("conversation.item.input_audio_transcription.completed", (event) => {
    if (event.transcript.trim()) lines.push({ speaker: "Caller", text: event.transcript.trim() });
  });
  realtime.on("response.output_audio_transcript.done", (event) => {
    if (event.transcript.trim()) lines.push({ speaker: "Agent", text: event.transcript.trim() });
  });
  realtime.on("error", (err) => {
    console.error("[conversational AI] realtime monitoring connection error:", err);
  });

  await new Promise<void>((resolve) => {
    realtime.socket.on("close", () => resolve());
  });

  const rawTranscript = lines.length > 0 ? lines.map((l) => `${l.speaker}: ${l.text}`).join("\n") : "(transcription unavailable)";
  await finalizeCallTicket(callId, rawTranscript, lines.length > 0);
}

export function buildRealtimeInstructions(settings: Pick<OrgPhoneAgentSettings, "serviceTerritoryDescription">): string {
  const territory = settings.serviceTerritoryDescription?.trim();
  return [
    "You are a friendly, efficient phone assistant for a pool service company, answering because the business's own line didn't pick up.",
    "Find out why the caller is calling: a new service request, a question about their existing service, something urgent, or just a message to pass along.",
    "For any request, get their name, the property address, and a good callback number before the call ends.",
    "If it sounds urgent (equipment failure, safety issue, contamination), say you'll flag it for an immediate callback and keep the conversation brief.",
    territory ? `Your service territory: ${territory}.` : null,
    "Keep responses short and conversational, like a real phone call, not a script being read aloud.",
    "You cannot see any account-specific details about this caller -- do not guess or invent their name, address, or service history; ask them directly.",
  ]
    .filter(Boolean)
    .join(" ");
}

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
