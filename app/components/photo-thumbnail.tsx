"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ABOVE_MAP_Z_INDEX } from "@/lib/client/overlay-z-index";

type PhotoThumbnailProps = {
  src: string;
  alt: string;
  className?: string;
};

/** A photo thumbnail that pops the full-size image up in an on-page lightbox when clicked. */
export function PhotoThumbnail({ src, alt, className }: PhotoThumbnailProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} />
      </button>

      {open && mounted
        ? createPortal(
            // Portaled to document.body (like camera-capture.tsx/confirm-submit-button.tsx)
            // so an ancestor .app-card's backdrop-blur can't trap this `position: fixed`
            // lightbox inside its own box -- that was making the overlay cover only the
            // Photo Capture card instead of the full viewport, leaving cards below it (e.g.
            // "Complete visit") visibly uncovered and stealing clicks meant to dismiss the
            // photo.
            <div
              className="fixed inset-0 flex items-center justify-center bg-brand-ink/90 p-4"
              style={{ zIndex: ABOVE_MAP_Z_INDEX }}
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              onClick={() => setOpen(false)}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
              >
                ✕
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-soft"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
