import { describe, it, expect, beforeEach } from "vitest";
import twilio from "twilio";
import { verifyTwilioSignature } from "@/lib/twilio-verify";

const AUTH_TOKEN = "test_auth_token_1234567890";
const URL = "https://example.com/api/twilio/voice?orgId=org_123";
const PARAMS = { CallSid: "CA1234567890", From: "+15551234567", To: "+15557654321" };

describe("verifyTwilioSignature", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  });

  it("accepts a genuinely valid signature", () => {
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, PARAMS);
    const req = new Request(URL, { headers: { "x-twilio-signature": signature } });
    expect(verifyTwilioSignature(req, URL, PARAMS)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, PARAMS);
    const lastChar = signature.at(-1);
    const tampered = signature.slice(0, -1) + (lastChar === "A" ? "B" : "A");
    const req = new Request(URL, { headers: { "x-twilio-signature": tampered } });
    expect(verifyTwilioSignature(req, URL, PARAMS)).toBe(false);
  });

  it("rejects a signature that's valid for different params -- a tampered request body", () => {
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, PARAMS);
    const req = new Request(URL, { headers: { "x-twilio-signature": signature } });
    const tamperedParams = { ...PARAMS, From: "+19995551234" };
    expect(verifyTwilioSignature(req, URL, tamperedParams)).toBe(false);
  });

  it("rejects a request with no signature header at all", () => {
    const req = new Request(URL);
    expect(verifyTwilioSignature(req, URL, PARAMS)).toBe(false);
  });

  it("rejects when TWILIO_AUTH_TOKEN isn't configured server-side", () => {
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, PARAMS);
    const req = new Request(URL, { headers: { "x-twilio-signature": signature } });
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(verifyTwilioSignature(req, URL, PARAMS)).toBe(false);
  });
});
