"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";

export async function markOnboardingTourSeen() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return;
  await prisma.user.update({ where: { id: appUser.id }, data: { onboardingTourSeenAt: new Date() } });
}

export async function markPortalOnboardingTourSeen() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) return;
  await prisma.customerUser.update({ where: { id: customerUser.id }, data: { onboardingTourSeenAt: new Date() } });
}
