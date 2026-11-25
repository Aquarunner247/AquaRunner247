import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CACHEABLE_ASSET_PATHS,
  CACHEABLE_ASSET_PREFIXES,
  FIELD_SHELL_PATH,
  cacheStrategy,
  isFieldShellPath,
} from "@/lib/service-worker-policy";

function strategy(pathname: string, opts: { sameOrigin?: boolean; method?: string; isNavigation?: boolean } = {}) {
  return cacheStrategy({
    pathname,
    sameOrigin: opts.sameOrigin ?? true,
    method: opts.method ?? "GET",
    isNavigation: opts.isNavigation ?? false,
  });
}

describe("cacheStrategy", () => {
  it("serves the field shell from cache when the network is gone", () => {
    expect(strategy("/field", { isNavigation: true })).toBe("shell");
  });

  it("treats a path under /field as the same shell", () => {
    expect(strategy("/field/anything", { isNavigation: true })).toBe("shell");
  });

  it("does not mistake a path merely starting with the same letters", () => {
    expect(isFieldShellPath("/fields")).toBe(false);
    expect(strategy("/fields", { isNavigation: true })).toBe("network");
  });

  it("caches content-hashed build output", () => {
    expect(strategy("/_next/static/chunks/main-abc123.js")).toBe("asset");
  });

  it("caches the fonts and icons the shell renders with", () => {
    expect(strategy("/fonts/satoshi/satoshi-400.woff2")).toBe("asset");
    expect(strategy("/icons/icon-192.png")).toBe("asset");
    expect(strategy("/manifest.webmanifest")).toBe("asset");
  });

  /**
   * THE WHOLE POINT. app/layout.tsx renders the signed-in user's name and their organization's
   * name into every document, so a cached dashboard page replayed on a shared phone shows one
   * technician the previous one's identity. Nothing but /field may ever be cached.
   */
  it("never caches a dashboard document", () => {
    expect(strategy("/dashboard", { isNavigation: true })).toBe("network");
    expect(strategy("/dashboard/schedule", { isNavigation: true })).toBe("network");
    expect(strategy("/dashboard/visits/abc", { isNavigation: true })).toBe("network");
  });

  it("never caches the customer portal or the compliance product", () => {
    expect(strategy("/portal", { isNavigation: true })).toBe("network");
    expect(strategy("/cpo", { isNavigation: true })).toBe("network");
  });

  /**
   * The read endpoints return one organization's customers, addresses and phone numbers. The
   * mirror in lib/client/local-store.ts is where a response is allowed to be kept, because it is
   * keyed by technician id and cleared on a horizon; an HTTP cache is keyed by URL and is not.
   */
  it("never caches an API response", () => {
    expect(strategy("/api/technician/day")).toBe("network");
    expect(strategy("/api/technician/reference")).toBe("network");
    expect(strategy("/api/visits/abc")).toBe("network");
  });

  it("never caches a write", () => {
    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      expect(strategy("/field", { isNavigation: true, method })).toBe("network");
      expect(strategy("/_next/static/chunks/main.js", { method })).toBe("network");
    }
  });

  it("never caches another origin", () => {
    expect(strategy("/field", { isNavigation: true, sameOrigin: false })).toBe("network");
    expect(strategy("/_next/static/chunks/main.js", { sameOrigin: false })).toBe("network");
  });

  /**
   * An RSC payload or a fetch() for a /field URL is not a document. Answering it from the
   * document cache would hand JavaScript an HTML page, which fails in a way that looks like a
   * parse bug rather than a caching one.
   */
  it("only answers the shell cache for an actual navigation", () => {
    expect(strategy("/field", { isNavigation: false })).toBe("network");
  });
});

/**
 * public/sw.js is a static file served at the origin root -- it cannot import this module, so it
 * restates these rules. This is the guard against the two drifting: if someone adds a cacheable
 * prefix in one place and not the other, this fails rather than a technician discovering it.
 */
describe("public/sw.js agrees with this policy", () => {
  const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

  it("names the same shell path", () => {
    expect(sw).toContain(`"${FIELD_SHELL_PATH}"`);
  });

  it("names the same cacheable prefixes and no others", () => {
    const declared = sw.match(/const ASSET_PREFIXES = \[([^\]]*)\]/);
    expect(declared, "public/sw.js must declare ASSET_PREFIXES").not.toBeNull();
    const inSw = declared![1].match(/"([^"]+)"/g)?.map((s) => s.replaceAll('"', "")) ?? [];
    expect(inSw).toEqual(CACHEABLE_ASSET_PREFIXES);
  });

  it("names the same individually cacheable files and no others", () => {
    const declared = sw.match(/const ASSET_PATHS = \[([^\]]*)\]/);
    expect(declared, "public/sw.js must declare ASSET_PATHS").not.toBeNull();
    const inSw = declared![1].match(/"([^"]+)"/g)?.map((s) => s.replaceAll('"', "")) ?? [];
    expect(inSw).toEqual(CACHEABLE_ASSET_PATHS);
  });
});
