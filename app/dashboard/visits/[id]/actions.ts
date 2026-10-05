"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { parseEmailRecipients } from "@/lib/email-recipients";
import { resendServiceSummary } from "@/lib/service-summary-email";

/**
 * Sends a service day's summary again, to addresses the office types in.
 *
 * ADMIN and OFFICE only -- a technician completing work triggers the automatic send and has no reason
 * to be choosing who else receives a copy of it. The visit is re-read and checked against the caller's
 * own organization here rather than trusted from the form, the same as every other action on this page.
 *
 * The outcome comes back in the URL rather than being swallowed: a resend that silently did nothing is
 * worse than no button, because the office would go on believing the customer has their report.
 */
export async function resendServiceSummaryEmail(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN" && appUser.role !== "OFFICE") redirect("/dashboard");

  const visitId = String(formData.get("visitId") ?? "").trim();
  if (!visitId) return;

  const visit = await prisma.serviceVisit.findFirst({
    where: { id: visitId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!visit) return;

  const parsed = parseEmailRecipients(String(formData.get("recipients") ?? ""));
  if (!parsed.ok) {
    redirect(`/dashboard/visits/${visitId}?resendError=${encodeURIComponent(parsed.error)}`);
  }

  const result = await resendServiceSummary(visit.id, parsed.emails);
  revalidatePath(`/dashboard/visits/${visitId}`);
  if (!result.ok) {
    redirect(`/dashboard/visits/${visitId}?resendError=${encodeURIComponent(result.error)}`);
  }
  redirect(`/dashboard/visits/${visitId}?resentTo=${encodeURIComponent(result.sentTo.join(", "))}`);
}
