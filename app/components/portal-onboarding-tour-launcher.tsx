"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { OnboardingTour } from "./onboarding-tour";
import { PORTAL_TOURS } from "@/lib/onboarding-tour-steps";
import { markPortalOnboardingTourPageSeen } from "@/lib/onboarding-actions";

type Props = {
  seenPages: string[];
};

export function PortalOnboardingTourLauncher({ seenPages }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [closed, setClosed] = useState(false);

  useEffect(() => setClosed(false), [pathname]);

  const forced = searchParams.get("tour") === "1";
  const steps = PORTAL_TOURS[pathname] ?? null;

  if (!steps || closed || (!forced && seenPages.includes(pathname))) return null;

  return (
    <OnboardingTour
      steps={steps}
      onFinish={() => setClosed(true)}
      markSeenAction={() => markPortalOnboardingTourPageSeen(pathname)}
    />
  );
}
