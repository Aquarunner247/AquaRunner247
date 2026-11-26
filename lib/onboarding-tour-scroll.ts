/**
 * Whether a tour step needs the page scrolled before its callout can mean anything, and where to.
 *
 * Pure, and kept out of app/components/onboarding-tour.tsx, so the rules are testable: the
 * component's half of this is one scrollIntoView call, and everything that can actually be wrong
 * is here.
 *
 * WHY THIS EXISTS: the tour measured its target with getBoundingClientRect and placed the
 * spotlight in viewport coordinates, but never scrolled the page. Any step whose target sat below
 * the fold put the spotlight off-screen entirely and then clamped the bubble to the viewport edge,
 * so the callout described a section the reader could not see and the dimming ring framed nothing.
 * /dashboard/routes is the worst case and the clearest evidence it was never right: its steps are
 * deliberately ordered top-to-bottom down a long page -- see the comment above that tour -- so
 * most of them pointed at something off-screen.
 */

/**
 * Breathing room, in CSS pixels, between the target and the edge of the window.
 *
 * Not zero, because a target flush against the top edge leaves nowhere for a `placement: "top"`
 * bubble to go and no room for the spotlight's own padding, so it reads as cut off rather than
 * framed.
 */
const DEFAULT_MARGIN = 24;

/** Just the vertical extent of the target; the horizontal axis is left alone deliberately. */
export type TourTargetBox = { top: number; bottom: number; height: number };

export type TourScrollDecision =
  | { scroll: false; reason: "already-visible" | "tall-top-visible" }
  /**
   * `block` is passed straight to scrollIntoView. "start" exists only for targets taller than the
   * window -- see below.
   */
  | { scroll: true; block: "start" | "center" };

/**
 * Decide whether to scroll for this step.
 *
 * DOES NOT SCROLL WHEN THE TARGET IS ALREADY IN VIEW, which matters more than it sounds: several
 * tours have consecutive steps pointing at cards in the same section, and centring every one of
 * them would yank the page a little on each Next even though the reader is already looking at the
 * right place. Movement should mean "we have gone somewhere else".
 */
export function tourScrollDecision(args: {
  target: TourTargetBox;
  viewportHeight: number;
  /** Overridable for tests; callers in the app use the default. */
  margin?: number;
}): TourScrollDecision {
  const margin = args.margin ?? DEFAULT_MARGIN;
  const { top, bottom, height } = args.target;
  const usableHeight = args.viewportHeight - margin * 2;

  // A target taller than the window can never satisfy the "fully visible" test below, so that
  // test alone would scroll on every single step inside a long section -- including steps whose
  // target already fills the screen. For these the TOP EDGE is the anchor: it carries the heading
  // the callout names, and the top of the dimming ring is what makes the region legible as one
  // thing.
  if (height >= usableHeight) {
    // Visible, and high enough that the heading is not buried at the bottom of the window.
    if (top >= margin && top <= args.viewportHeight / 2) {
      return { scroll: false, reason: "tall-top-visible" };
    }
    // Never "center" here: centring something taller than the window pushes its heading off the
    // top of the screen, which is precisely the part the step is about.
    return { scroll: true, block: "start" };
  }

  if (top >= margin && bottom <= args.viewportHeight - margin) {
    return { scroll: false, reason: "already-visible" };
  }

  return { scroll: true, block: "center" };
}
