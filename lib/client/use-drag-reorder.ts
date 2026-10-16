"use client";

import { useRef, useState } from "react";

/**
 * Pointer Events-based list reordering -- deliberately NOT the native HTML5 `draggable`
 * attribute, which only ever fires from a real OS-level drag gesture (mouse on desktop) and
 * has no touch equivalent in any mobile browser. Pointer Events unify mouse/touch/pen under
 * one API, so the exact same hook drives reordering whether it's a desktop admin dragging
 * with a mouse or a technician dragging with a finger.
 *
 * `onReorder` is a PREVIEW: it fires on every pointer move that crosses a row, and should only
 * move local state. `onCommit` fires once, when the finger lifts, with the order that was landed
 * on -- that is where a save belongs.
 *
 * They were one callback until 2026-10-16, which meant a save per crossed row: dragging a stop
 * from the bottom of a 15-stop day to the top fired fourteen PATCHes mid-drag. On an iPhone over
 * cellular some of those were aborted as the next one superseded them, surfacing as an unhandled
 * "TypeError: Load failed" (Sentry JAVASCRIPT-NEXTJS-E, Mobile Safari 26.6.1), and the ones that
 * did land raced -- the last write to arrive was not necessarily the order the finger ended on.
 *
 * Usage: put `dragHandleProps(index)` on a small grip element (never on a row that also
 * contains a link/button -- a native <a> under `draggable` conflicts with drag-start on
 * mouse, and a grip keeps drag and tap/click targets from overlapping either way), and
 * `setItemRef(index)` (a ref callback) on each row's outer element so this hook can measure
 * row positions while dragging.
 */
export function useDragReorder<T>(
  items: T[],
  onReorder: (next: T[]) => void,
  disabled?: boolean,
  onCommit?: (next: T[]) => void,
) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const fromIndexRef = useRef<number | null>(null);
  const orderRef = useRef(items);
  orderRef.current = items;
  /** Whether this drag actually moved anything, so letting go without moving saves nothing. */
  const movedRef = useRef(false);

  function setItemRef(index: number) {
    return (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    };
  }

  function endDrag() {
    const moved = movedRef.current;
    fromIndexRef.current = null;
    movedRef.current = false;
    setDraggingIndex(null);
    // orderRef tracks the items prop, which the preview has been updating throughout the drag,
    // so by the time the finger lifts it already holds the final order.
    if (moved) onCommit?.(orderRef.current);
  }

  function dragHandleProps(index: number) {
    return {
      // Inline style, not a Tailwind class -- this hook lives under lib/, which isn't in
      // tailwind.config.ts's `content` glob (app/, components/, pages/ only), so a
      // "touch-none" className string here would never actually get compiled into the
      // stylesheet. Without touch-action: none, a touch drag on the handle gets swallowed
      // by the page's normal scroll instead of reaching onPointerMove below.
      style: { touchAction: "none" as const },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        fromIndexRef.current = index;
        movedRef.current = false;
        setDraggingIndex(index);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (fromIndexRef.current == null) return;
        const y = e.clientY;
        let overIndex: number | null = null;
        for (let i = 0; i < itemRefs.current.length; i++) {
          const el = itemRefs.current[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (y >= rect.top && y <= rect.bottom) {
            overIndex = i;
            break;
          }
        }
        const from = fromIndexRef.current;
        if (overIndex != null && overIndex !== from) {
          const next = [...orderRef.current];
          const [moved] = next.splice(from, 1);
          next.splice(overIndex, 0, moved);
          fromIndexRef.current = overIndex;
          movedRef.current = true;
          setDraggingIndex(overIndex);
          onReorder(next);
        }
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    };
  }

  return { draggingIndex, setItemRef, dragHandleProps };
}
