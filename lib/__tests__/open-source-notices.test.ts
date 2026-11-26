import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * content/legal/open-source-notices.md is the attribution notice End User License Agreement
 * Section 9 points at, so it is a licence obligation rather than documentation: MIT and
 * BSD both require the copyright notice to travel with the distributed software, and the
 * page is how this app does that.
 *
 * It was hand-maintained and had drifted by 2026-11-10 -- the security upgrades in e3913ca
 * and 55a8d7f moved Capacitor, Prisma, Sentry and next without the notice following, and
 * `@capacitor/app` had shipped in both native shells since its introduction with no entry at
 * all. Nobody notices that by reading, which is why it is checked here instead.
 *
 * Deliberately scoped to `dependencies`. A devDependency does not reach a user, so it carries
 * no distribution obligation, and listing the whole tree would make the page unreadable --
 * the page says it lists "the direct production dependencies" and this keeps that sentence true.
 *
 * TWO MANIFESTS, checked separately. native/package.json is the React Native shell added in
 * Phase 2, and what it installs ships inside the iOS and Android binaries, so it carries the
 * same obligation as the service's own tree. They cannot be merged into one list: both install
 * `react`, at different versions, and a single list keyed by name would silently drop one of
 * them -- so the page keeps a separate section and this keeps each honest about its own section.
 */
const NOTICES = readFileSync("content/legal/open-source-notices.md", "utf8");
const PKG = JSON.parse(readFileSync("package.json", "utf8"));
const NATIVE_PKG = JSON.parse(readFileSync("native/package.json", "utf8"));

/** The page, split where the shell's own section begins. */
const SHELL_HEADING = "## The mobile app shell";
const [SERVICE_SECTION = "", SHELL_SECTION = ""] = (() => {
  const at = NOTICES.indexOf(SHELL_HEADING);
  return at === -1 ? [NOTICES, ""] : [NOTICES.slice(0, at), NOTICES.slice(at)];
})();

/** Every `- \`name\` version` bullet in one section, whichever licence heading it sits under. */
function bullets(section: string): Map<string, string> {
  return new Map<string, string>(
    [...section.matchAll(/^- `([^`]+)` ([0-9][^\s]*)/gm)].map((m) => [m[1]!, m[2]!]),
  );
}

const listed = bullets(SERVICE_SECTION);
const shellListed = bullets(SHELL_SECTION);

/** What npm actually installed, which is what ships -- not the range in package.json. */
function installedVersion(name: string, root = "node_modules"): string | null {
  const path = join(root, name, "package.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).version : null;
}

describe("open-source notices", () => {
  const deps = Object.keys(PKG.dependencies).sort();

  it("lists every production dependency", () => {
    expect(deps.filter((d) => !listed.has(d))).toEqual([]);
  });

  it("lists no package that is no longer a production dependency", () => {
    const production = new Set(deps);
    expect([...listed.keys()].filter((d) => !production.has(d))).toEqual([]);
  });

  it("states the version that is actually installed", () => {
    const drift = deps
      .map((d) => ({ dep: d, notice: listed.get(d), installed: installedVersion(d) }))
      .filter((r) => r.installed && r.notice !== r.installed);
    expect(drift).toEqual([]);
  });

  it("still names the map and imagery attributions, which have no package entry", () => {
    // Required by the ODbL and by Esri's terms, and easy to lose in a rewrite because
    // these are services rather than dependencies -- nothing else would catch their removal.
    for (const required of ["OpenStreetMap", "Open Database License", "Esri", "OSRM", "Nominatim"]) {
      expect(NOTICES, required).toContain(required);
    }
  });

  it("is the notice the EULA points at", () => {
    expect(NOTICES).toContain("/eula");
    expect(readFileSync("content/legal/end-user-license-agreement.md", "utf8")).toContain("/licenses");
  });
});

/**
 * The React Native shell (native/), whose dependencies ship inside the iOS and Android binaries.
 *
 * Same obligation, separate section, because the two surfaces install different versions of the
 * same packages -- `react` most obviously. Under-attribution is the licence breach, so a new
 * dependency added to the shell has to reach the page before a build reaches a store.
 */
describe("open-source notices for the mobile app shell", () => {
  const deps = Object.keys(NATIVE_PKG.dependencies ?? {}).sort();

  it("has a section of its own", () => {
    // Without the heading the split collapses and every assertion below passes vacuously.
    expect(NOTICES).toContain(SHELL_HEADING);
    expect(deps.length).toBeGreaterThan(0);
  });

  it("lists every production dependency of the shell", () => {
    expect(deps.filter((d) => !shellListed.has(d))).toEqual([]);
  });

  it("lists no package the shell no longer depends on", () => {
    const production = new Set(deps);
    expect([...shellListed.keys()].filter((d) => !production.has(d))).toEqual([]);
  });

  it("states the version the shell actually installed", () => {
    const drift = deps
      .map((d) => ({
        dep: d,
        notice: shellListed.get(d),
        installed: installedVersion(d, join("native", "node_modules")),
      }))
      .filter((r) => r.installed && r.notice !== r.installed);
    expect(drift).toEqual([]);
  });

  it("keeps the two sections from being read as one", () => {
    // `react` ships at a different version on each surface. If the page ever merged the lists,
    // one of those versions would be wrong and nothing else here would notice.
    expect(listed.get("react")).toBeDefined();
    expect(shellListed.get("react")).toBeDefined();
    expect(listed.get("react")).not.toBe(shellListed.get("react"));
  });
});
