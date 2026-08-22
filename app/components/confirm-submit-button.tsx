"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ABOVE_MAP_Z_INDEX } from "@/lib/client/overlay-z-index";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmMessage: string;
  className?: string;
};

export function ConfirmSubmitButton({ label, confirmMessage, className }: ConfirmSubmitButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <button ref={submitRef} type="submit" className="hidden" aria-hidden="true" tabIndex={-1}>
        {label}
      </button>

      {open && mounted
        ? createPortal(
            // Portaled to document.body (like camera-capture.tsx/onboarding-tour.tsx) so an
            // ancestor .app-card's backdrop-blur can't break `position: fixed`, and given a
            // z-index comfortably above Leaflet's own max (1000) so this can never render
            // behind a map elsewhere on the page (confirmed happening on /dashboard/routes
            // once the route builder map shipped -- delete-route's confirm dialog was
            // appearing under the map).
            <div
              className="fixed inset-0 flex items-center justify-center bg-brand-ink/50 px-4 backdrop-blur-[2px]"
              style={{ zIndex: ABOVE_MAP_Z_INDEX }}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-brand-border/90 bg-white p-5 shadow-soft"
                role="dialog"
                aria-modal="true"
              >
                <p className="font-display text-base font-semibold text-brand-ink">Please confirm</p>
                <p className="mt-2 text-sm leading-relaxed text-brand-muted">{confirmMessage}</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="app-btn-secondary-sm">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      submitRef.current?.click();
                    }}
                    className="rounded-lg bg-brand-danger px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-danger focus:outline-none focus:ring-2 focus:ring-brand-danger/50"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
