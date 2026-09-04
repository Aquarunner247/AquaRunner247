import { describe, it, expect, beforeEach } from "vitest";
import { verifyDialogflowWebhookSecret } from "@/lib/dialogflow-verify";

const SECRET = "dialogflow_shared_secret_1234567890";

function reqWithHeader(value: string | null): Request {
  const headers: HeadersInit = value != null ? { "x-dialogflow-webhook-secret": value } : {};
  return new Request("https://example.com/api/dialogflow/fulfillment", { headers });
}

describe("verifyDialogflowWebhookSecret", () => {
  beforeEach(() => {
    process.env.DIALOGFLOW_WEBHOOK_SECRET = SECRET;
  });

  it("accepts a genuinely matching secret", () => {
    expect(verifyDialogflowWebhookSecret(reqWithHeader(SECRET))).toBe(true);
  });

  it("rejects a tampered secret", () => {
    const lastChar = SECRET.at(-1);
    const tampered = SECRET.slice(0, -1) + (lastChar === "A" ? "B" : "A");
    expect(verifyDialogflowWebhookSecret(reqWithHeader(tampered))).toBe(false);
  });

  it("rejects a header of a different length than the expected secret", () => {
    expect(verifyDialogflowWebhookSecret(reqWithHeader(SECRET + "extra"))).toBe(false);
    expect(verifyDialogflowWebhookSecret(reqWithHeader("short"))).toBe(false);
  });

  it("rejects a request with no header at all", () => {
    expect(verifyDialogflowWebhookSecret(reqWithHeader(null))).toBe(false);
  });

  it("rejects when DIALOGFLOW_WEBHOOK_SECRET isn't configured server-side", () => {
    delete process.env.DIALOGFLOW_WEBHOOK_SECRET;
    expect(verifyDialogflowWebhookSecret(reqWithHeader(SECRET))).toBe(false);
  });
});
