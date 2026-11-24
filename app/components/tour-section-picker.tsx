import Link from "next/link";
import type { TourSection } from "@/lib/onboarding-tour-steps";

type Props = {
  sections: TourSection[];
  /** Named so the copy can say what a full run covers without counting it out loud twice. */
  fullTourLabel?: string;
};

/**
 * Replay: the whole tour, or any one section of it.
 *
 * Plain links rather than a click handler, so this stays a server component -- navigating to
 * `?tour=1` (one page) or `?tour=all` (a full run) is the entire interaction, and
 * OnboardingTourLauncher in app/dashboard/layout.tsx is already mounted on every page to pick the
 * parameter up. Nothing here needs to know what a tour is.
 *
 * Listing the sections is half the point. Each tour used to fire once, on first arrival at its own
 * page, and the single Replay button went to one hardcoded destination -- so nine of the ten admin
 * tours were unreachable for good, and nothing on screen said they existed.
 */
export function TourSectionPicker({ sections, fullTourLabel = "Replay the whole tour" }: Props) {
  return (
    <div className="mt-3">
      <Link
        href={`${sections[0]?.path ?? "/dashboard"}?tour=all`}
        className="app-btn-primary-sm inline-flex min-h-[44px] items-center"
      >
        {fullTourLabel}
      </Link>
      <p className="mt-2 text-sm text-brand-muted">
        Walks all {sections.length} sections in order, moving to the next page as you finish each one.
        Skipping stops the run.
      </p>

      <p className="mt-4 text-sm font-semibold text-brand-ink">Or replay one section</p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sections.map((section) => (
          <li key={section.path}>
            <Link
              href={`${section.path}?tour=1`}
              className="flex min-h-[44px] items-center justify-center rounded-lg border border-brand-border bg-white px-3 py-2 text-center text-sm font-semibold text-brand-ink shadow-sm"
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
