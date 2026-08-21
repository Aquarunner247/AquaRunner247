"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";

export async function markOnboardingTourPageSeen(pageKey: string) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return;
  await prisma.user.update({ where: { id: appUser.id }, data: { seenTourPages: { push: pageKey } } });
}

export async function markPortalOnboardingTourPageSeen(pageKey: string) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) return;
  await prisma.customerUser.update({ where: { id: customerUser.id }, data: { seenTourPages: { push: pageKey } } });
}
