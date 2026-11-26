import { NATIVE_BRIDGE_VERSION, NATIVE_HOST_GLOBAL, type HostMessage } from "@/lib/native-bridge-protocol";

/**
 * The two pieces of JavaScript the shell puts into the page.
 *
 * Both are built from the same constants the page reads, so the global's name and the bridge
 * version cannot drift between the two sides. That is the whole reason NATIVE_HOST_GLOBAL is an
 * exported constant rather than a string spelled out in each half.
 */

/**
 * Injected BEFORE any page script runs, which is what makes the page's host detection
 * synchronous -- `nativePlatform()` is read during render, so there is nothing to await.
 *
 * `receive` is a stub that drops. It is replaced by lib/client/native-host.ts once the page is
 * listening, and nothing that arrives first is buffered: a result correlates to an id the page
 * itself issued and a location event carries a watchId the page itself generated, so neither can
 * predate the page. See NATIVE_HOST_GLOBAL.
 */
export function bootstrapSource(options: { platform: "android" | "ios"; shellVersion: string }): string {
  const payload = JSON.stringify({
    bridge: NATIVE_BRIDGE_VERSION,
    platform: options.platform,
    shellVersion: options.shellVersion,
  });
  // The trailing `true;` is react-native-webview's convention: without it iOS warns about the
  // injected script's return value on every navigation.
  return `(function () {
  if (window.${NATIVE_HOST_GLOBAL}) return;
  window.${NATIVE_HOST_GLOBAL} = Object.assign(${payload}, { receive: function () {} });
})();
true;`;
}

/**
 * The two characters that have to be escaped before a serialised message can be put into
 * JavaScript source, built from their codepoints rather than written out.
 *
 * U+2028 and U+2029 are legal inside a JSON string but were illegal as RAW characters in
 * JavaScript source until ES2019, so a message carrying one turns the injected script into a
 * syntax error. Reachable here through any OS error message the page is told about.
 *
 * String.fromCharCode, not a literal, because writing the literal is how this bug happens: the
 * first version of this file put the raw characters inside a regex and Metro rejected the file
 * itself with "Unterminated regular expression". A codepoint cannot be mistyped invisibly.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * One message from the shell to the page.
 *
 * `injectJavaScript` can only carry source text, so the message is serialised into a literal.
 */
export function deliverySource(message: HostMessage): string {
  const json = JSON.stringify(message)
    .split(LINE_SEPARATOR)
    .join("\\u2028")
    .split(PARAGRAPH_SEPARATOR)
    .join("\\u2029");
  return `window.${NATIVE_HOST_GLOBAL} && window.${NATIVE_HOST_GLOBAL}.receive(${json});
true;`;
}
