import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { parseCallTranscript } from "@/lib/phone-agent-intake";

/** Builds a mock model whose single doGenerate call returns `fixture` as a JSON text
 * part -- generateObject's default (non-tool-calling) strategy parses the model's text
 * output as JSON against the schema, so this is the shape a real model response takes. */
function mockModelReturning(fixture: object) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(fixture) }],
      finishReason: "stop",
      usage: {
        inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: undefined, text: undefined, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

describe("parseCallTranscript", () => {
  it("parses a routine chemical question", async () => {
    const fixture = {
      callerName: "Sandra Kim",
      callerCallbackNumber: null,
      propertyAddress: "412 Willow Creek Dr",
      issueType: "CHEMICAL_WATER_QUALITY",
      urgency: "ROUTINE",
      requestedCallbackTime: "tomorrow morning",
      summary: "Sandra Kim at 412 Willow Creek Dr asked whether it's safe to swim after adding shock last night. Not urgent, wants a callback tomorrow morning.",
    };
    const result = await parseCallTranscript(
      "Hi, this is Sandra Kim over at 412 Willow Creek Drive. I added some shock to the pool last night like the tech suggested, and I just wanted to check if it's safe for the kids to swim today or if we should wait. No rush, you can call me back tomorrow morning.",
      ["CHEMICAL_WATER_QUALITY", "EQUIPMENT_FAILURE", "LEAK", "NO_SHOW_COMPLAINT", "BILLING", "OTHER"],
      mockModelReturning(fixture),
    );
    expect(result.issueType).toBe("CHEMICAL_WATER_QUALITY");
    expect(result.urgency).toBe("ROUTINE");
    expect(result.callerName).toBe("Sandra Kim");
    expect(result.propertyAddress).toBe("412 Willow Creek Dr");
  });

  it("parses an equipment emergency", async () => {
    const fixture = {
      callerName: "Marcus Webb",
      callerCallbackNumber: "555-201-9988",
      propertyAddress: "88 Ridgeline Court",
      issueType: "EQUIPMENT_FAILURE",
      urgency: "EMERGENCY",
      requestedCallbackTime: "as soon as possible",
      summary: "Marcus Webb at 88 Ridgeline Court reports the pump housing has cracked and water is actively flooding the equipment pad, risking electrical exposure. Needs an emergency callback ASAP at 555-201-9988.",
    };
    const result = await parseCallTranscript(
      "This is an emergency, my name is Marcus Webb, address is 88 Ridgeline Court. The pump housing just cracked open and water is spraying everywhere, it's flooding right next to the electrical panel. I'm worried about a shock hazard. Please call me back as soon as possible, my cell is 555-201-9988.",
      ["CHEMICAL_WATER_QUALITY", "EQUIPMENT_FAILURE", "LEAK", "NO_SHOW_COMPLAINT", "BILLING", "OTHER"],
      mockModelReturning(fixture),
    );
    expect(result.issueType).toBe("EQUIPMENT_FAILURE");
    expect(result.urgency).toBe("EMERGENCY");
    expect(result.callerCallbackNumber).toBe("555-201-9988");
  });

  it("falls back to OTHER for an ambiguous transcript with mostly-null fields", async () => {
    const fixture = {
      callerName: null,
      callerCallbackNumber: null,
      propertyAddress: null,
      issueType: "OTHER",
      urgency: "ROUTINE",
      requestedCallbackTime: null,
      summary: "Caller left a brief, unclear message with background noise. No name, address, or specific issue was discernible -- needs a callback to clarify.",
    };
    const result = await parseCallTranscript(
      "Uh, hi, yeah, so, I was calling about, um... [muffled] ...the thing we talked about. Yeah. Okay bye.",
      ["CHEMICAL_WATER_QUALITY", "EQUIPMENT_FAILURE", "LEAK", "NO_SHOW_COMPLAINT", "BILLING", "OTHER"],
      mockModelReturning(fixture),
    );
    expect(result.issueType).toBe("OTHER");
    expect(result.callerName).toBeNull();
    expect(result.propertyAddress).toBeNull();
  });

  it("constrains issueType to the org's allowed set (plus OTHER) even with a narrow allow-list", async () => {
    // Only one real issue type allowed -- OTHER must still be a valid fallback.
    const fixture = {
      callerName: null,
      callerCallbackNumber: null,
      propertyAddress: null,
      issueType: "OTHER",
      urgency: "ROUTINE",
      requestedCallbackTime: null,
      summary: "Billing question, but billing isn't in this org's allowed issue types, so classified as OTHER.",
    };
    const result = await parseCallTranscript(
      "I have a question about my invoice from last month.",
      ["EQUIPMENT_FAILURE"],
      mockModelReturning(fixture),
    );
    expect(result.issueType).toBe("OTHER");
  });
});
