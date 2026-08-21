"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { UserRole } from "@/generated/prisma/enums";
import { OnboardingTour } from "./onboarding-tour";
import { ADMIN_TOUR_STEPS, TECHNICIAN_TOUR_STEPS } from "@/lib/onboarding-tour-steps";
import { markOnboardingTourSeen } from "@/lib/onboarding-actions";

type Props = {
  role: UserRole;
  tourSeen: boolean;
};

/**
 * Picks the right tour (if any) for this role + page, and whether it should actually
 * open -- automatically on first visit (tourSeen=false), or forced via ?tour=1 from a
 * "Replay tour" button elsewhere. Renders nothing for OFFICE or any other role/page --
 * OFFICE has no built-out home screen yet to point a tour at.
 */
export function OnboardingTourLauncher({ role, tourSeen }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [closed, setClosed] = useState(false);

  const forced = searchParams.get("tour") === "1";

  const steps =
    role === "ADMIN" && pathname === "/dashboard"
      ? ADMIN_TOUR_STEPS
      : role === "TECHNICIAN" && pathname === "/dashboard/schedule"
        ? TECHNICIAN_TOUR_STEPS
        : null;

  if (!steps || closed || (!forced && tourSeen)) return null;

  return <OnboardingTour steps={steps} onFinish={() => setClosed(true)} markSeenAction={markOnboardingTourSeen} />;
}
