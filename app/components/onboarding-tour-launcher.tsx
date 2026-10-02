"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { UserRole } from "@/generated/prisma/enums";
import { OnboardingTour } from "./onboarding-tour";
import { OnboardingWelcome } from "./onboarding-welcome";
import { ADMIN_TOURS, TECHNICIAN_TOURS, VISIT_DETAIL_TOUR_STEPS } from "@/lib/onboarding-tour-steps";
import { REPLAY_LOCATION } from "@/lib/onboarding-replay-location";
import {
  markOnboardingTourPageSeen,
  startOnboardingTours,
  dismissOnboardingTours,
} from "@/lib/onboarding-actions";

type Props = {
  role: UserRole;
  seenPages: string[];
  /** Null until this person has answered the first-login welcome. */
  welcomeSeenAt: Date | string | null;
  /** Set only if they declined it; while set, no tour opens by itself. */
  toursDismissedAt: Date | string | null;
  orgName: string | null;
};

const VISIT_DETAIL_PAGE_KEY = "/dashboard/visits";

/** The welcome only appears here. Login lands on /dashboard, and a tour-explaining dialog has no
 *  business interrupting someone who arrived straight at a visit form from a link. Anyone whose
 *  first page is elsewhere simply gets it when they reach the dashboard. */
const WELCOME_PAGE = "/dashboard";

/**
 * Picks the right tour (if any) for this role + page, and whether it should actually open --
 * automatically on first visit to that specific page, or forced via ?tour=1 from a "Replay tour"
 * button. Renders nothing for OFFICE or any page without a tour.
 *
 * Also owns the first-login welcome, because the two have to be sequenced: a tour that opened while
 * the welcome was still on screen would be pointing at elements behind a modal, and one that opened
 * after the person declined would make declining meaningless.
 *
 * /dashboard/visits/[id] is a dynamic route -- usePathname() returns the real visit id, so it can't
 * be a plain key in ADMIN_TOURS/TECHNICIAN_TOURS. It's special-cased here, normalized to one shared
 * page key so "seen" is tracked once for the whole screen, not per individual visit.
 */
export function OnboardingTourLauncher({ role, seenPages, welcomeSeenAt, toursDismissedAt, orgName }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [closed, setClosed] = useState(false);

  /** Answered in this session. The server props can't change without a refresh, so the choice has
   *  to be remembered here or the welcome would reappear on the next navigation. */
  const [answered, setAnswered] = useState<null | "started" | "dismissed">(null);

  useEffect(() => setClosed(false), [pathname]);

  const forced = searchParams.get("tour") === "1";
  const isVisitDetail = role === "TECHNICIAN" && pathname.startsWith("/dashboard/visits/");
  const pageKey = isVisitDetail ? VISIT_DETAIL_PAGE_KEY : pathname;

  const toursForRole = role === "ADMIN" ? ADMIN_TOURS : role === "TECHNICIAN" ? TECHNICIAN_TOURS : null;
  const steps = isVisitDetail ? VISIT_DETAIL_TOUR_STEPS : (toursForRole?.[pathname] ?? null);

  // OFFICE has no tour at all, so it gets no welcome either -- there would be nothing to offer.
  const tourableRole = role === "ADMIN" || role === "TECHNICIAN";
  const needsWelcome = tourableRole && welcomeSeenAt == null && answered === null;
  const showWelcome = needsWelcome && pathname === WELCOME_PAGE && !forced;

  // Replaying always wins. Otherwise a tour stays shut while the welcome is unanswered, and stays
  // shut for good once declined.
  const declined = answered === "dismissed" || (answered === null && toursDismissedAt != null);
  const blockedByWelcome = needsWelcome || declined;

  const showTour =
    steps != null && steps.length > 0 && !closed && (forced || (!seenPages.includes(pageKey) && !blockedByWelcome));

  return (
    <>
      {showWelcome ? (
        <OnboardingWelcome
          role={role === "ADMIN" ? "ADMIN" : "TECHNICIAN"}
          orgName={orgName}
          onStart={() => {
            setAnswered("started");
            void startOnboardingTours();
          }}
          onDismiss={() => {
            setAnswered("dismissed");
            void dismissOnboardingTours();
          }}
        />
      ) : null}

      {showTour ? (
        <OnboardingTour
          steps={steps}
          onFinish={() => setClosed(true)}
          markSeenAction={() => markOnboardingTourPageSeen(pageKey)}
          // Null on a replay: they pressed Replay tour to get here, so being told where that button is
          // would be telling them what they just did. OFFICE never reaches here (no steps), but it has
          // no Replay tour button either, so it gets no note rather than a wrong one.
          replayLocation={
            forced ? null : role === "ADMIN" ? REPLAY_LOCATION.ADMIN : role === "TECHNICIAN" ? REPLAY_LOCATION.TECHNICIAN : null
          }
        />
      ) : null}
    </>
  );
}
