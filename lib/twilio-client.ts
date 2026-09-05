// lib/twilio-client.ts
import twilio from "twilio";

/**
 * The one place this app makes outbound REST calls to Twilio (everywhere else only
 * verifies/responds to inbound webhooks -- see lib/twilio-verify.ts). Needed for adding
 * OpenAI's Realtime SIP endpoint as a conference participant (see
 * app/api/twilio/voice/conference-join/route.ts) since that's a REST action, not
 * something expressible in TwiML alone.
 *
 * Uses a scoped API Key (TWILIO_API_KEY_SID/SECRET), not the Auth Token -- the Auth
 * Token is reserved for webhook signature verification in lib/twilio-verify.ts, which
 * has no API-Key equivalent. Keeping the two separate means this REST credential can be
 * rotated or revoked without touching signature verification at all.
 */
let cachedClient: ReturnType<typeof twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof twilio> | null {
  if (cachedClient) return cachedClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  if (!accountSid || !apiKeySid || !apiKeySecret) return null;
  cachedClient = twilio(apiKeySid, apiKeySecret, { accountSid });
  return cachedClient;
}
