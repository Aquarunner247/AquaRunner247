"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";

export async function bookOnboardingCall() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return;
  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: { onboardingCallBookedAt: new Date() },
  });
  revalidatePath("/", "layout");
}

export async function declineOnboardingCall() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return;
  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: { onboardingCallDeclinedAt: new Date() },
  });
  revalidatePath("/", "layout");
}
