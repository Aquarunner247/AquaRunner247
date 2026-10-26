import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Remote-URL wrapper, not a static-export bundle -- this app is fully server-dependent
 * (Server Actions, cookies-based Supabase auth, Stripe webhooks, middleware), so there is
 * no static build of it to ship inside the native binary. The native shell instead loads
 * the live production site directly; `webDir` (capacitor-shell/) is never actually shown to
 * a user, it only satisfies `cap add`'s requirement that the directory exist.
 *
 * appId is `com.aquarunner247.pro`, matching the product name, and is PERMANENT once either
 * store has seen it -- android/app/build.gradle derives applicationId from the same string and
 * Play package names are as immovable as Apple's. Changing it after submission means a new
 * listing and losing reviews, ratings and installs.
 *
 * `.pro` rather than the earlier placeholder `.app` deliberately: app/cpo is a second product
 * (AquaRunner Compliance, its own plan tier) that could plausibly want its own mobile app one
 * day, and `.app` would have burned the generic slot on the first one. This leaves
 * `com.aquarunner247.compliance` free and obviously related.
 */
const config: CapacitorConfig = {
  appId: "com.aquarunner247.pro",
  appName: "AquaRunner 24/7 Pro",
  webDir: "capacitor-shell",
  /**
   * Appended to the WebView's User-Agent so the server can tell the native app from a browser.
   * MUST stay in step with NATIVE_SHELL_UA_TOKEN in lib/native-shell.ts, which is the only
   * thing that reads it.
   *
   * It exists for one purpose: /portal/subscribe is a consumer, single-user purchase, which
   * App Store Guideline 3.1.3(c)'s enterprise exemption explicitly does not cover. Inside the
   * app that page points at the web instead of opening Stripe. Takes effect only in a rebuilt
   * binary -- until one ships, every request looks like a browser.
   */
  appendUserAgent: "AquaRunner247App",
  server: {
    url: "https://aquarunner247.com",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
    // Required by @capacitor-community/background-geolocation: without this, Android stops
    // delivering location updates to the WebView bridge after ~5 minutes in the background
    // (see that plugin's README/issue #89) regardless of the foreground service staying alive.
    useLegacyBridge: true,
  },
};

export default config;
