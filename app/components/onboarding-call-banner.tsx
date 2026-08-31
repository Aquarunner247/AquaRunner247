"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { bookOnboardingCall, declineOnboardingCall } from "./onboarding-call-banner-actions";

const SETMORE_BOOKING_URL = "https://breanna26mn.setmore.com";

/** Site-wide "book a free onboarding call" strip -- rendered from the root layout so it
 * shows above every AquaRunner Pro (/dashboard) and AquaRunner Compliance (/cpo) page,
 * no matter where a customer gets stuck. Hidden on the marketing site and customer
 * portal, where `show` (derived server-side from Organization.onboardingCall{Booked,
 * Declined}At -- see app/layout.tsx) is never true anyway since those aren't staff users.
 *
 * There's no Setmore webhook wired up, so "they did the call" isn't something this can
 * verify -- clicking through to book is treated as the completion signal. Declining
 * instead requires confirming the forfeit warning, since that one's a one-way door. */
export function OnboardingCallBanner({ show }: { show: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();

  if (pathname.startsWith("/portal")) return null;
  if (
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/features") ||
    pathname.startsWith("/for-property-managers") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup")
  ) {
    return null;
  }
  if (!show || dismissed) return null;

  function handleBook() {
    window.open(SETMORE_BOOKING_URL, "_blank", "noopener,noreferrer");
    setDismissed(true);
    startTransition(() => {
      void bookOnboardingCall().then(() => router.refresh());
    });
  }

  function handleConfirmDecline() {
    setDismissed(true);
    startTransition(() => {
      void declineOnboardingCall().then(() => router.refresh());
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-warmBorder bg-brand-warmFoam px-4 py-2.5 text-sm text-brand-ink">
      {confirming ? (
        <>
          <p className="font-semibold">
            You&rsquo;re forfeiting your free onboarding call — you won&rsquo;t see this offer again.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleConfirmDecline} className="app-btn-danger-sm">
              Yes, dismiss it
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="app-btn-ghost-sm">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Stuck on anything? Book a free 20-minute onboarding call and we&rsquo;ll walk through it live.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleBook} className="app-btn-accent-sm">
              Book a free call
            </button>
            <button type="button" onClick={() => setConfirming(true)} className="app-btn-ghost-sm">
              I don&rsquo;t need it
            </button>
          </div>
        </>
      )}
    </div>
  );
}
