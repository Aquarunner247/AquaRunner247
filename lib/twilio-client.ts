import twilio from "twilio";

/**
 * The one place this app makes outbound REST calls to Twilio (everywhere else only
 * verifies/responds to inbound webhooks -- see lib/twilio-verify.ts). Needed for adding
 * OpenAI's Realtime SIP endpoint as a conference participant (see
 * app/api/twilio/voice/conference-join/route.ts) since that's a REST action, not
 * something expressible in TwiML alone. TWILIO_ACCOUNT_SID was previously unused in this
 * codebase -- flagged in phone-agent-setup.md as "needed the moment outbound/REST calls
 * are added." This is that moment.
 */
let cachedClient: ReturnType<typeof twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof twilio> | null {
  if (cachedClient) return cachedClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  cachedClient = twilio(accountSid, authToken);
  return cachedClient;
}
