import { describe, it, expect } from "vitest";
import { parseEmailRecipients } from "@/lib/email-recipients";

describe("parseEmailRecipients", () => {
  it("takes one address", () => {
    expect(parseEmailRecipients("dana@rpmliving.com")).toEqual({ ok: true, emails: ["dana@rpmliving.com"] });
  });

  it("accepts every separator a pasted list arrives with", () => {
    for (const raw of [
      "a@x.com, b@x.com",
      "a@x.com;b@x.com",
      "a@x.com b@x.com",
      "a@x.com\nb@x.com",
      " a@x.com ,  b@x.com ",
    ]) {
      expect(parseEmailRecipients(raw)).toEqual({ ok: true, emails: ["a@x.com", "b@x.com"] });
    }
  });

  it("lowercases and drops duplicates, keeping the order typed", () => {
    expect(parseEmailRecipients("Dana@X.com, b@x.com, DANA@x.com")).toEqual({
      ok: true,
      emails: ["dana@x.com", "b@x.com"],
    });
  });

  it("refuses an empty box", () => {
    for (const raw of ["", "   ", ",,", " ; "]) {
      const result = parseEmailRecipients(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/at least one/);
    }
  });

  /** Names the bad one, so the admin can see which of five addresses is the typo. */
  it("names the address it could not accept", () => {
    const result = parseEmailRecipients("a@x.com, nope, b@x.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('"nope"');
  });

  it("caps a list that is really a mailing list", () => {
    const many = Array.from({ length: 11 }, (_, i) => `a${i}@x.com`).join(", ");
    const result = parseEmailRecipients(many);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/smaller batches/);
  });

  it("allows exactly the cap", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `a${i}@x.com`).join(", ");
    expect(parseEmailRecipients(ten).ok).toBe(true);
  });
});
