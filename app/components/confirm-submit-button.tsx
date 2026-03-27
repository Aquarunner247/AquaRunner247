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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <p className="text-sm font-medium text-slate-900">Please confirm</p>
            <p className="mt-2 text-sm text-slate-700">{confirmMessage}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  submitRef.current?.click();
                }}
                className="rounded bg-rose-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-800"
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
