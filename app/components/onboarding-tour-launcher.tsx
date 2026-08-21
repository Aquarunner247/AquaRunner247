"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { UserRole } from "@/generated/prisma/enums";
import { OnboardingTour } from "./onboarding-tour";
import { ADMIN_TOURS, TECHNICIAN_TOURS, VISIT_DETAIL_TOUR_STEPS } from "@/lib/onboarding-tour-steps";
import { markOnboardingTourPageSeen } from "@/lib/onboarding-actions";

type Props = {
  role: UserRole;
  seenPages: string[];
};

const VISIT_DETAIL_PAGE_KEY = "/dashboard/visits";

/**
 * Picks the right tour (if any) for this role + page, and whether it should actually
 * open -- automatically on first visit to that specific page, or forced via ?tour=1
 * from a "Replay tour" button. Renders nothing for OFFICE or any page without a tour.
 *
 * /dashboard/visits/[id] is a dynamic route -- usePathname() returns the real visit id,
 * so it can't be a plain key in ADMIN_TOURS/TECHNICIAN_TOURS. It's special-cased here,
 * normalized to one shared page key so "seen" is tracked once for the whole screen,
 * not per individual visit.
 */
export function OnboardingTourLauncher({ role, seenPages }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [closed, setClosed] = useState(false);

  useEffect(() => setClosed(false), [pathname]);

  const forced = searchParams.get("tour") === "1";
  const isVisitDetail = role === "TECHNICIAN" && pathname.startsWith("/dashboard/visits/");
  const pageKey = isVisitDetail ? VISIT_DETAIL_PAGE_KEY : pathname;

  const toursForRole = role === "ADMIN" ? ADMIN_TOURS : role === "TECHNICIAN" ? TECHNICIAN_TOURS : null;
  const steps = isVisitDetail ? VISIT_DETAIL_TOUR_STEPS : (toursForRole?.[pathname] ?? null);

  if (!steps || steps.length === 0 || closed || (!forced && seenPages.includes(pageKey))) return null;

  return (
    <OnboardingTour
      steps={steps}
      onFinish={() => setClosed(true)}
      markSeenAction={() => markOnboardingTourPageSeen(pageKey)}
    />
  );
}
