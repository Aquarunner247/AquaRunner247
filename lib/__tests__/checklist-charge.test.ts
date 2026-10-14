import { describe, it, expect } from "vitest";
import { parseChargeAmount } from "@/lib/checklist-charge";

function value(raw: string | null | undefined) {
  const parsed = parseChargeAmount(raw);
  if (!parsed.ok) throw new Error(`expected ok, got: ${parsed.reason}`);
  return parsed.value;
}

describe("parseChargeAmount", () => {
  it("reads a plain number", () => {
    expect(value("45")).toBe(45);
  });

  it("reads cents", () => {
    expect(value("45.50")).toBe(45.5);
  });

  it("accepts a typed dollar sign, since the box is a price box", () => {
    expect(value("$45.00")).toBe(45);
  });

  it("accepts thousands separators", () => {
    expect(value("1,200")).toBe(1200);
  });

  it("ignores surrounding whitespace", () => {
    expect(value("  45  ")).toBe(45);
  });

  /** The distinction the technician sees: no price reads "Extra", zero would read "$0.00". */
  it("treats blank as no price rather than zero", () => {
    expect(value("")).toBeNull();
    expect(value("   ")).toBeNull();
    expect(value(null)).toBeNull();
    expect(value(undefined)).toBeNull();
  });

  it("allows an explicit zero, which is not the same as blank", () => {
    expect(value("0")).toBe(0);
  });

  it("rejects a negative price", () => {
    expect(parseChargeAmount("-45").ok).toBe(false);
  });

  it("rejects more precision than money has", () => {
    expect(parseChargeAmount("45.555").ok).toBe(false);
  });

  it("rejects letters", () => {
    expect(parseChargeAmount("forty five").ok).toBe(false);
    expect(parseChargeAmount("45x").ok).toBe(false);
  });

  /** Exponent form in a price box is a slipped keyboard, not a thousand dollars. */
  it("rejects exponent notation", () => {
    expect(parseChargeAmount("1e3").ok).toBe(false);
  });

  it("rejects an implausible amount", () => {
    expect(parseChargeAmount("100001").ok).toBe(false);
  });

  it("explains itself when it refuses", () => {
    const parsed = parseChargeAmount("abc");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/price/i);
  });
});
