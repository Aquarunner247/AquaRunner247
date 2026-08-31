const SETMORE_BOOKING_URL = "https://breanna26mn.setmore.com";

/** Shared by app/dashboard/help/page.tsx and app/cpo/(app)/help/page.tsx -- one source
 * of truth for the booking link and contact email so updating either only means editing
 * this file once, not hunting down every product surface that links to it. */
export function OnboardingHelpContent() {
  return (
    <>
      <div className="app-card-muted">
        <h2 className="text-base font-semibold text-brand-ink">Free onboarding call</h2>
        <p className="app-subhead">
          If anything about the app is unclear, book a free 20-minute call and we&rsquo;ll walk through it with you
          live -- screen share, your data, your questions.
        </p>
        <a href={SETMORE_BOOKING_URL} target="_blank" rel="noreferrer" className="app-btn-accent-sm mt-3">
          Book a free onboarding call
        </a>
      </div>

      <p className="mt-4 text-sm text-brand-muted">
        Prefer email?{" "}
        <a href="mailto:hello@aquarunner247.com" className="app-link">
          hello@aquarunner247.com
        </a>
      </p>
    </>
  );
}
