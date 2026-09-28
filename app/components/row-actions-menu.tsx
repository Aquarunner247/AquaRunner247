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
        // onClick closes after an item is activated. A <Link> navigates and a <form> submits
        // first, so this only affects the menu that's about to be replaced anyway -- but it
        // stops a stale open menu lingering over the re-rendered row.
        <div id={menuId} role="menu" className="app-menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
