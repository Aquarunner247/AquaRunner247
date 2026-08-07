import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWaitlistNotificationEmail } from "@/lib/email";

export type WaitlistResult =
  | { status: "ok" }
  | { status: "duplicate" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

// Deliberately strict-but-simple: one @, a dot in the domain, no whitespace. Anything
// fancier rejects addresses that are actually deliverable.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isDuplicateError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export async function POST(request: Request) {
  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json<WaitlistResult>(
      { status: "error", message: "Something went wrong. Please try again." },
      { status: 400 },
    );
  }

  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!EMAIL.test(normalized)) {
    return NextResponse.json<WaitlistResult>(
      { status: "invalid", message: "Enter a valid email address." },
      { status: 422 },
    );
  }

  try {
    await prisma.waitlistSignup.create({ data: { email: normalized } });
  } catch (err) {
    // Already on the list is not a failure from the visitor's point of view, but the UI
    // does tell them so rather than pretending it was a fresh signup.
    if (isDuplicateError(err)) {
      return NextResponse.json<WaitlistResult>({ status: "duplicate" });
    }
    console.error("[waitlist] failed to record signup:", err);
    return NextResponse.json<WaitlistResult>(
      { status: "error", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  // Best-effort — a failed notification must not turn a successful signup into an error.
  void sendWaitlistNotificationEmail(normalized).catch((err) => {
    console.error("[waitlist] notification email failed:", err);
  });

  return NextResponse.json<WaitlistResult>({ status: "ok" });
}
