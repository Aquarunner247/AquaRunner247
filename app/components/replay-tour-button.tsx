"use client";

import { useRouter } from "next/navigation";

type Props = {
  /** Page the tour actually runs on -- this button navigates there with ?tour=1, and
   * that page's OnboardingTourLauncher/PortalOnboardingTourLauncher picks it up from
   * there. Keeps replay self-contained with no shared tour state to wire up. */
  returnTo: string;
  label?: string;
  className: string;
};

export function ReplayTourButton({ returnTo, label = "Replay tour", className }: Props) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push(`${returnTo}?tour=1`)} className={className}>
      {label}
    </button>
  );
}
