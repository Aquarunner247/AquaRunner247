import { prisma } from "@/lib/prisma";
import { sendCustomerAlertEmail } from "@/lib/email";
import { applyAlertPlaceholders } from "@/lib/alert-placeholders";

export type CustomerAlertOutcome = "sent" | "partial" | "failed" | "no-recipients" | "not-found";

export { ALERT_PLACEHOLDER_HINT } from "@/lib/alert-placeholders";

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
}): Promise<CustomerAlertOutcome> {
  const { customerId, organizationId, createdByUserId } = params;

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

  await prisma.customerAlert.create({
    data: { customerId, subject, message, createdByUserId },
  });

  const recipients =
    customer.customerUsers.length > 0
      ? customer.customerUsers.map((cu) => ({ email: cu.email, name: cu.name ?? customer.name }))
      : customer.properties[0]?.managerEmail
        ? [{ email: customer.properties[0].managerEmail, name: customer.name }]
        : [];

  if (recipients.length === 0) return "no-recipients";

  const replyTo = organization?.welcomeEmailSupportEmail ?? null;
  const results = await Promise.all(
    recipients.map((recipient) => sendCustomerAlertEmail({ to: recipient.email, customerName: recipient.name, subject, message, replyTo })),
  );
  const failureCount = results.filter((r) => !r.ok).length;
  if (failureCount === 0) return "sent";
  if (failureCount === results.length) return "failed";
  return "partial";
}
