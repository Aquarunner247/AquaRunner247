import { timingSafeEqual } from "crypto";

const HEADER_NAME = "x-dialogflow-webhook-secret";

/**
 * Dialogflow ES has no signature scheme like Twilio's X-Twilio-Signature or Stripe's
 * stripe-signature -- the closest it offers is a custom HTTP header configured once in
 * its console (Fulfillment settings) and sent with every webhook request. Verified here
 * via constant-time comparison against DIALOGFLOW_WEBHOOK_SECRET, mirroring
 * lib/twilio-verify.ts's "reject before any other processing" shape for the same reason:
 * this is the only thing standing between the internet and a webhook that reads live
 * ServiceVisit/Property data (see lib/phone-agent-status.ts).
 */
export function verifyDialogflowWebhookSecret(req: Request): boolean {
  const expected = process.env.DIALOGFLOW_WEBHOOK_SECRET;
  const provided = req.headers.get(HEADER_NAME);
  if (!expected || !provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  // timingSafeEqual throws on mismatched lengths rather than returning false -- guard
  // explicitly so a wrong-length header 403s instead of 500ing.
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
