import twilio from "twilio";

/**
 * Verifies the X-Twilio-Signature header on an inbound Twilio webhook request. This is
 * the single most important control on every /api/twilio/* route -- an unverified request
 * could create fake tickets, or worse if outbound calling is ever added later. Every
 * Twilio-facing route must call this before doing anything else with the request body.
 *
 * `url` must be the exact public URL Twilio requested (scheme + host + path + query
 * string) -- Twilio signs the full URL, so a mismatch (e.g. http vs https, a stripped
 * query string) fails verification even for a genuine request. Vercel terminates TLS
 * before the app sees the request, so the request's own protocol/host must be recovered
 * from the `x-forwarded-proto`/host headers, not assumed from `req.url`.
 */
export function verifyTwilioSignature(req: Request, url: string, params: Record<string, string>): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get("x-twilio-signature");
  if (!authToken || !signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

/** Reconstructs the exact public URL Twilio requested, for signature verification.
 * Vercel/Next.js's `req.url` reflects the internal request, not necessarily the public
 * scheme/host the signature was computed against. */
export function publicRequestUrl(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const path = new URL(req.url).pathname + new URL(req.url).search;
  return `${forwardedProto}://${forwardedHost}${path}`;
}

/** Twilio webhooks POST `application/x-www-form-urlencoded`, not JSON. Converts the
 * parsed FormData into the plain string-keyed object `validateRequest` expects. */
export async function readTwilioParams(req: Request): Promise<Record<string, string>> {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}
