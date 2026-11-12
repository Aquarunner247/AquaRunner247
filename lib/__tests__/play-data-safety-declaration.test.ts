import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The Play Data safety answers in GOOGLE-PLAY-SUBMISSION.md have to keep up with the code.
 *
 * They did not. The form filed on 2026-10-31 declared crash logs and diagnostics but nothing for
 * the Google Analytics 4 tag, Vercel Analytics or Speed Insights, all three of which load in
 * app/layout.tsx -- the ROOT layout, unconditionally, so they run on every route including inside
 * the Capacitor shell. A declaration that omits them understates what the app sends off the
 * device, and the public store label is the thing that ends up wrong.
 *
 * This is a documentation test on purpose, the same shape as design-system-doc.test.ts and
 * background-location-disclosure.test.ts. Nothing here can check what is typed into the Play
 * Console; what it can check is that the sheet somebody types FROM mentions every client-side
 * third-party data integration the app actually has. Adding a fourth analytics or logging SDK
 * without a line in that table fails this test.
 *
 * It deliberately does not assert the absence of anything. An integration being removed should
 * not fail a test -- it should fail to appear in the client bundle, which the first assertion
 * notices.
 */

const ROOT = process.cwd();
const SUBMISSION = fs.readFileSync(path.join(ROOT, "GOOGLE-PLAY-SUBMISSION.md"), "utf8");

/** Just the Data safety section, so a mention somewhere else in the file does not satisfy it. */
function dataSafetySection(): string {
  const start = SUBMISSION.indexOf("### 2. Data Safety form");
  expect(start, "GOOGLE-PLAY-SUBMISSION.md no longer has a Data Safety section").toBeGreaterThan(-1);
  const end = SUBMISSION.indexOf("\n## ", start);
  return end === -1 ? SUBMISSION.slice(start) : SUBMISSION.slice(start, end);
}

/**
 * Each client-side integration that sends data off the device to somebody else, the file that
 * wires it up, and the string the declaration has to carry for it.
 */
const CLIENT_INTEGRATIONS = [
  {
    name: "Google Analytics 4",
    file: "app/layout.tsx",
    marker: "googletagmanager.com/gtag/js",
    declaredAs: "G-T91TBD4WF1",
  },
  {
    name: "Vercel Analytics",
    file: "app/layout.tsx",
    marker: "@vercel/analytics",
    declaredAs: "@vercel/analytics",
  },
  {
    name: "Vercel Speed Insights",
    file: "app/layout.tsx",
    marker: "@vercel/speed-insights",
    declaredAs: "Speed Insights",
  },
  {
    name: "Sentry browser SDK",
    file: "instrumentation-client.ts",
    marker: "@sentry/nextjs",
    declaredAs: "instrumentation-client.ts",
  },
];

describe("Play Data safety declaration keeps up with the client", () => {
  it.each(CLIENT_INTEGRATIONS)("$name is still wired up where this test expects", ({ file, marker }) => {
    // If this fails the integration moved or went away: re-point the entry, or drop it and
    // revisit the declaration, rather than deleting the assertion.
    expect(fs.readFileSync(path.join(ROOT, file), "utf8")).toContain(marker);
  });

  it.each(CLIENT_INTEGRATIONS)("$name appears in the Data safety answers", ({ declaredAs }) => {
    expect(
      dataSafetySection(),
      "A third-party integration in the client is not named in the Play Data safety section. " +
        "It sends data off the device, so it belongs in that table before the next release.",
    ).toContain(declaredAs);
  });

  it("declares the categories those integrations produce", () => {
    const section = dataSafetySection();
    for (const category of ["App activity → App interactions", "Device or other IDs", "Files and docs"]) {
      expect(section, `${category} missing from the Data safety answers`).toContain(category);
    }
  });

  it("answers the address-sharing question rather than leaving it at 'none shared'", () => {
    // Nominatim and the OSRM demo server are not service providers under Play's definition --
    // DPA Section 5.2.1 says they operate under a published usage policy and no negotiated
    // agreement -- so an address collected in the app reaches a third party. A sheet that says
    // nothing is shared is the specific wrong answer this guards.
    const section = dataSafetySection();
    expect(section).toContain("Nominatim");
    expect(section).not.toMatch(/none shared with third\s*\n?parties/);
  });

  it("records why audio is not declared, since the app has no microphone path", () => {
    // Checked because an outside review asked for an Audio category on the strength of the
    // Privacy Policy disclosing Twilio call recording. The recording happens server-side, to
    // callers who are not app users. If RECORD_AUDIO ever appears, this stops being true.
    const manifest = fs.readFileSync(path.join(ROOT, "android/app/src/main/AndroidManifest.xml"), "utf8");
    expect(manifest).not.toContain("android.permission.RECORD_AUDIO");
    expect(dataSafetySection()).toContain("Audio → Voice or sound recordings");
  });
});
