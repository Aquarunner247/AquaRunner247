/**
 * The service messages every new organization starts with. A technician must pick one before
 * completing a visit, and the chosen text goes into the customer's service-summary email.
 *
 * `{{orgName}}` is interpolated at send time rather than baked in at seed time, so an
 * organization that renames itself doesn't keep sending its old name -- and so these constants
 * stay org-agnostic.
 *
 * Every message states what WAS done. A weather note that only explains what was skipped reads to
 * a customer as "nobody serviced my pool", which is the opposite of the intent.
 *
 * Admins can edit, reorder, deactivate and add to these per organization
 * (/dashboard/settings/service-messages) -- these are only the starting set.
 */
export const DEFAULT_SERVICE_MESSAGES: { label: string; body: string }[] = [
  {
    label: "Standard — service completed",
    body:
      "Thank you for your continued trust in {{orgName}} to keep your pools clean and safe. " +
      "Your service for the day has been completed.",
  },
  {
    label: "High wind — limited skimming",
    body:
      "Service completed. Winds were high today, so skimming was limited — debris was blowing back " +
      "in as fast as it came out. Chemicals were balanced and equipment checked as normal.",
  },
  {
    label: "Unsafe weather — no pole in the water",
    body:
      "Service completed where it was safe to do so. Storms made it unsafe to put a pole in the " +
      "water, so skimming and brushing were skipped. Chemicals were balanced and all equipment checked.",
  },
];

/** Replaces the placeholders a service message may contain. Unknown placeholders are left as-is
 * rather than blanked, so a typo is visible to whoever wrote it instead of silently vanishing. */
export function applyServiceMessagePlaceholders(body: string, values: { orgName: string }): string {
  return body.replace(/\{\{orgName\}\}/g, values.orgName);
}
