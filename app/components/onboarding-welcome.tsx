"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ABOVE_MAP_Z_INDEX } from "@/lib/client/overlay-z-index";

type Props = {
  /** Shapes where the "how to get it back" line points, which differs per role. */
  role: "ADMIN" | "TECHNICIAN";
  orgName: string | null;
  /** Start the tour: records the answer, then lets the page's own tour open. */
  onStart: () => void;
  /** Decline: records the answer and suppresses tours, then shows the reminder step. */
  onDismiss: () => void;
};

/** Where "Replay tour" actually lives for each role -- see settings/page.tsx and more/page.tsx. */
const REPLAY_LOCATION: Record<Props["role"], string> = {
  ADMIN: "Settings",
  TECHNICIAN: "More",
};

/**
 * The first thing a new account sees, before any tour opens on its own.
 *
 * Two steps rather than one: the tour used to start unannounced the moment someone landed on the
 * dashboard, which is disorienting on a screen you have never seen. Now it asks first, and if the
 * answer is no it says how to get the tour back -- otherwise declining looks like turning a feature
 * off permanently.
 *
 * Portaled to document.body for the same reason the tour and the camera are: dashboard cards use
 * backdrop-blur, and CSS backdrop-filter breaks `position: fixed` for descendants.
 */
export function OnboardingWelcome({ role, orgName, onStart, onDismiss }: Props) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"welcome" | "reminder">("welcome");
  const [closed, setClosed] = useState(false);

  useEffect(() => setMounted(true), []);

  // Escape counts as declining, not as silently closing: leaving the welcome unanswered would
  // bring it back on the next page load, and the tour would still be waiting behind it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (step === "welcome") {
        onDismiss();
        setStep("reminder");
      } else {
        setClosed(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!mounted || closed) return null;

  function close() {
    setClosed(true);
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-brand-ink/70 p-4"
      style={{ zIndex: ABOVE_MAP_Z_INDEX }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-welcome-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-brand-border bg-white p-5 shadow-soft">
        {step === "welcome" ? (
          <>
            <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-primary">
              Welcome to AquaRunner
            </p>
            <h2 id="onboarding-welcome-title" className="mt-1 font-display text-xl font-bold text-brand-ink">
              {orgName ? `${orgName} is set up` : "Your account is set up"}
            </h2>
            <p className="mt-3 text-sm text-brand-ink">
              There&rsquo;s a short guided tour that points out what each part of a screen does. It runs a few
              callouts at a time, on each screen as you reach it, and you can stop it whenever you like.
            </p>
            <p className="mt-2 text-sm text-brand-muted">
              {role === "ADMIN"
                ? "Skip it if you'd rather look around first — nothing is hidden behind the tour."
                : "Skip it if you'd rather get straight to your route — nothing is hidden behind the tour."}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onStart();
                  close();
                }}
                className="app-btn-primary-sm min-h-[44px]"
              >
                Start the tour
              </button>
              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  setStep("reminder");
                }}
                className="app-btn-secondary-sm min-h-[44px]"
              >
                Not now
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-primary">
              Tour skipped
            </p>
            <h2 id="onboarding-welcome-title" className="mt-1 font-display text-xl font-bold text-brand-ink">
              You can start it any time
            </h2>
            <p className="mt-3 text-sm text-brand-ink">
              Open <strong>{REPLAY_LOCATION[role]}</strong> in the menu and choose{" "}
              <strong>Replay tour</strong>. It starts from the beginning, as often as you want.
            </p>
            <p className="mt-2 text-sm text-brand-muted">
              Until then the callouts stay out of your way.
            </p>

            <div className="mt-5">
              <button type="button" onClick={close} className="app-btn-primary-sm min-h-[44px]">
                Got it
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
