import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findDueTasks } from "@/lib/customer-tasks";
import { taskDueState } from "@/lib/customer-task-due";
import { sendTaskDigestEmail } from "@/lib/email";
import { timeZoneForState, formatLocalDate } from "@/lib/timezone";

export const runtime = "nodejs";

/**
 * Emails each organization its outstanding to-dos, once a morning.
 *
 * The notification bell only exists while somebody has the dashboard open, and "send over a bid to the
 * manager ASAP" is exactly the sort of thing written down by someone who is about to get busy with
 * something else. This is the same list, pushed instead of waiting to be found -- the same list
 * literally, via findDueTasks, so the two can never disagree about what is due.
 *
 * Nothing due means no email. A digest that arrives every morning saying "nothing today" is one people
 * stop opening, and then the morning it matters it goes unread with the rest.
 *
 * Sent per organization, in each one's own timezone, because "today" is not the same day everywhere and
 * this is the kind of product where the second customer arrives without warning.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const organizations = await prisma.organization.findMany({
    // A cancelled org is not getting mail about its to-dos.
    where: { planStatus: { not: "CANCELED" } },
    select: {
      id: true,
      name: true,
      businessName: true,
      state: true,
      welcomeEmailSupportEmail: true,
      users: { where: { active: true, role: "ADMIN" }, select: { email: true } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};
  const note = (reason: string) => {
    skipped++;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };

  // Sequential, like the summary sweep: lib/prisma.ts caps the pool deliberately and each send also
  // makes an external Resend call, so fanning this out would only serialize on the pool anyway.
  for (const org of organizations) {
    const timeZone = timeZoneForState(org.state);
    const tasks = await findDueTasks(org.id, now, timeZone);
    if (tasks.length === 0) {
      note("nothing-due");
      continue;
    }

    // The org's support address if it has one -- that is where they already read mail about customers --
    // otherwise every active admin, so the digest reaches a person rather than nobody.
    const recipients = org.welcomeEmailSupportEmail
      ? [org.welcomeEmailSupportEmail]
      : org.users.map((u) => u.email).filter((email): email is string => Boolean(email));
    if (recipients.length === 0) {
      note("no-recipient");
      continue;
    }

    // Grouped by customer, keeping the order findDueTasks returned, so the soonest deadline leads.
    const byCustomer = new Map<string, { customerName: string; customerUrl: string; tasks: { title: string; dueLabel: string; overdue: boolean }[] }>();
    let overdueCount = 0;
    for (const task of tasks) {
      const state = taskDueState(task.dueOn, now, timeZone);
      if (state === "overdue") overdueCount++;
      const dueLabel =
        state === "overdue"
          ? `was due ${formatLocalDate(task.dueOn, "UTC", { month: "short", day: "numeric" })}`
          : state === "today"
            ? "due today"
            : state === "upcoming"
              ? `due ${formatLocalDate(task.dueOn, "UTC", { month: "short", day: "numeric" })}`
              : "no date set";
      const group = byCustomer.get(task.customerId) ?? {
        customerName: task.customerName,
        customerUrl: `${appUrl}/dashboard/customers/${task.customerId}`,
        tasks: [],
      };
      group.tasks.push({ title: task.title, dueLabel, overdue: state === "overdue" });
      byCustomer.set(task.customerId, group);
    }

    const result = await sendTaskDigestEmail({
      to: recipients,
      organizationName: org.businessName ?? org.name,
      groups: [...byCustomer.values()],
      overdueCount,
      dashboardUrl: `${appUrl}/dashboard`,
    });
    if (result.ok) {
      sent++;
    } else {
      failed++;
      console.error("[cron send-task-digest] org", org.id, result.error);
    }
  }

  return NextResponse.json({ ok: true, organizations: organizations.length, sent, skipped, failed, reasons });
}
