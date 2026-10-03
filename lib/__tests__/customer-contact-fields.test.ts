import { describe, it, expect } from "vitest";
import { parseCustomerContact } from "@/lib/customer-contact-fields";

function form(fields: Record<string, string>) {
  return { get: (name: string) => (name in fields ? fields[name] : null) };
}

describe("parseCustomerContact", () => {
  it("takes a full contact", () => {
    const result = parseCustomerContact(
      form({ name: "Dana Reyes", title: "Regional Manager", email: "dana@rpmliving.com", phone: "(702) 555-0134" }),
    );
    expect(result).toEqual({
      ok: true,
      value: { name: "Dana Reyes", title: "Regional Manager", email: "dana@rpmliving.com", phone: "(702) 555-0134" },
    });
  });

  /** A name you have and a number you don't is still worth recording. */
  it("takes a name alone", () => {
    const result = parseCustomerContact(form({ name: "Dana Reyes" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ name: "Dana Reyes", title: null, email: null, phone: null });
  });

  it("requires a name", () => {
    const cases: Record<string, string>[] = [{}, { name: "" }, { name: "   " }, { name: "", email: "dana@example.com" }];
    for (const fields of cases) {
      const result = parseCustomerContact(form(fields));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/name is required/);
    }
  });

  it("rejects an email that cannot be one", () => {
    for (const email of ["dana", "dana@", "@rpmliving.com", "dana@rpmliving", "dana @rpmliving.com"]) {
      const result = parseCustomerContact(form({ name: "Dana", email }));
      expect(result.ok).toBe(false);
    }
  });

  it("accepts the shapes real addresses come in", () => {
    for (const email of ["a@b.co", "dana.reyes+ap@rpm-living.com", "AP@sub.domain.example.org"]) {
      expect(parseCustomerContact(form({ name: "Dana", email })).ok).toBe(true);
    }
  });

  it("collapses whitespace and trims", () => {
    const result = parseCustomerContact(form({ name: "  Dana   Reyes ", title: " Regional   Manager  " }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Dana Reyes");
      expect(result.value.title).toBe("Regional Manager");
    }
  });

  it("caps a pasted wall of text rather than storing it", () => {
    const result = parseCustomerContact(form({ name: "x".repeat(500) }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name.length).toBe(120);
  });

  it("treats a blank optional field as absent, not empty string", () => {
    const result = parseCustomerContact(form({ name: "Dana", title: "", email: "", phone: "  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ name: "Dana", title: null, email: null, phone: null });
  });
});
