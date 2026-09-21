import type { CustomerAlertSendOutcome } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { sendCustomerAlertEmail } from "@/lib/email";
import { applyAlertPlaceholders } from "@/lib/alert-placeholders";

export type CustomerAlertOutcome = "sent" | "partial" | "failed" | "no-recipients" | "not-found";

export { ALERT_PLACEHOLDER_HINT } from "@/lib/alert-placeholders";

/** Maps the outcome this function returns (used in redirect query params, e.g.
 * ?alertSent=no-recipients) onto the DB enum persisted on the CustomerAlert row --
 * two representations of the same four real outcomes ("not-found" never reaches this map,
 * the row is never created in that case). Kept as an explicit table rather than a casing
 * transform so the two can't silently drift if one side's spelling ever changes. */
const OUTCOME_TO_DB: Record<Exclude<CustomerAlertOutcome, "not-found">, CustomerAlertSendOutcome> = {
  sent: "SENT",
  partial: "PARTIAL",
  failed: "FAILED",
  "no-recipients": "NO_RECIPIENTS",
};

/**
 * Core logic shared by the single-customer "Send alert" form
 * (app/dashboard/customers/[id]/actions.ts) and the customers-list bulk send
 * (app/dashboard/customers/actions.ts): creates one CustomerAlert row -- so it shows up in
 * the customer's own history/portal regardless of whether the email itself succeeds -- then
 * emails every active portal login, falling back to the property's manager email when there
 * are none at all. Same per-customer recipient resolution both call sites already relied on
 * independently, now written once so a future change to that resolution can't drift between
 * the single-send and bulk-send paths.
 *
 * Scoping (organization, active relationship) is enforced here via `organizationId` --
 * callers don't need to re-check it themselves.
 */
export async function sendAlertToCustomer(params: {
  customerId: string;
  organizationId: string;
  subject: string;
  message: string;
  createdByUserId: string;
  /** Shared across every row one bulk send creates -- see CustomerAlert.batchId's own doc
   * comment. Omitted (null) for a single-customer send. */
  batchId?: string | null;
}): Promise<CustomerAlertOutcome> {
  const { customerId, organizationId, createdByUserId, batchId = null } = params;

  const [customer, organization] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: customerId, organizationId, relationshipEndedAt: null },
      include: {
        customerUsers: { where: { active: true }, select: { email: true, name: true } },
        properties: { select: { managerEmail: true, managerName: true, name: true }, take: 1 },
      },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { welcomeEmailSupportEmail: true } }),
  ]);
  if (!customer) return "not-found";

  // Falls back to the customer's own account name when a property has no manager name (or
  // no property at all yet) on file, rather than rendering a blank "Hi ," greeting.
  const property = customer.properties[0];
  const placeholderValues = { propertyName: property?.name || customer.name, managerName: property?.managerName || customer.name };
  const subject = applyAlertPlaceholders(params.subject, placeholderValues);
  const message = applyAlertPlaceholders(params.message, placeholderValues);

  const recipients =
    customer.customerUsers.length > 0
      ? customer.customerUsers.map((cu) => ({ email: cu.email, name: cu.name ?? customer.name }))
      : customer.properties[0]?.managerEmail
        ? [{ email: customer.properties[0].managerEmail, name: customer.name }]
        : [];

  // Resolve the actual send outcome BEFORE writing the row, so it's created once with its
  // final state baked in rather than created pending and updated after -- one insert, no
  // window where the row exists with a stale/missing outcome.
  let outcome: CustomerAlertOutcome;
  let failedRecipientCount = 0;
  if (recipients.length === 0) {
    outcome = "no-recipients";
  } else {
    const replyTo = organization?.welcomeEmailSupportEmail ?? null;
    const results = await Promise.all(
      recipients.map((recipient) => sendCustomerAlertEmail({ to: recipient.email, customerName: recipient.name, subject, message, replyTo })),
    );
    failedRecipientCount = results.filter((r) => !r.ok).length;
    outcome = failedRecipientCount === 0 ? "sent" : failedRecipientCount === results.length ? "failed" : "partial";
  }

  await prisma.customerAlert.create({
    data: {
      customerId,
      subject,
      message,
      createdByUserId,
      sendOutcome: OUTCOME_TO_DB[outcome],
      recipientCount: recipients.length,
      failedRecipientCount,
      batchId,
    },
  });

  return outcome;
}
