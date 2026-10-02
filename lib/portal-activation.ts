import "server-only";
import { prisma } from "@/lib/prisma";
import { sendPortalActivationEmail } from "@/lib/email";

/**
 * Records that a portal login has been used for the first time, and tells the organization.
 *
 * Creating a login emails the customer and then tells the office nothing ever again -- whether they set
 * a password, whether the invitation went to an address nobody reads, whether it is worth a phone call.
 * This closes that loop at the only moment the app can actually observe: the first authenticated request
 * from that login.
 *
 * Claim-then-send, with the stamp written under a `activatedAt: null` guard. Two tabs opening at once
 * would otherwise both see null and both email. updateMany reports how many rows it changed, so the
 * loser of that race sends nothing. The email goes AFTER the stamp commits, deliberately: a failed send
 * must not leave a login unstamped and emailing the office on every page load for the rest of the day.
 * The cost is that an outright Resend outage loses the notice, which is the right way round for
 * something the office merely likes to know.
 *
 * Returns nothing and throws nothing. It is called from a layout render; a notification failing is
 * never a reason to refuse somebody their own portal.
 */
export async function recordPortalActivation(customerUserId: string): Promise<void> {
  try {
    const claimed = await prisma.customerUser.updateMany({
      where: { id: customerUserId, activatedAt: null },
      data: { activatedAt: new Date() },
    });
    if (claimed.count === 0) return; // already activated, or another request got there first

    const customerUser = await prisma.customerUser.findUnique({
      where: { id: customerUserId },
      select: {
        name: true,
        email: true,
        role: true,
        customer: {
          select: {
            id: true,
            name: true,
            organization: {
              select: {
                id: true,
                name: true,
                businessName: true,
                welcomeEmailSupportEmail: true,
                users: { where: { active: true, role: "ADMIN" }, select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (!customerUser) return;

    const org = customerUser.customer.organization;
    // The org's own support address if they set one -- that is where they already read customer mail.
    // Otherwise every active admin, so the notice reaches a person rather than nobody.
    const recipients = org.welcomeEmailSupportEmail
      ? [org.welcomeEmailSupportEmail]
      : org.users.map((u) => u.email).filter((email): email is string => Boolean(email));
    if (recipients.length === 0) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await sendPortalActivationEmail({
      to: recipients,
      organizationName: org.businessName ?? org.name,
      customerName: customerUser.customer.name,
      personName: customerUser.name ?? customerUser.email,
      personEmail: customerUser.email,
      isMaintenanceLogin: customerUser.role === "MAINTENANCE",
      customerUrl: `${appUrl}/dashboard/customers/${customerUser.customer.id}`,
    });
    if (!result.ok) {
      console.error("[portal-activation] notice not sent for", customerUser.email, result.error);
    }
  } catch (error) {
    // Never surfaced to the person signing in. They came here to read their pool readings.
    console.error("[portal-activation] failed for", customerUserId, error);
  }
}
