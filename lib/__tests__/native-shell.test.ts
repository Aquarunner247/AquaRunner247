import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { isNativeShellUserAgent, NATIVE_SHELL_UA_TOKEN } from "@/lib/native-shell";

/**
 * This check decides whether an individual is offered a $19/month purchase inside the native
 * app. Getting it wrong in one direction offers a consumer sale that App Store Guideline
 * 3.1.3(c) does not exempt from in-app purchase; in the other, it shows a browser a dead end
 * where a working checkout belongs.
 */

/** A real Capacitor WebView agent: the stock string with the token appended. */
const IOS_APP = `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${NATIVE_SHELL_UA_TOKEN}`;
const ANDROID_APP = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 ${NATIVE_SHELL_UA_TOKEN}`;

const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("isNativeShellUserAgent", () => {
  it("recognises the app on both platforms", () => {
    expect(isNativeShellUserAgent(IOS_APP)).toBe(true);
    expect(isNativeShellUserAgent(ANDROID_APP)).toBe(true);
  });

  it("does not mistake a mobile browser for the app", () => {
    // The ordinary path: a customer taps the link in their "access has changed" email, which
    // opens in Safari or Chrome, not the WebView. They must get the real checkout.
    expect(isNativeShellUserAgent(IOS_SAFARI)).toBe(false);
    expect(isNativeShellUserAgent(ANDROID_CHROME)).toBe(false);
    expect(isNativeShellUserAgent(DESKTOP)).toBe(false);
  });

  it("fails closed on a missing or empty agent", () => {
    // A browser wrongly treated as the app loses a working checkout. Unknown means browser.
    expect(isNativeShellUserAgent(null)).toBe(false);
    expect(isNativeShellUserAgent(undefined)).toBe(false);
    expect(isNativeShellUserAgent("")).toBe(false);
  });

  it("is not triggered by the product name appearing for other reasons", () => {
    // "AquaRunner" alone must not match -- the token is deliberately distinctive so a browser
    // profile or a crawler naming the product cannot flip this.
    expect(isNativeShellUserAgent("Mozilla/5.0 AquaRunner")).toBe(false);
    expect(isNativeShellUserAgent("AquaRunnerBot/1.0 (+https://aquarunner247.com)")).toBe(false);
    expect(isNativeShellUserAgent("Mozilla/5.0 aquarunner247app")).toBe(false); // case matters
  });
});

describe("the token and the native config agree", () => {
  it("matches appendUserAgent in capacitor.config.ts", () => {
    // Two files, one string. If they drift, the server silently stops recognising the app and
    // starts offering the purchase it is supposed to withhold -- with no error anywhere.
    const config = fs.readFileSync(path.join(process.cwd(), "capacitor.config.ts"), "utf8");
    expect(config).toContain(`appendUserAgent: "${NATIVE_SHELL_UA_TOKEN}"`);
  });
});
