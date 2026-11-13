import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ios/App/App/PrivacyInfo.xcprivacy has to keep up with the code, and with the Play form.
 *
 * It did not. @vercel/analytics has loaded in the ROOT layout since before the first filing,
 * recording page views on every route including inside the Capacitor WebView, and neither
 * store's declaration carried it. The Play form was corrected on 2026-11-12 by reading the
 * filed answers back out of the console; the manifest was found to be missing the matching row
 * (NSPrivacyCollectedDataTypeProductInteraction) in the same pass.
 *
 * GOOGLE-PLAY-SUBMISSION.md had lib/__tests__/play-data-safety-declaration.test.ts watching it
 * because it had drifted once already. The manifest had nothing, so it drifted the same way
 * unobserved. This is that guard.
 *
 * Apple rejects on privacy-manifest mismatches, and the public labels on the two stores are
 * built from these two documents, so a row missing from one is a store page that misdescribes
 * the app. The cross-store assertions below are deliberately pair-wise and named: they encode
 * which Play category means which Apple type, so adding an SDK fails here rather than at review.
 */

const ROOT = process.cwd();
const MANIFEST_PATH = "ios/App/App/PrivacyInfo.xcprivacy";
const manifest = fs.readFileSync(path.join(ROOT, MANIFEST_PATH), "utf8");
const submission = fs.readFileSync(path.join(ROOT, "GOOGLE-PLAY-SUBMISSION.md"), "utf8");
const layout = fs.readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");

type DeclaredType = {
  name: string;
  linked: boolean;
  tracking: boolean;
  purposes: string[];
};

/**
 * The manifest is a plist with a fixed shape and the repo has no XML parser, so read the shape
 * directly rather than adding a dependency for one file. If this stops finding entries the
 * manifest has been restructured, which is itself worth failing on.
 */
function declaredTypes(): DeclaredType[] {
  const start = manifest.indexOf("<key>NSPrivacyCollectedDataTypes</key>");
  expect(start, `${MANIFEST_PATH} has no NSPrivacyCollectedDataTypes key`).toBeGreaterThan(-1);
  const end = manifest.indexOf("<key>NSPrivacyAccessedAPITypes</key>", start);
  const section = end === -1 ? manifest.slice(start) : manifest.slice(start, end);

  return [...section.matchAll(/<dict>([\s\S]*?)<\/dict>/g)].map((block) => {
    const body = block[1];
    const name = /<key>NSPrivacyCollectedDataType<\/key>\s*<string>(.+?)<\/string>/.exec(body)?.[1] ?? "";
    const flag = (key: string) =>
      new RegExp(`<key>NSPrivacyCollectedDataType${key}</key>\\s*<(true|false)/>`).exec(body)?.[1] === "true";
    const purposesBlock =
      /<key>NSPrivacyCollectedDataTypePurposes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(body)?.[1] ?? "";
    return {
      name: name.replace("NSPrivacyCollectedDataType", ""),
      linked: flag("Linked"),
      tracking: flag("Tracking"),
      purposes: [...purposesBlock.matchAll(/<string>(.+?)<\/string>/g)].map((m) =>
        m[1].replace("NSPrivacyCollectedDataTypePurpose", ""),
      ),
    };
  });
}

/** Just the Data safety section, so a mention elsewhere in the file does not satisfy a pair. */
function dataSafetySection(): string {
  const start = submission.indexOf("### 2. Data Safety form");
  expect(start, "GOOGLE-PLAY-SUBMISSION.md no longer has a Data Safety section").toBeGreaterThan(-1);
  const end = submission.indexOf("\n## ", start);
  return end === -1 ? submission.slice(start) : submission.slice(start, end);
}

/**
 * Which Play category means which Apple type. A client-side SDK that produces one produces the
 * other; declaring it to one store and not the other is the specific drift this guards.
 */
const CROSS_STORE_PAIRS = [
  { play: "App activity → App interactions", apple: "ProductInteraction", why: "@vercel/analytics page views" },
  { play: "App performance → Crash logs", apple: "CrashData", why: "Sentry browser SDK" },
  { play: "App performance → Diagnostics", apple: "PerformanceData", why: "Sentry tracing and Speed Insights" },
  { play: "Location → Precise location", apple: "PreciseLocation", why: "the arrival position fix" },
  { play: "Personal info → Address", apple: "PhysicalAddress", why: "service property addresses" },
  { play: "Photos and videos → Photos", apple: "PhotosorVideos", why: "proof-of-service photos" },
];

