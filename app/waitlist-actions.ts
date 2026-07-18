"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendWaitlistNotificationEmail } from "@/lib/email";

export async function joinWaitlist(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    redirect("/?waitlistError=1");
  }

  try {
    await prisma.waitlistSignup.create({ data: { email } });
    // Best-effort — a failed notification email shouldn't block confirming to the visitor.
    void sendWaitlistNotificationEmail(email);
  } catch (err) {
    // Duplicate email (already on the list) is not an error from the visitor's point of
    // view — still show the same confirmation. Anything else, log and still confirm rather
    // than showing a scary error for what's just an email capture form.
    const isDuplicate = typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
    if (!isDuplicate) {
      console.error("[waitlist] failed to record signup:", err);
    }
  }

  redirect("/?joined=1");
}
