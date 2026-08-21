"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type TourStep = {
  /** Value of a `data-tour="..."` attribute on the element this step points at. */
  target: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
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

/**
 * Generic popup-callout tour engine -- no role-specific knowledge, just walks `steps`
 * pointing at `[data-tour="..."]` elements. Portals to document.body (like
 * camera-capture.tsx) since dashboard pages are full of backdrop-blur cards, which
 * break `position: fixed` for descendants. Missing targets (empty-state cards, slow
 * client data) are skipped rather than crashing or showing a spotlight on nothing.
 */
export function OnboardingTour({ steps, onFinish, markSeenAction }: Props) {
  const [mounted, setMounted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: BUBBLE_WIDTH_FALLBACK, height: BUBBLE_HEIGHT_FALLBACK });

  useEffect(() => setMounted(true), []);

  const step = steps[stepIndex];

  const finish = useCallback(() => {
    void markSeenAction();
    onFinish();
  }, [markSeenAction, onFinish]);

  const goNext = useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      finish();
    } else {
      setStepIndex(stepIndex + 1);
    }
  }, [stepIndex, steps.length, finish]);

  // Find (and keep tracking) the current step's target element. Polls briefly since some
  // anchors mount after client data loads; auto-advances past a step whose target never
  // shows up rather than pinning a spotlight to nothing.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    setRect(null);

    const selector = `[data-tour="${step.target}"]`;

    function updateRect() {
      const el = document.querySelector(selector);
      if (el) setRect(el.getBoundingClientRect());
    }

    function poll() {
      if (cancelled) return;
      const el = document.querySelector(selector);
      if (el) {
        setRect(el.getBoundingClientRect());
        window.addEventListener("resize", updateRect);
        document.addEventListener("scroll", updateRect, true);
        return;
      }
      attempts += 1;
      if (attempts >= POLL_ATTEMPTS) {
        goNext();
        return;
      }
      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      window.removeEventListener("resize", updateRect);
      document.removeEventListener("scroll", updateRect, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useLayoutEffect(() => {
    if (bubbleRef.current) {
      setBubbleSize({ width: bubbleRef.current.offsetWidth, height: bubbleRef.current.offsetHeight });
    }
  }, [rect, step]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish]);

  if (!mounted || !rect) return null;

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
    <div className="fixed inset-0 z-[60]">
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
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-brand-ink">{step.title}</h2>
        <p className="mt-1.5 text-sm text-brand-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="app-btn-ghost-sm">
            Skip
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button type="button" onClick={() => setStepIndex(stepIndex - 1)} className="app-btn-secondary-sm">
                Back
              </button>
            ) : null}
            <button type="button" onClick={goNext} className="app-btn-accent-sm">
              {stepIndex + 1 === steps.length ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
