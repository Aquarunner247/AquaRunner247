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

/**
 * Records that this person answered the first-login welcome by starting the tour. The page tours
 * then run as they always have, marking themselves seen one page at a time.
 */
export async function startOnboardingTours() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return;
  await prisma.user.update({
    where: { id: appUser.id },
    data: { welcomeSeenAt: new Date(), toursDismissedAt: null },
  });
}

/**
 * Records that they declined. Both columns are set: the welcome does not come back, and no tour
 * opens by itself on any page afterwards.
 *
 * Suppressing the tours is the point rather than a side effect -- declining a tour and then having
 * it open unannounced on the next page would make the choice meaningless. "Replay tour" is
 * unaffected, since it forces the tour through ?tour=1.
 */
export async function dismissOnboardingTours() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return;
  const now = new Date();
  await prisma.user.update({
    where: { id: appUser.id },
    data: { welcomeSeenAt: now, toursDismissedAt: now },
  });
}
