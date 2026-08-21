"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { OnboardingTour } from "./onboarding-tour";
import { PORTAL_TOUR_STEPS } from "@/lib/onboarding-tour-steps";
import { markPortalOnboardingTourSeen } from "@/lib/onboarding-actions";

type Props = {
  tourSeen: boolean;
};

export function PortalOnboardingTourLauncher({ tourSeen }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [closed, setClosed] = useState(false);

  const forced = searchParams.get("tour") === "1";

  if (pathname !== "/portal" || closed || (!forced && tourSeen)) return null;

  return (
    <OnboardingTour steps={PORTAL_TOUR_STEPS} onFinish={() => setClosed(true)} markSeenAction={markPortalOnboardingTourSeen} />
  );
}
