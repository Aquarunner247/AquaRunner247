/**
 * The service messages every new organization starts with. A technician must pick one before
 * completing a visit, and the chosen text goes into the customer's service-summary email.
 *
 * `{{orgName}}` is interpolated at send time rather than baked in at seed time, so an
 * organization that renames itself doesn't keep sending its old name -- and so these constants
 * stay org-agnostic.
 *
 * Every message points the customer at the visit's checklist, which the summary email renders
 * directly beneath it -- so a weather note explains what was limited without reading as "nobody
 * serviced my pool", because the list of what WAS done is right there.
 *
 * Admins can edit, reorder, deactivate and add to these per organization
 * (/dashboard/settings/service-messages) -- these are only the starting set.
 */
export const DEFAULT_SERVICE_MESSAGES: { label: string; body: string }[] = [
  {
    label: "Standard - Service call completed",
    body:
      "Thank you for your continued trust in {{orgName}} to keep your pools clean, safe and compliant. " +
      "Service call completed. Please see the checklist below for services performed.",
  },
  {
    label: "High Wind - Limited services performed",
    body:
      "Service call completed. Due to extremely high winds some services may not have been completed. " +
      "See checklist below for details on what was performed.",
  },
  {
    label: "Unsafe Weather - Limited services performed",
    body:
      "Service call completed. Due to lightning overhead it was unsafe to put a pole in the water, so " +
      "skimming and netting will be done next service call. Please see checklist below for services performed.",
  },
];

/** Replaces the placeholders a service message may contain. Unknown placeholders are left as-is
 * rather than blanked, so a typo is visible to whoever wrote it instead of silently vanishing. */
export function applyServiceMessagePlaceholders(body: string, values: { orgName: string }): string {
  return body.replace(/\{\{orgName\}\}/g, values.orgName);
}