describe("iOS privacy manifest keeps up with the client and with Play", () => {
  it("is structurally intact", () => {
    // A hand-edited plist that no longer parses is rejected at upload, which is a slow way to
    // find out. Catch the realistic breakages: unbalanced containers and a truncated file.
    const open = (tag: string) => (manifest.match(new RegExp(`<${tag}>`, "g")) ?? []).length;
    const close = (tag: string) => (manifest.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    expect(open("dict"), "unbalanced <dict> in the manifest").toBe(close("dict"));
    expect(open("array"), "unbalanced <array> in the manifest").toBe(close("array"));
    expect(manifest.trimEnd().endsWith("</plist>"), "manifest does not end with </plist>").toBe(true);
    expect(declaredTypes().length, "no data types parsed out of the manifest").toBeGreaterThan(0);
  });

  it("gives every declared type a name and at least one purpose", () => {
    for (const t of declaredTypes()) {
      expect(t.name, `a declared type has no NSPrivacyCollectedDataType string`).not.toBe("");
      expect(t.purposes.length, `${t.name} declares no purpose`).toBeGreaterThan(0);
    }
  });

  it.each(CROSS_STORE_PAIRS)(
    "declares $apple, to match $play on the Play form ($why)",
    ({ play, apple }) => {
      // Both directions, so neither store can be the one left behind.
      const onPlay = dataSafetySection().includes(play);
      const onApple = declaredTypes().some((t) => t.name === apple);
      expect(
        onApple,
        `GOOGLE-PLAY-SUBMISSION.md declares "${play}" but ${MANIFEST_PATH} has no ` +
          `NSPrivacyCollectedDataType${apple}. The two stores must be told the same thing.`,
      ).toBe(onPlay);
    },
  );

  it("declares ProductInteraction while an analytics SDK runs in the root layout", () => {
    // The root layout is the reason this is unconditional: it wraps every route, so anything
    // mounted there also runs inside the Capacitor shell. If @vercel/analytics is removed the
    // way Google Analytics was, drop the row and this assertion together.
    const analyticsInLayout = layout.includes("@vercel/analytics");
    const declaresInteraction = declaredTypes().some((t) => t.name === "ProductInteraction");
    expect(
      declaresInteraction,
      "app/layout.tsx loads @vercel/analytics, which records page views on every route " +
        `including inside the Capacitor WebView, but ${MANIFEST_PATH} does not declare ` +
        "NSPrivacyCollectedDataTypeProductInteraction.",
    ).toBe(analyticsInLayout);
  });

  it("claims no tracking, and no tracking domains", () => {
    // NSPrivacyTracking true would mean the app tracks across apps or websites, which would also
    // require an App Tracking Transparency prompt and contradict Privacy Policy Sections 10
    // and 21. Google Analytics was the only thing that ever set a device identifier here and it
    // was removed on 2026-11-12.
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest, "NSPrivacyTrackingDomains is no longer empty").toMatch(
      /<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/,
    );
    for (const t of declaredTypes()) {
      expect(t.tracking, `${t.name} is declared as tracking`).toBe(false);
    }
  });

  it("declares no microphone or audio collection, since the app has no audio path", () => {
    // Same reasoning as the Play form: Twilio records inbound phone calls server-side, from
    // callers who are not app users. The app never opens the microphone.
    const androidManifest = fs.readFileSync(
      path.join(ROOT, "android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );
    expect(androidManifest).not.toContain("android.permission.RECORD_AUDIO");
    for (const t of declaredTypes()) {
      expect(t.name, "an audio data type appeared in the manifest").not.toMatch(/Audio/i);
    }
  });

  it("declares no advertising or device identifier", () => {
    // Restoring any of these means re-answering the Play form's Device or other IDs row and
    // deciding the cookie-consent question Privacy Policy Section 9 currently answers by not
    // needing a banner.
    for (const forbidden of ["DeviceID", "AdvertisingData", "OtherDiagnosticData"]) {
      expect(
        declaredTypes().some((t) => t.name === forbidden),
        `${forbidden} is declared in the manifest. Re-read Privacy Policy Section 9 first.`,
      ).toBe(false);
    }
  });
});
