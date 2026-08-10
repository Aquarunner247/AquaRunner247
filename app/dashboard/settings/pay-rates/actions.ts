"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { parseFormNumber } from "@/lib/form-utils";
import { createPayRateRow } from "@/lib/technician-pay";
import type { PayPeriodType } from "@/generated/prisma/enums";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

function toYmd(raw: FormDataEntryValue | null): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Adds a new effective-dated rate row for a (technician, body of water) pair. Always a
 * CREATE, never an update-in-place -- TechnicianPayRate keeps full history (see its schema
 * doc comment), so a rate change is a new row with a newer effectiveDate, not a mutation of
 * the old one. Fixing a data-entry mistake on an existing row is a separate action
 * (updateTechnicianPayRate) below.
 */
export async function createTechnicianPayRate(formData: FormData) {
  const appUser = await requireAdmin();
  const technicianId = String(formData.get("technicianId") ?? "").trim();
  const bodyOfWaterId = String(formData.get("bodyOfWaterId") ?? "").trim();
  const rateAmount = parseFormNumber(formData.get("rateAmount"));
  const isBundled = formData.get("isBundled") != null;
  const bundledIntoBodyOfWaterId = String(formData.get("bundledIntoBodyOfWaterId") ?? "").trim() || null;
  const effectiveDate = toYmd(formData.get("effectiveDate")) ?? new Date();
  if (!technicianId || !bodyOfWaterId || rateAmount == null) return;

  const [technician, bodyOfWater] = await Promise.all([
    prisma.user.findFirst({ where: { id: technicianId, organizationId: appUser.organizationId, role: "TECHNICIAN" }, select: { id: true } }),
    prisma.bodyOfWater.findFirst({ where: { id: bodyOfWaterId, property: { organizationId: appUser.organizationId } }, select: { id: true } }),
  ]);
  if (!technician || !bodyOfWater) return;

  await createPayRateRow({
    organizationId: appUser.organizationId,
    technicianId,
    bodyOfWaterId,
    rateAmount,
    isBundled,
    bundledIntoBodyOfWaterId,
    effectiveDate,
    createdByUserId: appUser.id,
  });

  revalidatePath("/dashboard/settings/pay-rates");
}

/** Corrects a mistake on an existing row (wrong amount typed, wrong bundled flag, etc.) --
 * an in-place edit, not a new historical version. Use createTechnicianPayRate instead when
 * the rate is genuinely changing going forward. */
export async function updateTechnicianPayRate(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const rateAmount = parseFormNumber(formData.get("rateAmount"));
  const isBundled = formData.get("isBundled") != null;
  const bundledIntoBodyOfWaterId = String(formData.get("bundledIntoBodyOfWaterId") ?? "").trim() || null;
  const effectiveDate = toYmd(formData.get("effectiveDate"));
  if (!id || rateAmount == null || !effectiveDate) return;

  const existing = await prisma.technicianPayRate.findFirst({ where: { id, organizationId: appUser.organizationId }, select: { id: true } });
  if (!existing) return;

  await prisma.technicianPayRate.update({
    where: { id: existing.id },
    data: { rateAmount, isBundled, bundledIntoBodyOfWaterId, effectiveDate },
  });

  revalidatePath("/dashboard/settings/pay-rates");
  redirect("/dashboard/settings/pay-rates");
}

/** Voids a row (created by mistake, tech/body pair no longer applies) without deleting it
 * -- TechnicianPayRate is an audit trail (Section 3 of the spec); a hard delete would erase
 * the record of what a rate used to be. */
export async function deactivateTechnicianPayRate(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const existing = await prisma.technicianPayRate.findFirst({ where: { id, organizationId: appUser.organizationId }, select: { id: true } });
  if (!existing) return;

  await prisma.technicianPayRate.update({ where: { id: existing.id }, data: { isActive: false } });
  revalidatePath("/dashboard/settings/pay-rates");
}

const VALID_PAY_PERIOD_TYPES: PayPeriodType[] = ["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"];

export async function updatePayrollSettings(formData: FormData) {
  const appUser = await requireAdmin();
  const payPeriodTypeRaw = String(formData.get("payPeriodType") ?? "").trim();
  const payPeriodType = VALID_PAY_PERIOD_TYPES.includes(payPeriodTypeRaw as PayPeriodType) ? (payPeriodTypeRaw as PayPeriodType) : "SEMI_MONTHLY";

  const weeklyStartDayOfWeekRaw = parseFormNumber(formData.get("weeklyStartDayOfWeek"));
  const weeklyStartDayOfWeek = weeklyStartDayOfWeekRaw != null && weeklyStartDayOfWeekRaw >= 1 && weeklyStartDayOfWeekRaw <= 7 ? weeklyStartDayOfWeekRaw : null;
  const biweeklyAnchorStartDate = toYmd(formData.get("biweeklyAnchorStartDate"));
  const semiMonthlySplitDayRaw = parseFormNumber(formData.get("semiMonthlySplitDay"));
  const semiMonthlySplitDay = semiMonthlySplitDayRaw != null ? Math.min(Math.max(Math.round(semiMonthlySplitDayRaw), 1), 27) : 15;
  const monthlyPayDayRaw = parseFormNumber(formData.get("monthlyPayDay"));
  const monthlyPayDay = monthlyPayDayRaw != null ? Math.min(Math.max(Math.round(monthlyPayDayRaw), 1), 28) : null;

  await prisma.orgPayrollSettings.upsert({
    where: { organizationId: appUser.organizationId },
    create: {
      organizationId: appUser.organizationId,
      payPeriodType,
      weeklyStartDayOfWeek,
      biweeklyAnchorStartDate,
      semiMonthlySplitDay,
      monthlyPayDay,
      updatedByUserId: appUser.id,
    },
    update: {
      payPeriodType,
      weeklyStartDayOfWeek,
      biweeklyAnchorStartDate,
      semiMonthlySplitDay,
      monthlyPayDay,
      updatedByUserId: appUser.id,
    },
  });

  revalidatePath("/dashboard/settings/pay-rates");
}
