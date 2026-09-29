/**
 * Error codes shared between route handlers and client callers. Deliberately free of any
 * `next/server` import so client bundles can read a code without pulling server-only modules
 * in with it — lib/api/request-body.ts is server-side and imports NextResponse.
 */

/**
 * The request body never fully arrived. Distinct from a validation failure: the payload wasn't
 * wrong, it was incomplete, so resending the same thing is the correct response rather than a
 * pointless retry. lib/client/offline-queue.ts treats it as retryable for that reason.
 */
export const INCOMPLETE_BODY = "INCOMPLETE_BODY";
