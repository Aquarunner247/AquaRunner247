import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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

  it("is reflected in whichever per-platform files `cap copy` has generated", () => {
    // The checks above read capacitor.config.ts, which is the source of truth for a HUMAN.
    // Neither binary ever sees it: `cap copy` renders it down to a capacitor.config.json under
    // each platform, and THAT is what the shell loads at runtime.
    //
    // Those two generated files are gitignored (Capacitor's own .gitignore), so a clean
    // checkout has neither and this test has nothing to compare -- hence existsSync rather
    // than readFileSync. What it catches is the state of a BUILD MACHINE: archiving in Xcode
    // does not run `cap copy`, so a stale generated file sitting beside the project is what
    // ships, silently.
    //
    // That is not hypothetical. On 2026-11-26 the iOS copy on the development machine predated
    // appendUserAgent entirely. Archiving from it would have produced a build that did not
    // identify itself to the server, so isNativeShellUserAgent() would have returned false and
    // /portal/subscribe would have offered Stripe checkout inside the app -- a consumer
    // single-user purchase, precisely what Guideline 3.1.3(c)'s enterprise exemption does not
    // cover. The same file was also missing AppPlugin from packageClassList, which on iOS means
    // @capacitor/app never registers and its app-state listeners fail.
    //
    // The fix is still to run `npx cap sync ios` before archiving. This only makes forgetting
    // it loud instead of silent, on any machine that has built once.
    const source = {
      appId: CAPACITOR_CONFIG.match(/appId:\s*"([^"]+)"/)?.[1],
      appName: CAPACITOR_CONFIG.match(/appName:\s*"([^"]+)"/)?.[1],
      appendUserAgent: CAPACITOR_CONFIG.match(/appendUserAgent:\s*"([^"]+)"/)?.[1],
      serverUrl: CAPACITOR_CONFIG.match(/url:\s*"([^"]+)"/)?.[1],
    };
    expect(source.appendUserAgent).toBe(NATIVE_SHELL_UA_TOKEN);

    for (const generated of [
      "ios/App/App/capacitor.config.json",
      "android/app/src/main/assets/capacitor.config.json",
    ]) {
      if (!existsSync(generated)) continue;
      const copy = JSON.parse(readFileSync(generated, "utf8"));
      const stale = `${generated} is out of date -- run \`npx cap sync\` before building`;
      expect(copy.appId, stale).toBe(source.appId);
      expect(copy.appName, stale).toBe(source.appName);
      expect(copy.appendUserAgent, stale).toBe(source.appendUserAgent);
      expect(copy.server?.url, stale).toBe(source.serverUrl);
    }
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
