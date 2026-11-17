import { describe, expect, it, afterEach } from "vitest";
import { applyRequested, rerunWithApply } from "@/scripts/db-target";

/**
 * These cover the npm `--` trap: `npm run <script> --apply` is silently discarded by npm
 * (verified on 10.9.7 -- the script sees argv [] and no npm_config_apply), so the dry-run
 * footer has to print the whole command, with the separator, rather than "pass --apply".
 */

const originalNpmScript = process.env.npm_lifecycle_event;
const originalArgv1 = process.argv[1];

afterEach(() => {
  if (originalNpmScript == null) delete process.env.npm_lifecycle_event;
  else process.env.npm_lifecycle_event = originalNpmScript;
  process.argv[1] = originalArgv1;
});

describe("applyRequested", () => {
  it("is false when the flag never reached the script, which is what npm does to it", () => {
    expect(applyRequested([])).toBe(false);
  });

  it("is true only on the exact flag", () => {
    expect(applyRequested(["--apply"])).toBe(true);
    expect(applyRequested(["--org=x", "--apply"])).toBe(true);
    expect(applyRequested(["--apply-everything"])).toBe(false);
    expect(applyRequested(["apply"])).toBe(false);
  });
});

describe("rerunWithApply", () => {
  it("names the npm script and the bare separator when npm launched it", () => {
    process.env.npm_lifecycle_event = "db:seed-nevada-temperature";
    expect(rerunWithApply([])).toBe("npm run db:seed-nevada-temperature -- --apply");
  });

  it("carries through the other arguments, so a re-run does not silently lose scope", () => {
    process.env.npm_lifecycle_event = "db:set-venue-pay-rates";
    expect(rerunWithApply(["--org=Lindley", "--effective-date=2026-11-16"])).toBe(
      "npm run db:set-venue-pay-rates -- --org=Lindley --effective-date=2026-11-16 --apply",
    );
  });

  it("does not print the flag twice if it was already passed", () => {
    process.env.npm_lifecycle_event = "db:prune-duplicate-doses";
    expect(rerunWithApply(["--apply"])).toBe("npm run db:prune-duplicate-doses -- --apply");
  });

  it("uses the tsx form, with a repo-relative path, when run directly", () => {
    delete process.env.npm_lifecycle_event;
    process.argv[1] = `${process.cwd()}/scripts/repair-stop-order.ts`;
    expect(rerunWithApply(["--include-today"])).toBe(
      "npx tsx scripts/repair-stop-order.ts --include-today --apply",
    );
  });
});
