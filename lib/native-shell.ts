/**
 * Whether a request came from inside the native app shell rather than a browser.
 *
 * The iOS and Android apps are a wrapper around https://aquarunner247.com, so the server sees
 * the same requests either way. The only thing that distinguishes them is a token the shell
 * appends to the WebView's User-Agent.
 *
 * WHY THIS EXISTS: App Store Guideline 3.1.3(c) exempts apps "sold directly by you to
 * organizations for their employees" from needing in-app purchase. That covers the
 * business-to-business subscriptions pool companies buy. It explicitly does NOT cover
 * "consumer, single user, or family sales", which is exactly what /portal/subscribe is -- an
 * individual paying $19/month for their own records after their pool company leaves. Offering
 * that purchase inside the app would need StoreKit; offering it on the web does not.
 *
 * So the subscribe page checks this and sends anyone in the app to the browser instead. The
 * web experience is unchanged, and nobody loses the ability to subscribe -- the emails that
 * actually point customers at that page open in their mail client's browser, not the WebView.
 *
 * Kept pure (no next/headers, no server-only) so the matching can be tested directly, same
 * reason lib/marketing-routes.ts gives.
 */

/**
 * The token the native shell appends to the WebView User-Agent.
 *
 * Two shells set it, for as long as both exist: `appendUserAgent` in capacitor.config.ts, which
 * restates the string and is pinned by lib/__tests__/native-shell-config.test.ts, and
 * react-native-webview's `applicationNameForUserAgent` in native/src/App.tsx, which imports this
 * constant directly and so cannot drift.
 *
 * Deliberately a single distinctive word rather than something like "AquaRunner", which would
 * also appear in a desktop browser if somebody ever named a profile after the product.
 */
export const NATIVE_SHELL_UA_TOKEN = "AquaRunner247App";

/**
 * True when the User-Agent carries the native shell's token.
 *
 * Fails CLOSED, i.e. returns false, for a missing or unrecognised User-Agent. A browser
 * wrongly treated as the app would be shown a dead end where a working checkout belongs,
 * which is worse than the app showing a checkout it should not -- and that second case cannot
 * happen silently, because the token only exists in builds that set it.
 *
 * Substring rather than exact match: both shells APPEND to the stock WebView agent, so the real
 * value is a long Mozilla/5.0 string with this on the end.
 */
export function isNativeShellUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return userAgent.includes(NATIVE_SHELL_UA_TOKEN);
}
