"use client";

import { useRef, useState } from "react";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmMessage: string;
  className?: string;
};

export function ConfirmSubmitButton({ label, confirmMessage, className }: ConfirmSubmitButtonProps) {
  const [open, setOpen] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <button ref={submitRef} type="submit" className="hidden" aria-hidden="true" tabIndex={-1}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/50 px-4 backdrop-blur-[2px]">
          <div
            className="w-full max-w-sm rounded-2xl border border-brand-border/90 bg-white p-5 shadow-soft"
            role="dialog"
            aria-modal="true"
          >
            <p className="font-display text-base font-semibold text-brand-ink">Please confirm</p>
            <p className="mt-2 text-sm leading-relaxed text-brand-muted">{confirmMessage}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="app-btn-secondary-sm"
              >
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
        </div>
      ) : null}
    </>
  );
}
