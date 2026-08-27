import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Remote-URL wrapper, not a static-export bundle -- this app is fully server-dependent
 * (Server Actions, cookies-based Supabase auth, Stripe webhooks, middleware), so there is
 * no static build of it to ship inside the native binary. The native shell instead loads
 * the live production site directly; `webDir` (capacitor-shell/) is never actually shown to
 * a user, it only satisfies `cap add`'s requirement that the directory exist.
 *
 * appId is a placeholder (reverse-DNS of the production domain) -- change it before any
 * real App Store / Play Store submission if you want something else. It becomes part of
 * the bundle identifier and is effectively permanent once submitted.
 */
const config: CapacitorConfig = {
  appId: "com.aquarunner247.app",
  appName: "AquaRunner 24/7 Pro",
  webDir: "capacitor-shell",
  server: {
    url: "https://aquarunner247.com",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
