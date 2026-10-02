/**
 * The link in a customer's welcome email, and where it sends them when it fails.
 *
 * Pure, and separate from the send path, so both halves can be tested without a Supabase client. The
 * reasoning behind the shape of the URL is in app/auth/confirm/route.ts: a link minted by the admin API
 * cannot go through the PKCE `?code=` callback, which is why this one carries a token hash instead.
 */

/** Where a customer sets their password, flagged so the form returns them to the portal sign-in. */
const ACTIVATION_NEXT = "/reset-password?portal=1";

export function buildActivationUrl(portalBaseUrl: string, hashedToken: string): string {
  const params = new URLSearchParams({ token_hash: hashedToken, type: "recovery", next: ACTIVATION_NEXT });
  return `${portalBaseUrl}/auth/confirm?${params.toString()}`;
}

/**
 * Where to send someone whose link has expired or was already used.
 *
 * A customer must not land on the staff /forgot-password: it asks for an account they do not think they
 * have, and its reset returns them to the staff /login, which rejects their credentials. That wrong
 * destination is the whole reason this file exists.
 */
export function confirmFailurePath(next: string): string {
  const isPortal = next.includes("portal=1") || next.startsWith("/portal");
  return isPortal ? "/portal/login?error=link-expired" : "/forgot-password?error=expired";
}
