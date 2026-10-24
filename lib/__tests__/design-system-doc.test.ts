import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { COLOR, FONT } from "@/lib/design-tokens";

/**
 * DESIGN-SYSTEM.md has to agree with lib/design-tokens.ts.
 *
 * It did not, for long enough that CLAUDE.md tells every agent and human to read it as the
 * single source of truth while it documented a teal palette the code had already replaced with
 * navy. Nothing broke loudly -- a stale document just quietly hands out wrong hex values to
 * whoever needs one, which is exactly the "five competing palettes" problem the file exists to
 * prevent, with the document itself as the fifth.
 *
 * So the agreement is checked rather than trusted. These tests do not care how the prose reads;
 * they care that every hex printed in it is the hex the code ships, and that the rules naming
 * specific tokens and utilities name ones that exist.
 */

const DOC = fs.readFileSync(path.join(process.cwd(), "DESIGN-SYSTEM.md"), "utf8");

/** Every `| \`brand-x\` | \`#hex\` |` row in the token tables. */
function documentedTokens(): { name: string; hex: string }[] {
  return [...DOC.matchAll(/^\|\s*`brand-(\w+)`\s*\|\s*`([^`]+)`\s*\|/gm)].map((m) => ({
    name: m[1],
    hex: m[2],
  }));
}

describe("DESIGN-SYSTEM.md token tables", () => {
  it("documents a hex for every colour the code ships", () => {
    const documented = new Set(documentedTokens().map((t) => t.name));
    // Status fills appear in the status table's Fill column rather than as their own row.
    const inFillColumn = new Set([...DOC.matchAll(/`brand-(\w+Fill)`/g)].map((m) => m[1]));
    const undocumented = Object.keys(COLOR).filter((k) => !documented.has(k) && !inFillColumn.has(k));
    expect(undocumented, `add these to DESIGN-SYSTEM.md: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("prints the hex the code actually uses, for every token it names", () => {
    const wrong = documentedTokens()
      .filter(({ name, hex }) => {
        const actual = (COLOR as Record<string, string>)[name];
        return actual != null && actual.toLowerCase() !== hex.toLowerCase();
      })
      .map(({ name, hex }) => `brand-${name}: doc says ${hex}, code says ${(COLOR as Record<string, string>)[name]}`);
    expect(wrong, wrong.join("; ")).toEqual([]);
  });

  it("names no token that does not exist", () => {
    // The other direction: a rule citing `brand-teal` would read as authoritative and resolve
    // to nothing, which is worse than citing the wrong colour.
    const ghosts = documentedTokens()
      .filter(({ name }) => !(name in COLOR))
      .map(({ name }) => `brand-${name}`);
    expect(ghosts, `documented but absent from COLOR: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("does not resurrect the retired teal aliases as live tokens", () => {
    // They may be MENTIONED -- rule 6 exists to say they are gone -- but never in a token row.
    const retired = ["navy", "teal", "blue", "sky", "alert"];
    const rows = documentedTokens().map((t) => t.name);
    for (const name of retired) {
      expect(rows, `brand-${name} is retired and must not have a token row`).not.toContain(name);
      expect(name in COLOR, `brand-${name} should not be back in COLOR`).toBe(false);
    }
  });
});

describe("DESIGN-SYSTEM.md type section", () => {
  it("names only font utilities that tailwind.config.ts maps", () => {
    const config = fs.readFileSync(path.join(process.cwd(), "tailwind.config.ts"), "utf8");
    for (const utility of ["sans", "display", "marketing"]) {
      expect(DOC, `doc should name font-${utility}`).toContain(`font-${utility}`);
      expect(config, `tailwind should map ${utility}`).toMatch(new RegExp(`^\\s*${utility}:`, "m"));
    }
  });

  it("still warns that font-mono is not the mono face", () => {
    // FONT.mono is deliberately not mapped onto `font-mono`, so that utility renders Tailwind's
    // system stack. Anyone reaching for monospace needs .app-metric, and the doc has to say so.
    expect(FONT.mono[0]).toBe("var(--font-mono)");
    expect(DOC).toContain(".app-metric");
    expect(DOC).toMatch(/not\*\* mapped onto the `font-mono` utility/);
  });
});
