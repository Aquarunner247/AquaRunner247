import type { OrgPhoneAgentSettings } from "@/generated/prisma/client";

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Spoken to every caller before anything is recorded, transcribed, or streamed to a model.
 *
 * Not optional and not configurable per organization. Nevada -- where this is operated --
 * requires the consent of all parties to record a telephone conversation under NRS 200.620,
 * and California's CIPA s.632.7 is all-party too, with per-call statutory damages. A caller
 * to a pool company is usually a consumer, which is the end of that exposure where class
 * actions actually get filed. The Privacy Policy discloses recording, but a caller never
 * reads the Privacy Policy, so this notice is the only place consent is actually obtained:
 * the caller hears it first and consents by staying on the line.
 *
 * It carries THREE disclosures, and all three are load-bearing:
 *
 * 1. That the call is recorded -- the all-party consent requirement above.
 * 2. That it is transcribed and read by artificial intelligence -- the recording is sent to
 *    a model to be parsed into a ticket, and on the conversational path the caller's live
 *    audio is streamed to OpenAI's Realtime endpoint. "Recorded" alone implies a human
 *    listening later, which is not what happens.
 * 3. That no person is on the line. Added 2026-11-10 on advice of counsel: a caller who
 *    believes they are talking to an employee of the pool company has not been given the
 *    chance to decide otherwise, and both the FTC's position on AI impersonation and the
 *    newer state AI-disclosure statutes point the same way. The conversational agent is
 *    specifically instructed NOT to apologize for a person not answering, which makes the
 *    illusion better, not worse.
 *
 * Disclosure 3 cannot live in the agent's prompt. buildRealtimeInstructions is a request to
 * a model, so an AI-identity disclosure placed there would be made or not made at the
 * model's discretion -- the same reason the recording notice is a Twilio <Say>. It also has
 * to cover the phone-tree path, which has no model in the conversation at all.
 *
 * The wording is deliberately true on BOTH paths: the phone tree is an automated system
 * gathering speech, the conversational path is an automated system holding a conversation,
 * and "handled by an automated system rather than a person" describes each without
 * overclaiming a conversational agent on a call that has none.
 *
 * Keep it BEFORE the first <Gather>, <Record> or conference join on every path. Speech sent
 * to a <Gather input=["speech"]> is already capture, so placing this after the greeting but
 * before the gather is not good enough -- it has to lead. Lives here, rather than beside the
 * TwiML builders in phone-agent-flow.ts, because the conversational-AI path needs it too and
 * this is the module both already share.
 */
export const RECORDING_NOTICE =
  "Just so you know, this call is handled by an automated system rather than a person, and it's recorded and transcribed, with artificial intelligence used to understand your request. If you'd rather not be recorded, or you'd rather speak with a person, please hang up now and call back during business hours.";

/** The Twilio TTS voice for RECORDING_NOTICE. Mirrors phone-agent-flow.ts's AGENT_VOICE so
 * the notice and the greeting that follows it are the same voice rather than two. */
export const NOTICE_VOICE = "Google.en-US-Chirp3-HD-Kore" as const;


/** OrgPhoneAgentSettings.businessHours shape: {"mon": "08:00-17:00", ...}, 24h time,
 * keyed by WEEKDAY_KEYS. A missing or null key means closed that day. Only decides the
 * AFTER_HOURS vs BUSY_OVERFLOW framing/copy shown to the caller -- never gates whether
 * the agent answers at all (it always does, on no-answer/busy/failed, regardless of
 * configured hours -- see the routing step in voice/route.ts). */
export type BusinessHours = Partial<Record<(typeof WEEKDAY_KEYS)[number], string>>;

function parseHours(range: string): { startMinutes: number; endMinutes: number } | null {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(range.trim());
  if (!match) return null;
  const [, sh, sm, eh, em] = match;
  return { startMinutes: Number(sh) * 60 + Number(sm), endMinutes: Number(eh) * 60 + Number(em) };
}

/** Whether `now` falls inside the org's configured business hours for that weekday.
 * No configured hours at all (businessHours null/empty) defaults to AFTER_HOURS framing
 * -- an org that never filled this in shouldn't have every fallback call framed as
 * "we're just away from the phone" when we genuinely don't know their hours. */
export function resolveRouteReason(
  settings: Pick<OrgPhoneAgentSettings, "businessHours"> | null,
  now: Date,
): "AFTER_HOURS" | "BUSY_OVERFLOW" {
  const hours = (settings?.businessHours as BusinessHours | null) ?? null;
  if (!hours) return "AFTER_HOURS";

  const dayKey = WEEKDAY_KEYS[now.getDay()];
  const range = hours[dayKey];
  if (!range) return "AFTER_HOURS";

  const parsed = parseHours(range);
  if (!parsed) return "AFTER_HOURS";

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isOpen = nowMinutes >= parsed.startMinutes && nowMinutes < parsed.endMinutes;
  return isOpen ? "BUSY_OVERFLOW" : "AFTER_HOURS";
}
