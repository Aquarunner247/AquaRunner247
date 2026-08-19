"use client";

import { useRef, useState } from "react";

/**
 * Pointer Events-based list reordering -- deliberately NOT the native HTML5 `draggable`
 * attribute, which only ever fires from a real OS-level drag gesture (mouse on desktop) and
 * has no touch equivalent in any mobile browser. Pointer Events unify mouse/touch/pen under
 * one API, so the exact same hook drives reordering whether it's a desktop admin dragging
 * with a mouse or a technician dragging with a finger.
 *
 * Usage: put `dragHandleProps(index)` on a small grip element (never on a row that also
 * contains a link/button -- a native <a> under `draggable` conflicts with drag-start on
 * mouse, and a grip keeps drag and tap/click targets from overlapping either way), and
 * `setItemRef(index)` (a ref callback) on each row's outer element so this hook can measure
 * row positions while dragging.
 */
export function useDragReorder<T>(items: T[], onReorder: (next: T[]) => void, disabled?: boolean) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const fromIndexRef = useRef<number | null>(null);
  const orderRef = useRef(items);
  orderRef.current = items;

  function setItemRef(index: number) {
    return (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    };
  }

  function endDrag() {
    fromIndexRef.current = null;
    setDraggingIndex(null);
  }

  function dragHandleProps(index: number) {
    return {
      className: "touch-none",
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        fromIndexRef.current = index;
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
