import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COLOR } from "@/lib/design-tokens";
import { NATIVE_SHELL_UA_TOKEN } from "@/lib/native-shell";

/**
 * native/app.config.ts is the React Native shell's native configuration, and it cannot import
 * anything from this repo: Expo evaluates it with its own loader before Metro exists, so a
 * `../lib/design-tokens` import fails outright with "Cannot find module". The shell's TypeScript
 * CAN import freely -- and does -- but this one file is stuck restating a few values.
 *
 * Same situation as public/sw.js, so the same answer: the literals are pinned here rather than
 * left to be noticed by eye. Everything checked below is something whose drift is silent --
 * nothing breaks, nothing warns, and the first symptom is on a user's phone or in a Play review.
 */
const CONFIG = readFileSync("native/app.config.ts", "utf8");
const CAPACITOR_CONFIG = readFileSync("capacitor.config.ts", "utf8");
const CAPACITOR_GRADLE = readFileSync("android/app/build.gradle", "utf8");

function configValue(key: string): string | null {
  return CONFIG.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] ?? null;
}

describe("the React Native shell's native config", () => {
  it("inherits the application id Play has already seen", () => {
    // Permanent since 2026-10-31. A different id means a new listing, and losing every review,
    // rating and install on the old one.
    const capacitorAppId = CAPACITOR_CONFIG.match(/appId:\s*"([^"]+)"/)?.[1];
    expect(capacitorAppId).toBe("com.aquarunner247.pro");
    expect(configValue("package")).toBe(capacitorAppId);
    expect(configValue("bundleIdentifier")).toBe(capacitorAppId);
  });

  it("keeps its versionCode clear of the Capacitor shell's", () => {
    // Play rejects a versionCode it has already seen. Both shells upload to the SAME listing
    // while the transition runs, so the two numbering schemes must not meet.
    const capacitorVersionCode = Number(CAPACITOR_GRADLE.match(/versionCode\s+(\d+)/)?.[1]);
    const shellVersionCode = Number(CONFIG.match(/versionCode:\s*(\d+)/)?.[1]);
    expect(Number.isFinite(capacitorVersionCode)).toBe(true);
    expect(shellVersionCode).toBeGreaterThan(capacitorVersionCode);
    // And with room left over, so the Capacitor shell can keep shipping fixes underneath it.
    expect(shellVersionCode - capacitorVersionCode).toBeGreaterThanOrEqual(50);
  });

  it("uses palette colours, restated because they cannot be imported", () => {
    // White, which is COLOR.warmFoam. A hex here that is not in the palette is the fifth
    // competing palette DESIGN-SYSTEM.md exists to prevent.
    const palette = new Set(Object.values(COLOR).map((c) => String(c).toUpperCase()));
    for (const hex of CONFIG.match(/^\s*(?:backgroundColor|notificationColor):\s*"(#[0-9A-Fa-f]{6})"/gm) ?? []) {
      const value = hex.match(/"(#[0-9A-Fa-f]{6})"/)![1]!.toUpperCase();
      expect(palette, `${value} is not in lib/design-tokens.ts`).toContain(value);
    }
  });

  it("keeps the User-Agent token the server identifies the app by", () => {
    // lib/native-shell.ts matches on this to send /portal/subscribe to the web instead of
    // Stripe, which is what App Store Guideline 3.1.3(c) requires. The shell applies it through
    // react-native-webview's applicationNameForUserAgent, importing the constant -- so this
    // checks the Capacitor config, the only other place it is written out.
    expect(CAPACITOR_CONFIG).toContain(`appendUserAgent: "${NATIVE_SHELL_UA_TOKEN}"`);
    expect(readFileSync("native/src/App.tsx", "utf8")).toContain("applicationNameForUserAgent={NATIVE_SHELL_UA_TOKEN}");
  });

  it("declares no permission the shipping Capacitor build does not", () => {
    // Play shows this list to users, and a new entry is a visible change plus a Data safety
    // update. A plain `expo prebuild` added six (microphone, both external-storage permissions,
    // boot-completed, display-over-other-apps, vibrate) purely because of what the Expo plugins
    // declare; blockedPermissions removes them at manifest-merge time.
    const capacitorManifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
    // Split at blockedPermissions rather than searching for each name: a permission could
    // legitimately appear in both lists one day, and an indexOf per name would then read the
    // wrong occurrence and quietly stop checking it.
    const blockedAt = CONFIG.indexOf("blockedPermissions");
    expect(blockedAt).toBeGreaterThan(-1);
    const requested = [...CONFIG.slice(0, blockedAt).matchAll(/"(android\.permission\.[A-Z_]+)"/g)].map((m) => m[1]!);
    expect(requested.length).toBeGreaterThan(5);

    const capacitorAsks = new Set(
      [...capacitorManifest.matchAll(/android:name="(android\.permission\.[A-Z_]+)"/g)].map((m) => m[1]!),
    );
    // The two the Capacitor app gets only from its plugins' own manifests, not its own.
    capacitorAsks.add("android.permission.FOREGROUND_SERVICE");
    capacitorAsks.add("android.permission.FOREGROUND_SERVICE_LOCATION");

    expect(requested.filter((p) => !capacitorAsks.has(p))).toEqual([]);
  });

  it("points at production and trusts no development origin by default", () => {
    // A shipped build must have no code path to a local server, and cleartext HTTP and a
    // trusted localhost origin are deliberately the same switch so neither can be turned on
    // alone. Both default off; AQ_ALLOW_DEV_ORIGIN is what a developer sets.
    expect(CONFIG).toContain('const PRODUCTION_URL = "https://aquarunner247.com"');
    expect(CONFIG).toContain('process.env.AQ_ALLOW_DEV_ORIGIN === "1"');
    expect(CONFIG).toContain("usesCleartextTraffic: ALLOW_DEVELOPMENT_ORIGIN");
  });
});
