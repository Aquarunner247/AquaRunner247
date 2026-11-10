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
 */
const NOTICES = readFileSync("content/legal/open-source-notices.md", "utf8");
const PKG = JSON.parse(readFileSync("package.json", "utf8"));

/** Every `- \`name\` version` bullet on the page, whichever licence heading it sits under. */
const listed = new Map<string, string>(
  [...NOTICES.matchAll(/^- `([^`]+)` ([0-9][^\s]*)/gm)].map((m) => [m[1], m[2]]),
);

/** What npm actually installed, which is what ships -- not the range in package.json. */
function installedVersion(name: string): string | null {
  const path = join("node_modules", name, "package.json");
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
