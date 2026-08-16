import type { OrgPhoneAgentSettings } from "@/generated/prisma/client";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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
