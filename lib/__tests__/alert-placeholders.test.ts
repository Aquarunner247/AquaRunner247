import { describe, it, expect } from "vitest";
import { applyAlertPlaceholders } from "@/lib/alert-placeholders";

describe("applyAlertPlaceholders", () => {
  it("replaces both tokens with the given values", () => {
    const result = applyAlertPlaceholders("Hi {{manager}}, a reminder about {{property}}.", {
      propertyName: "Pacific Harbors",
      managerName: "Jordan",
    });
    expect(result).toBe("Hi Jordan, a reminder about Pacific Harbors.");
  });

  it("is case-insensitive and tolerates stray spaces inside the braces", () => {
    const result = applyAlertPlaceholders("{{ Manager }} at {{PROPERTY}}", {
      propertyName: "Tailgate Beach Club",
      managerName: "Sam",
    });
    expect(result).toBe("Sam at Tailgate Beach Club");
  });

  it("replaces every occurrence, not just the first", () => {
    const result = applyAlertPlaceholders("{{property}} — thanks, {{property}} team!", {
      propertyName: "OYO Hotel",
      managerName: "Alex",
    });
    expect(result).toBe("OYO Hotel — thanks, OYO Hotel team!");
  });

  it("leaves unrecognized brace text untouched", () => {
    const result = applyAlertPlaceholders("See {{invoice}} for {{property}}.", {
      propertyName: "Bruce Village",
      managerName: "Robin",
    });
    expect(result).toBe("See {{invoice}} for Bruce Village.");
  });

  it("leaves a template with no tokens completely unchanged", () => {
    const result = applyAlertPlaceholders("Just a plain message, no merge fields here.", {
      propertyName: "Whatever",
      managerName: "Whoever",
    });
    expect(result).toBe("Just a plain message, no merge fields here.");
  });
});
