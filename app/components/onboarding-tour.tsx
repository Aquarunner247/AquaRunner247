"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ABOVE_MAP_Z_INDEX } from "@/lib/client/overlay-z-index";

export type TourStep = {
  /** Value of a `data-tour="..."` attribute on the element this step points at. */
  target: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
  /**
   * True when this step's target is *legitimately* absent some of the time and the page
   * is still fully explained without it -- a warning banner that only shows when
   * something's wrong (routes-missing-coords, phone-agent-setup), or a section that
   * doesn't apply to every account (visit-checklist on residential, portal-qr-link for a
   * residential customer). Steps left non-optional are ones whose target is missing only
   * because the org hasn't got that far yet (no routes built, no visits logged), which is
   * what suppresses "seen" -- see markSeen below.
   */
  optional?: boolean;
};

type Props = {
  steps: TourStep[];
  onFinish: () => void;
  markSeenAction: () => Promise<void>;
};

const GAP = 12;
const SPOTLIGHT_PADDING = 6;
const VIEWPORT_MARGIN = 12;
const POLL_INTERVAL_MS = 100;
const POLL_ATTEMPTS = 10;
const BUBBLE_WIDTH_FALLBACK = 320;
const BUBBLE_HEIGHT_FALLBACK = 150;

function queryStep(step: TourStep): Element | null {
  return document.querySelector(`[data-tour="${step.target}"]`);
}

function waitForStep(step: TourStep): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
    function poll() {
      if (queryStep(step)) {
        resolve(true);
        return;
      }
      attempts += 1;
      if (attempts >= POLL_ATTEMPTS) {
        resolve(false);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();
  });
}

/**
 * Generic popup-callout tour engine -- no role-specific knowledge, just walks `steps`
 * pointing at `[data-tour="..."]` elements. Portals to document.body (like
 * camera-capture.tsx) since dashboard pages are full of backdrop-blur cards, which
 * break `position: fixed` for descendants.
 */
export function OnboardingTour({ steps, onFinish, markSeenAction }: Props) {
  const [mounted, setMounted] = useState(false);
  const [resolvedSteps, setResolvedSteps] = useState<TourStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: BUBBLE_WIDTH_FALLBACK, height: BUBBLE_HEIGHT_FALLBACK });

  useEffect(() => setMounted(true), []);

  /** Cleared when a required step's target was missing -- see the resolve effect below. */
  const [markSeenOnFinish, setMarkSeenOnFinish] = useState(true);

  /**
   * `dismissed` = the user actively opted out (Skip, or Escape) rather than reading to the
   * end. That always sticks, even for a tour that came up thin: otherwise a shop that
   * never builds routes would get the Routes tour on every single visit forever, with no
   * way to turn it off. Reaching the end of a thin tour doesn't stick, so the full version
   * still runs once the page has real content on it.
   */
  const finish = useCallback(
    ({ dismissed = false }: { dismissed?: boolean } = {}) => {
      if (dismissed || markSeenOnFinish) void markSeenAction();
      onFinish();
    },
    [markSeenOnFinish, markSeenAction, onFinish],
  );

  // Resolve which of this page's steps actually have a present target before showing
  // anything, so the visible tour is numbered "1 of N" against only the steps that will
  // really appear on this load -- rather than silently starting mid-count when an early
  // step (e.g. a conditional banner) doesn't apply right now. A step whose target never
  // shows up is left out entirely instead of pinning a spotlight to nothing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const present: TourStep[] = [];
      for (const step of steps) {
        const found = await waitForStep(step);
        if (cancelled) return;
        if (found) present.push(step);
      }
      if (cancelled) return;

      // A required step whose target never appeared means the page had nothing to point at
      // yet -- a brand-new org on Routes with no routes built, a new customer's portal with
      // no visits logged. Showing the two steps that *do* resolve and then marking the page
      // seen forever is how new signups ended up with a tour that skipped the parts they
      // most needed. Leave it unseen instead, so the full tour runs once the page has real
      // content on it. Steps flagged `optional` don't count -- their absence is normal and
      // would otherwise re-trigger the tour on every visit.
      const missingRequired = steps.some((step) => !step.optional && !present.includes(step));
      if (missingRequired) setMarkSeenOnFinish(false);

      if (present.length === 0) {
        onFinish();
        return;
      }
      setResolvedSteps(present);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  const step = resolvedSteps?.[stepIndex];

  const goNext = useCallback(() => {
    if (!resolvedSteps) return;
    if (stepIndex + 1 >= resolvedSteps.length) {
      finish();
    } else {
      setStepIndex(stepIndex + 1);
    }
  }, [stepIndex, resolvedSteps, finish]);

  // Track the current (already-confirmed-present) step's target position through resize/scroll.
  useEffect(() => {
    if (!step) return;
    const currentStep = step;
    function updateRect() {
      const el = queryStep(currentStep);
      if (el) setRect(el.getBoundingClientRect());
    }
    updateRect();
    window.addEventListener("resize", updateRect);
    document.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      document.removeEventListener("scroll", updateRect, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (bubbleRef.current) {
      setBubbleSize({ width: bubbleRef.current.offsetWidth, height: bubbleRef.current.offsetHeight });
    }
  }, [rect, step]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") finish({ dismissed: true });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish]);

  if (!mounted || !resolvedSteps || !step || !rect) return null;

  const placement = step.placement ?? "bottom";
  let top: number;
  let left: number;
  if (placement === "top") {
    top = rect.top - GAP - bubbleSize.height;
    left = rect.left + rect.width / 2 - bubbleSize.width / 2;
  } else if (placement === "left") {
    top = rect.top + rect.height / 2 - bubbleSize.height / 2;
    left = rect.left - GAP - bubbleSize.width;
  } else if (placement === "right") {
    top = rect.top + rect.height / 2 - bubbleSize.height / 2;
    left = rect.right + GAP;
  } else {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - bubbleSize.width / 2;
  }

  top = Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - bubbleSize.height - VIEWPORT_MARGIN);
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - bubbleSize.width - VIEWPORT_MARGIN);

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: ABOVE_MAP_Z_INDEX }}>
      <div
        className="app-tour-spotlight pointer-events-none fixed rounded-lg transition-all duration-150"
        style={{
          top: rect.top - SPOTLIGHT_PADDING,
          left: rect.left - SPOTLIGHT_PADDING,
          width: rect.width + SPOTLIGHT_PADDING * 2,
          height: rect.height + SPOTLIGHT_PADDING * 2,
        }}
      />
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        className="app-card fixed w-80 max-w-[calc(100vw-24px)]"
        style={{ top, left }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
          Step {stepIndex + 1} of {resolvedSteps.length}
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-brand-ink">{step.title}</h2>
        <p className="mt-1.5 text-sm text-brand-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => finish({ dismissed: true })} className="app-btn-ghost-sm">
            Skip
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button type="button" onClick={() => setStepIndex(stepIndex - 1)} className="app-btn-secondary-sm">
                Back
              </button>
            ) : null}
            <button type="button" onClick={goNext} className="app-btn-accent-sm">
              {stepIndex + 1 === resolvedSteps.length ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
