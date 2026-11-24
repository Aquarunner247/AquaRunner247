"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OnboardingTour } from "./onboarding-tour";
import { PORTAL_TOURS, portalTourSectionsFor } from "@/lib/onboarding-tour-steps";
import { markPortalOnboardingTourPageSeen } from "@/lib/onboarding-actions";
import { REPLAY_LOCATION } from "@/lib/onboarding-replay-location";

type Props = {
  seenPages: string[];
  /** Which set of sections a full run may walk -- a maintenance login cannot open most of the
   *  portal, so it gets the two pages it is allowed. See lib/portal-access.ts. */
  isMaintenance: boolean;
};

export function PortalOnboardingTourLauncher({ seenPages, isMaintenance }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [closed, setClosed] = useState(false);

  useEffect(() => setClosed(false), [pathname]);

  // `?tour=1` is this page; `?tour=all` is a run that hands off page to page. Same scheme as the
  // dashboard launcher, including keeping the position in the URL rather than in session state.
  const tourParam = searchParams.get("tour");
  const forced = tourParam === "1" || tourParam === "all";
  const chaining = tourParam === "all";
  const steps = PORTAL_TOURS[pathname] ?? null;

  const pathWithoutTourParam = () => {
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("tour");
    const qs = rest.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const nextSectionPath = (): string | null => {
    const sections = portalTourSectionsFor(isMaintenance);
    const here = sections.findIndex((s) => s.path === pathname);
    if (here < 0) return null;
    return sections[here + 1]?.path ?? null;
  };

  if (!steps || closed || (!forced && seenPages.includes(pathname))) return null;

  return (
    <OnboardingTour
      steps={steps}
      onFinish={({ dismissed }) => {
        setClosed(true);
        if (!chaining) return;
        const next = dismissed ? null : nextSectionPath();
        if (next) router.push(`${next}?tour=all`);
        else router.replace(pathWithoutTourParam());
      }}
      markSeenAction={() => markPortalOnboardingTourPageSeen(pathname)}
      // Same reasoning as the dashboard launcher: no note when they came from Replay tour themselves.
      replayLocation={forced ? null : REPLAY_LOCATION.CUSTOMER}
    />
  );
}
