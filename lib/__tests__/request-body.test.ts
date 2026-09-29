import { describe, expect, it } from "vitest";
import { readFormDataBody, readJsonBody } from "@/lib/api/request-body";
import { INCOMPLETE_BODY } from "@/lib/api/error-codes";
import { readErrorCode } from "@/lib/client/offline-queue";

/**
 * A body cut off mid-flight: Content-Type announces multipart, but the closing boundary never
 * arrives. This is the exact shape that produced 8 production 500s from one technician
 * ("no boundary found in multipart body").
 */
function truncatedMultipartRequest(): Request {
  return new Request("https://example.test/api/visits/v1/photos", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=----abc123" },
    body: '------abc123\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\n\r\n\xff\xd8\xff',
  });
}

describe("readFormDataBody", () => {
  it("returns the parsed form data for a complete body", async () => {
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([1, 2, 3])], "pool.jpg", { type: "image/jpeg" }));
    form.append("capturedAt", "2026-09-29T12:00:00.000Z");

    const result = await readFormDataBody(new Request("https://example.test/", { method: "POST", body: form }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.get("capturedAt")).toBe("2026-09-29T12:00:00.000Z");
    expect(result.value.get("photo")).toBeInstanceOf(File);
  });

  it("answers 400 INCOMPLETE_BODY for a truncated multipart body instead of throwing", async () => {
    const result = await readFormDataBody(truncatedMultipartRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({ error: INCOMPLETE_BODY });
  });
});

describe("readJsonBody", () => {
  it("returns the parsed payload for a complete body", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ freeChlorine: 3.2 }),
    });

    const result = await readJsonBody<{ freeChlorine: number }>(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.freeChlorine).toBe(3.2);
  });

  it("answers 400 INCOMPLETE_BODY for a truncated JSON body", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"freeChlorine": 3.2, "ph":', // cut off mid-payload
    });

    const result = await readJsonBody(request);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({ error: INCOMPLETE_BODY });
  });

  it("answers 400 for an empty body", async () => {
    const result = await readJsonBody(
      new Request("https://example.test/", { method: "POST", headers: { "Content-Type": "application/json" } }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("readErrorCode", () => {
  it("reads the error code from a JSON error response", async () => {
    const response = new Response(JSON.stringify({ error: INCOMPLETE_BODY }), { status: 400 });
    await expect(readErrorCode(response)).resolves.toBe(INCOMPLETE_BODY);
  });

  /**
   * The reason it clones. queuedSubmitFormData reads the code to decide whether to retry, then
   * hands the SAME response back to uploadVisitPhoto, which reads it again for the user-facing
   * message. Consuming it here would make every non-retryable failure fall back to a generic
   * "Photo upload failed" instead of "That photo is too large", etc.
   */
  it("leaves the body readable for the caller", async () => {
    const response = new Response(JSON.stringify({ error: "FILE_TOO_LARGE" }), { status: 400 });

    await expect(readErrorCode(response)).resolves.toBe("FILE_TOO_LARGE");
    expect(response.bodyUsed).toBe(false);
    await expect(response.json()).resolves.toEqual({ error: "FILE_TOO_LARGE" });
  });

  it("returns null for a non-JSON body, such as a 500 HTML error page", async () => {
    const response = new Response("<html><body>Internal Server Error</body></html>", { status: 500 });
    await expect(readErrorCode(response)).resolves.toBeNull();
  });

  it("returns null when the payload has no string error field", async () => {
    await expect(readErrorCode(new Response(JSON.stringify({ error: 42 }), { status: 400 }))).resolves.toBeNull();
    await expect(readErrorCode(new Response(JSON.stringify({ ok: false }), { status: 400 }))).resolves.toBeNull();
  });
});
