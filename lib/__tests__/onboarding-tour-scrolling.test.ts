// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { OnboardingTour, type TourStep } from "@/app/components/onboarding-tour";

/**
 * That the tour actually scrolls, as opposed to merely owning a function that decides whether it
 * should. onboarding-tour-scroll.test.ts covers the rules; this covers the wiring, which is where
 * the original bug lived -- the rules were never wrong, they simply did not exist and nothing
 * called anything.
 *
 * jsdom lays nothing out, so every target's geometry is stubbed per element. That is honest here:
 * the component only ever learns a position by calling getBoundingClientRect, so stubbing it
 * stubs the browser's answer rather than the thing under test.
 *
 * createElement rather than JSX because vitest.config.ts configures no JSX transform -- this is
 * the repo's first component test, and a test is not a reason to change how 98 other files are
 * compiled.
 */

const VIEWPORT_HEIGHT = 800;

function rectAt(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 200,
    width: 200,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function placeTarget(name: string, top: number, height: number) {
  const el = document.createElement("div");
  el.setAttribute("data-tour", name);
  el.getBoundingClientRect = () => rectAt(top, height);
  document.body.appendChild(el);
  return el;
}

const STEPS: TourStep[] = [
  { target: "onscreen", title: "Already here", body: "No need to move." },
  { target: "far-below", title: "Down the page", body: "This one is off-screen." },
];

const ONLY_OFFSCREEN: TourStep[] = [
  { target: "far-below", title: "Down the page", body: "Off-screen from the start." },
];

/** Typed so assigning the mock onto the prototype type-checks against the real signature. */
type ScrollIntoViewFn = (arg?: boolean | ScrollIntoViewOptions) => void;

let scrollIntoView: Mock<ScrollIntoViewFn>;

beforeEach(() => {
  window.innerHeight = VIEWPORT_HEIGHT;
  scrollIntoView = vi.fn<ScrollIntoViewFn>();
  Element.prototype.scrollIntoView = scrollIntoView;
  // jsdom has no matchMedia, and the component asks it about prefers-reduced-motion.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function renderTour(steps: TourStep[] = STEPS) {
  const onFinish = vi.fn();
  const markSeenAction = vi.fn().mockResolvedValue(undefined);
  render(createElement(OnboardingTour, { steps, onFinish, markSeenAction }));
  return { onFinish, markSeenAction };
}

describe("the tour scrolls to the section its callout is about", () => {
  it("leaves the page where it is when the first target is already visible", async () => {
    placeTarget("onscreen", 100, 200);
    placeTarget("far-below", 2000, 200);
    renderTour();

    await waitFor(() => expect(screen.getByText("Already here")).toBeTruthy());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to the next target when it is below the fold", async () => {
    placeTarget("onscreen", 100, 200);
    const below = placeTarget("far-below", 2000, 200);
    renderTour();

    await waitFor(() => expect(screen.getByText("Already here")).toBeTruthy());
    screen.getByRole("button", { name: "Next" }).click();

    await waitFor(() => expect(screen.getByText("Down the page")).toBeTruthy());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(below);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center", inline: "nearest" });
  });

  it("scrolls on the very first step when that step starts off-screen", async () => {
    const below = placeTarget("far-below", 1800, 200);
    renderTour(ONLY_OFFSCREEN);

    await waitFor(() => expect(screen.getByText("Down the page")).toBeTruthy());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(below);
  });

  it("aligns a section taller than the window to its start rather than its middle", async () => {
    placeTarget("onscreen", 100, 200);
    placeTarget("far-below", 1200, 1500);
    renderTour();

    await waitFor(() => expect(screen.getByText("Already here")).toBeTruthy());
    screen.getByRole("button", { name: "Next" }).click();

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start", inline: "nearest" });
  });

  it("jumps instead of animating when the reader asked for reduced motion", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    placeTarget("far-below", 1800, 200);
    renderTour(ONLY_OFFSCREEN);

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center", inline: "nearest" });
  });

  /**
   * Going Back is a navigation too. The original bug was symmetrical: walking backwards up a long
   * page left the spotlight off the top of the screen just as readily.
   */
  it("scrolls back up when the reader presses Back", async () => {
    const first = placeTarget("onscreen", 100, 200);
    placeTarget("far-below", 2000, 200);
    renderTour();

    await waitFor(() => expect(screen.getByText("Already here")).toBeTruthy());
    screen.getByRole("button", { name: "Next" }).click();
    await waitFor(() => expect(screen.getByText("Down the page")).toBeTruthy());

    // The reader is now at the bottom of the page, so step one sits above the viewport.
    first.getBoundingClientRect = () => rectAt(-1900, 200);
    scrollIntoView.mockClear();
    screen.getByRole("button", { name: "Back" }).click();

    await waitFor(() => expect(screen.getByText("Already here")).toBeTruthy());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(first);
  });
});
