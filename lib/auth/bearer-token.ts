/**
 * Reading a Supabase access token out of an `Authorization` header.
 *
 * Why this exists: every API route in this app resolves the caller through getCurrentAppUser(),
 * which reads cookies. A native client has no cookies to send, so without a second way in, the
 * eighteen technician write endpoints under app/api/visits/ and app/api/routes/ are unreachable
 * from anything but the WebView -- see NATIVE-REBUILD-PLAN.md.
 *
 * Kept pure and in its own module so the parsing rules can be asserted without a request. The
 * rules are deliberately strict: a token is either unambiguously present or absent, because
 * "nearly a bearer token" must fall through to cookie auth rather than be half-trusted.
 *
 * This only EXTRACTS the token. Nothing here validates it -- validation is
 * supabase.auth.getUser(token), a round trip to the Auth server that re-verifies the JWT rather
 * than trusting its contents. A token pulled out by this function carries no authority until
 * that call returns a user.
 */

/** The scheme, matched case-insensitively per RFC 7235 (`Bearer`, `bearer` and `BEARER` are one). */
const SCHEME = "bearer";

export function bearerTokenFrom(authorization: string | null | undefined): string | null {
  if (!authorization) return null;

  // Exactly one space between scheme and token is the normal form, but tolerate extra
  // whitespace rather than reject a valid token over formatting.
  const trimmed = authorization.trim();
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace < 0) return null;

  const scheme = trimmed.slice(0, firstSpace);
  if (scheme.toLowerCase() !== SCHEME) return null;

  const token = trimmed.slice(firstSpace + 1).trim();
  if (token.length === 0) return null;

  // A token containing whitespace is two words, not a credential -- `Bearer abc def` is
  // malformed, and passing "abc def" to the Auth server would be a guess about which half was
  // meant. Refuse instead.
  if (/\s/.test(token)) return null;

  return token;
}
