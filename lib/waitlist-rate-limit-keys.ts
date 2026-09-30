import { createHmac } from "node:crypto";

/**
 * Identity helpers for waitlist rate limiting, split out from the part that touches the database so
 * they can be unit tested -- lib/waitlist-rate-limit.ts carries `server-only`, which by design
 * refuses to be imported anywhere a test runner can reach it.
 *
 * Nothing here reads the database or holds state.
 */

/** Ten in an hour. A real person signs up once, maybe twice after a typo; this leaves room for a
 *  shared office or carrier NAT address without being a useful flood budget. */
export const WAITLIST_MAX_PER_WINDOW = 10;
export const WAITLIST_WINDOW_MS = 60 * 60 * 1000;

/**
 * The caller's address, from the proxy headers Vercel sets. Returns null when there is no usable
 * header -- local development, or a platform that doesn't set one.
 *
 * x-forwarded-for is a client-controlled header in general, but on Vercel the platform overwrites
 * it, and the LEFTMOST entry is the real client. Anything a caller appends themselves lands to the
 * right of that and is ignored here.
 */
export function clientAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

/**
 * A stable, non-reversible key for an address.
 *
 * HMAC rather than a bare hash, and the salt matters: IPv4 is only ~4 billion values, so an
 * unsalted SHA-256 of an address is trivially reversed by enumerating the whole space. Prefers a
 * dedicated WAITLIST_IP_SALT; falls back to the service-role key, which is always present (the app
 * cannot start without it) and never leaves the server, so the fallback is still a real secret
 * rather than a placeholder.
 */
export function addressKey(address: string): string {
  const salt = process.env.WAITLIST_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHmac("sha256", salt).update(address).digest("hex");
}
