"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { parseFormNumber } from "@/lib/form-utils";
import type { PhoneAgentIssueType } from "@/generated/prisma/enums";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const ALL_ISSUE_TYPES: PhoneAgentIssueType[] = [
  "EQUIPMENT_FAILURE",
  "CHEMICAL_WATER_QUALITY",
  "LEAK",
  "NO_SHOW_COMPLAINT",
  "BILLING",
  "OTHER",
];

/** Splits a textarea (one entry per line) into a clean, deduplicated string array --
 * shared shape for escalationPhones/escalationEmails, both plain String[] columns. */
function parseLines(raw: FormDataEntryValue | null): string[] {
  const lines = String(raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return Array.from(new Set(lines));
}

/** Builds the businessHours JSON from paired start/end time inputs (hours_mon_start,
 * hours_mon_end, ...) -- a day with either field blank is treated as closed that day
 * (both must be set for the day to count as open), matching lib/phone-agent.ts's
 * resolveRouteReason parsing. */
function parseBusinessHours(formData: FormData): Record<string, string> {
  const hours: Record<string, string> = {};
  for (const day of WEEKDAY_KEYS) {
    const start = String(formData.get(`hours_${day}_start`) ?? "").trim();
    const end = String(formData.get(`hours_${day}_end`) ?? "").trim();
    if (start && end) hours[day] = `${start}-${end}`;
  }
  return hours;
}

export async function updatePhoneAgentSettings(formData: FormData) {
  const appUser = await requireAdmin();

  const twilioPhoneNumber = String(formData.get("twilioPhoneNumber") ?? "").trim() || null;
  const primaryPhoneNumber = String(formData.get("primaryPhoneNumber") ?? "").trim() || null;
  const ringTimeoutSecondsRaw = parseFormNumber(formData.get("ringTimeoutSeconds"));
  const ringTimeoutSeconds = ringTimeoutSecondsRaw != null ? Math.min(Math.max(Math.round(ringTimeoutSecondsRaw), 5), 60) : 20;

  const businessHours = parseBusinessHours(formData);

  const escalationPhones = parseLines(formData.get("escalationPhones"));
  const escalationEmails = parseLines(formData.get("escalationEmails"));

  const serviceTerritoryDescription = String(formData.get("serviceTerritoryDescription") ?? "").trim() || null;
  const afterHoursGreeting = String(formData.get("afterHoursGreeting") ?? "").trim() || null;
  const busyOverflowGreeting = String(formData.get("busyOverflowGreeting") ?? "").trim() || null;
  const afterHoursCallbackPromise = String(formData.get("afterHoursCallbackPromise") ?? "").trim() || null;
  const busyOverflowCallbackPromise = String(formData.get("busyOverflowCallbackPromise") ?? "").trim() || null;

  const allowedIssueTypes = ALL_ISSUE_TYPES.filter((t) => formData.get(`issueType_${t}`) != null);

  const maxCallsPerDay = parseFormNumber(formData.get("maxCallsPerDay"));
  const maxMinutesPerDay = parseFormNumber(formData.get("maxMinutesPerDay"));
  const maxCallDurationSecondsRaw = parseFormNumber(formData.get("maxCallDurationSeconds"));
  const maxCallDurationSeconds = maxCallDurationSecondsRaw != null ? Math.round(maxCallDurationSecondsRaw) : null;

  // twilioPhoneNumber is globally unique (it's how an inbound call resolves to an org) --
  // check it isn't already claimed by a different org before saving, since a plain upsert
  // would otherwise surface as an opaque unique-constraint database error.
  if (twilioPhoneNumber) {
    const claimedByOther = await prisma.orgPhoneAgentSettings.findFirst({
      where: { twilioPhoneNumber, organizationId: { not: appUser.organizationId } },
      select: { id: true },
    });
    if (claimedByOther) {
      redirect("/dashboard/settings/phone-agent?error=number-in-use");
    }
  }

  const data = {
    twilioPhoneNumber,
    primaryPhoneNumber,
    ringTimeoutSeconds,
    businessHours,
    escalationPhones,
    escalationEmails,
    serviceTerritoryDescription,
    afterHoursGreeting,
    busyOverflowGreeting,
    afterHoursCallbackPromise,
    busyOverflowCallbackPromise,
    allowedIssueTypes,
    maxCallsPerDay,
    maxMinutesPerDay,
    maxCallDurationSeconds,
    updatedByUserId: appUser.id,
  };

  await prisma.orgPhoneAgentSettings.upsert({
    where: { organizationId: appUser.organizationId },
    create: { organizationId: appUser.organizationId, ...data },
    update: data,
  });

  revalidatePath("/dashboard/settings/phone-agent");
}

export async function updateTicketStatus(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !["NEW", "REVIEWED", "RESOLVED"].includes(status)) return;

  const existing = await prisma.phoneAgentCall.findFirst({ where: { id, organizationId: appUser.organizationId }, select: { id: true } });
  if (!existing) return;

  await prisma.phoneAgentCall.update({
    where: { id: existing.id },
    data: { ticketStatus: status as "NEW" | "REVIEWED" | "RESOLVED" },
  });

  revalidatePath("/dashboard/phone-agent");
}
