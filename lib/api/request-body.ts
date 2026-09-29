import { NextResponse } from "next/server";
import { INCOMPLETE_BODY } from "@/lib/api/error-codes";

/**
 * Parses a request body, turning a truncated one into a 400 rather than letting it throw out
 * of the route handler.
 *
 * A phone on weak signal can have its body cut off mid-flight: the request arrives with its
 * Content-Type set, but the remaining bytes never do. `request.formData()` throws
 * "no boundary found in multipart body" for that and `request.json()` throws a parse error,
 * and an unhandled throw inside a route handler becomes a 500 -- which gives the technician a
 * bare "upload failed", leaves the client with no error code to branch on, and lands in
 * runtime-error monitoring looking like a server bug instead of a dropped connection. This was
 * observed in production: 8 failed photo uploads from one technician inside four minutes.
 *
 * Callers do:
 *
 *     const parsed = await readFormDataBody(request);
 *     if (!parsed.ok) return parsed.response;
 */
type ParseResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

function incompleteBody(what: string, error: unknown): { ok: false; response: NextResponse } {
  // warn, not error: this is a network condition, and logging it at error level is what made
  // it look like an outage in monitoring.
  console.warn(`[api] incomplete ${what} body:`, error instanceof Error ? error.message : error);
  return { ok: false, response: NextResponse.json({ error: INCOMPLETE_BODY }, { status: 400 }) };
}

export async function readFormDataBody(request: Request): Promise<ParseResult<FormData>> {
  try {
    return { ok: true, value: await request.formData() };
  } catch (error) {
    return incompleteBody("multipart", error);
  }
}

export async function readJsonBody<T>(request: Request): Promise<ParseResult<T>> {
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch (error) {
    return incompleteBody("JSON", error);
  }
}
