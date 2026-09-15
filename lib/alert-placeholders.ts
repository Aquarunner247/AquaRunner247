/**
 * Pure mail-merge substitution for customer alerts, kept Prisma-free (like
 * lib/route-ordering.ts, lib/plan-tiers-core.ts) so it's unit-testable without a live
 * database -- lib/customer-alerts.ts does the actual per-customer data lookup and calls
 * this with the resolved values.
 */

/** Recognized tokens, shown in the UI hint (see the "Send alert" and bulk-send forms) so
 * the hint text and the substitution logic below can't drift apart. */
export const ALERT_PLACEHOLDER_HINT = "{{property}} and {{manager}}";

/**
 * {{property}} and {{manager}} get replaced with one customer's own property name and
 * on-file manager-contact name -- lets one message written once ("Hi {{manager}}, a
 * reminder about {{property}}...") read naturally across every customer in a bulk send,
 * instead of the admin writing N near-identical messages by hand. Case-insensitive,
 * tolerates stray spaces inside the braces ("{{ manager }}"); anything else in the
 * template is left exactly as typed -- unrecognized "{{...}}" text is never silently
 * stripped, only these two tokens are touched.
 */
export function applyAlertPlaceholders(template: string, values: { propertyName: string; managerName: string }): string {
  return template.replace(/\{\{\s*property\s*\}\}/gi, values.propertyName).replace(/\{\{\s*manager\s*\}\}/gi, values.managerName);
}
