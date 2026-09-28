"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  /** Spoken label for the trigger, e.g. "Actions for Rodrigo Acevedo" — "⋯" alone says nothing. */
  label: string;
  children: React.ReactNode;
};

/**
 * Overflow ("⋯") menu for a list row. Collapses a row's secondary actions so the row reads
 * as the person it describes rather than a strip of buttons.
 *
 * Children are rendered by the server component that uses this, so they can be <Link>s and
 * <form action={serverAction}> elements — this only owns open/closed state.
 *
 * The outside-click handler deliberately ignores anything inside a [role="dialog"].
 * ConfirmSubmitButton portals its confirmation dialog to document.body, so clicking
 * "Confirm" lands outside this component's DOM subtree: closing on that click would unmount
 * the menu, and with it the <form> whose submit button the dialog is about to click, so
 * Delete would silently do nothing.
 */
export function RowActionsMenu({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      // See the note above: a portaled confirmation dialog is "outside" but must not close us.
      if (target instanceof Element && target.closest('[role="dialog"]')) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand-border bg-white text-lg leading-none text-brand-ink transition hover:bg-brand-foam focus:outline-none focus:ring-2 focus:ring-brand-primary/35"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="app-menu"
          onClick={(event) => {
            // Close ONLY for a link. A link navigates, so the menu would otherwise linger
            // open over the re-rendered row.
            //
            // Everything else is deliberately left open. Closing on any click here is what
            // broke Delete: ConfirmSubmitButton's first click merely opens a portaled
            // confirmation dialog, so setting open=false unmounted this panel -- and with it
            // the <form> and the ConfirmSubmitButton holding the dialog's state -- before
            // anything could be submitted. The button appeared to do nothing at all.
            //
            // An allowlist rather than a denylist on purpose: if it misjudges an element, a
            // menu stays open (cosmetic) instead of an action silently failing (functional).
            const target = event.target as Element | null;
            if (target?.closest("a[href]")) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
