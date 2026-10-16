// @vitest-environment jsdom
//
// Only this file needs a DOM. The other suites stay on vitest's `node` environment, which is
// faster and is what vitest.config.ts sets globally -- this docblock overrides it per file
// rather than slowing every test down for one hook.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragReorder } from "@/lib/client/use-drag-reorder";

/**
 * The contract that broke in production: a drag PREVIEWS as the finger moves and SAVES once, on
 * release. Both were one callback until 2026-10-16, so a fourteen-row drag fired fourteen saves
 * mid-drag -- Sentry JAVASCRIPT-NEXTJS-E, "TypeError: Load failed" on Mobile Safari, plus the
 * races between those writes deciding which order actually stuck.
 */

/** Rows 40px tall stacked from y=0, so y=50 is row 1, y=90 is row 2, and so on. */
function stackedRows(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => ({ top: i * 40, bottom: i * 40 + 40 }) as DOMRect;
    return el;
  });
}

const pointer = (clientY: number) =>
  ({
    clientY,
    pointerId: 1,
    preventDefault: () => {},
    currentTarget: { setPointerCapture: () => {} },
  }) as never;

function setup(items: string[], disabled = false) {
  const onReorder = vi.fn();
  const onCommit = vi.fn();
  const view = renderHook(
    ({ list }: { list: string[] }) => useDragReorder(list, onReorder, disabled, onCommit),
    { initialProps: { list: items } },
  );
  const rows = stackedRows(items.length);
  act(() => {
    rows.forEach((el, i) => view.result.current.setItemRef(i)(el));
  });

  /** Moves the finger, then feeds the preview back in the way a real consumer's setState does. */
  function drag(handleIndex: number, y: number) {
    act(() => view.result.current.dragHandleProps(handleIndex).onPointerMove(pointer(y)));
    const latest = onReorder.mock.calls.at(-1)?.[0];
    if (latest) view.rerender({ list: latest });
  }

  return { view, onReorder, onCommit, drag };
}

describe("useDragReorder", () => {
  it("previews each crossed row and saves nothing until release", () => {
    const { view, onReorder, onCommit, drag } = setup(["a", "b", "c", "d"]);

    act(() => view.result.current.dragHandleProps(0).onPointerDown(pointer(10)));
    drag(0, 50);
    drag(1, 90);

    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("saves once, with the order the drag landed on", () => {
    const { view, onReorder, onCommit, drag } = setup(["a", "b", "c", "d"]);

    act(() => view.result.current.dragHandleProps(0).onPointerDown(pointer(10)));
    drag(0, 50);
    drag(1, 90);
    const landed = onReorder.mock.calls.at(-1)![0];
    act(() => view.result.current.dragHandleProps(2).onPointerUp());

    expect(landed).toEqual(["b", "c", "a", "d"]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(landed);
  });

  /** A tap on the grip is not a reorder and must not write the day's order back. */
  it("saves nothing when the drag moved nothing", () => {
    const { view, onReorder, onCommit } = setup(["a", "b", "c"]);
    act(() => view.result.current.dragHandleProps(0).onPointerDown(pointer(10)));
    act(() => view.result.current.dragHandleProps(0).onPointerUp());
    expect(onReorder).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  /** A drag interrupted by an incoming call still ended somewhere, and that is worth saving. */
  it("saves on pointer cancel as well as pointer up", () => {
    const { view, onCommit, drag } = setup(["a", "b", "c"]);
    act(() => view.result.current.dragHandleProps(0).onPointerDown(pointer(10)));
    drag(0, 50);
    act(() => view.result.current.dragHandleProps(1).onPointerCancel());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("does not save twice if release fires again", () => {
    const { view, onCommit, drag } = setup(["a", "b", "c"]);
    act(() => view.result.current.dragHandleProps(0).onPointerDown(pointer(10)));
    drag(0, 50);
    act(() => view.result.current.dragHandleProps(1).onPointerUp());
    act(() => view.result.current.dragHandleProps(1).onPointerUp());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  describe("dragging a bundle as one run", () => {
    /** A property's pool and spa are one walk-up, so the card's grip moves both. */
    it("moves the whole run down together", () => {
      const { view, onReorder, onCommit, drag } = setup(["p1", "p2", "b", "c"]);
      // Grip on the run starting at 0, two rows long.
      act(() => view.result.current.dragHandleProps(0, 2).onPointerDown(pointer(10)));
      drag(0, 130); // over row 3 ("c")
      act(() => view.result.current.dragHandleProps(2, 2).onPointerUp());
      expect(onReorder.mock.calls.at(-1)![0]).toEqual(["b", "c", "p1", "p2"]);
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it("moves the whole run up together", () => {
      const { view, onReorder, drag } = setup(["a", "b", "p1", "p2"]);
      act(() => view.result.current.dragHandleProps(2, 2).onPointerDown(pointer(90)));
      drag(2, 10); // over row 0
      expect(onReorder.mock.calls.at(-1)![0]).toEqual(["p1", "p2", "a", "b"]);
    });

    /** Without this the run thrashes as the finger crosses its own second row. */
    it("ignores a hover inside the run being dragged", () => {
      const { view, onReorder } = setup(["p1", "p2", "b"]);
      act(() => view.result.current.dragHandleProps(0, 2).onPointerDown(pointer(10)));
      act(() => view.result.current.dragHandleProps(0, 2).onPointerMove(pointer(50))); // row 1, inside the run
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("keeps the run's members adjacent and in their own order", () => {
      const { view, onReorder, drag } = setup(["a", "p1", "p2", "b", "c"]);
      act(() => view.result.current.dragHandleProps(1, 2).onPointerDown(pointer(50)));
      drag(1, 170); // over row 4
      const out = onReorder.mock.calls.at(-1)![0];
      expect(out.indexOf("p2")).toBe(out.indexOf("p1") + 1);
      expect(out).toEqual(["a", "b", "c", "p1", "p2"]);
    });

    it("still drags a single row when no run size is given", () => {
      const { view, onReorder, drag } = setup(["p1", "p2", "b"]);
      act(() => view.result.current.dragHandleProps(0).onPointerDown(pointer(10)));
      drag(0, 50);
      expect(onReorder.mock.calls.at(-1)![0]).toEqual(["p2", "p1", "b"]);
    });
  });

  it("ignores a drag entirely when disabled", () => {
    const { view, onReorder, onCommit } = setup(["a", "b"], true);
    act(() => view.result.current.dragHandleProps(0).onPointerDown(pointer(10)));
    act(() => view.result.current.dragHandleProps(0).onPointerMove(pointer(50)));
    act(() => view.result.current.dragHandleProps(0).onPointerUp());
    expect(onReorder).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  /** The reported shape: a long drag up a full day fires one save, not one per row. */
  it("saves once for a fourteen-row drag, not fourteen times", () => {
    const items = Array.from({ length: 15 }, (_, i) => `stop${i}`);
    const { view, onReorder, onCommit, drag } = setup(items);

    act(() => view.result.current.dragHandleProps(14).onPointerDown(pointer(14 * 40 + 10)));
    for (let row = 13; row >= 0; row--) drag(row + 1, row * 40 + 10);
    act(() => view.result.current.dragHandleProps(0).onPointerUp());

    expect(onReorder).toHaveBeenCalledTimes(14);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0][0]).toBe("stop14");
  });
});
