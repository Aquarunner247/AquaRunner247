"use client";

import { BACKGROUND_LOCATION_DISCLOSURE } from "@/lib/background-location-disclosure";

/**
 * The prominent disclosure Play requires, shown before the OS permission dialog.
 *
 * Deliberately a blocking panel rather than a toast or a line in a settings screen: Play's
 * Location Permissions policy wants the user to accept it by an affirmative action, in context,
 * before the runtime prompt. A notice they can scroll past does not count, which is why this has
 * no dismiss-by-tapping-outside and no close cross -- the only ways out are the two buttons.
 *
 * Read by a technician on a phone, outdoors, so it follows DESIGN-SYSTEM: solid fills rather
 * than translucency, body text on white, and both buttons at the 44px touch minimum.
 */
export function BackgroundLocationDisclosure({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bg-location-title"
      // Solid scrim, not a blur: this has to stay legible in direct sun.
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/70 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-softLg">
        <h2 id="bg-location-title" className="font-display text-lg font-semibold text-brand-ink">
          {BACKGROUND_LOCATION_DISCLOSURE.title}
        </h2>

        {BACKGROUND_LOCATION_DISCLOSURE.body.map((paragraph) => (
          <p key={paragraph} className="mt-3 text-sm leading-relaxed text-brand-ink">
            {paragraph}
          </p>
        ))}

        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={onAccept} className="app-btn-primary min-h-11 w-full">
            {BACKGROUND_LOCATION_DISCLOSURE.accept}
          </button>
          {/* Declining is a real option, and it has to be: a disclosure somebody cannot refuse
              is not consent. Arrival then needs the manual "I've arrived" button, which is the
              same thing the app falls back to when location is denied at the OS level. */}
          <button type="button" onClick={onDecline} className="app-btn-secondary-sm min-h-11 w-full">
            {BACKGROUND_LOCATION_DISCLOSURE.decline}
          </button>
        </div>
      </div>
    </div>
  );
}
