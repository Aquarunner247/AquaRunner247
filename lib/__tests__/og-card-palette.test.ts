import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { COLOR } from "../design-tokens";

/**
 * design/og/og-card.html is rendered by a headless browser outside the Next build, so it cannot
 * import the token file and has to repeat the hexes. That duplication is the reason the previous
 * set of share images stayed on the old teal palette after the site moved to navy: nothing failed.
 * This does.
 */
describe("the Open Graph card template", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "design", "og", "og-card.html"), "utf8");

  const declaredValue = (name: string) => {
    const match = html.match(new RegExp(`--${name}:\\s*([^;]+);`));
    expect(match, `--${name} is not declared in og-card.html`).not.toBeNull();
    return match![1].trim();
  };

  it.each([
    ["ink", COLOR.ink],
    ["anchor", COLOR.anchor],
    ["cta", COLOR.cta],
    ["muted-on-dark", COLOR.mutedOnDark],
  ])("keeps --%s in step with the token file", (name, token) => {
    expect(declaredValue(name).toUpperCase()).toBe(token.toUpperCase());
  });

  it("ships one PNG per card the marketing pages reference", () => {
    for (const file of ["home.png", "features.png", "pricing.png", "compliance.png"]) {
      expect(fs.existsSync(path.join(process.cwd(), "public", "og", file)), file).toBe(true);
    }
  });
});
