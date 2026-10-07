/**
 * Renders the daily to-do digest.
 *
 * Pure, with no I/O and no `server-only` import, for the same reason lib/mail/welcome-email.ts is: the
 * markup can then be rendered and looked at without sending anything, and lib/email.ts stays the part
 * that talks to Resend.
 *
 * Table-free and inline-styled like the other emails here, and deliberately outside the Tailwind/.app-*
 * rule in CLAUDE.md, which governs the product's own browser-rendered UI rather than mail clients that
 * require self-contained HTML.
 */

export type TaskDigestGroup = {
  customerName: string;
  customerUrl: string;
  tasks: { title: string; dueLabel: string; overdue: boolean }[];
};

export type TaskDigestInput = {
  organizationName: string;
  groups: TaskDigestGroup[];
  overdueCount: number;
  dashboardUrl: string;
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTaskDigestEmail(input: TaskDigestInput): { subject: string; html: string } {
  const total = input.groups.reduce((n, g) => n + g.tasks.length, 0);
  const plural = total === 1 ? "" : "s";

  // Overdue leads the subject, because that is the part that changes whether this gets opened now or
  // after lunch.
  const subject =
    input.overdueCount > 0
      ? `${total} to-do${plural} today — ${input.overdueCount} overdue`
      : `${total} to-do${plural} today`;

  const groupsHtml = input.groups
    .map(
      (group) => `
        <div style="margin:0 0 18px;">
          <p style="font-size:14px; font-weight:bold; margin:0 0 6px;">
            <a href="${escapeHtml(group.customerUrl)}" style="color:#0A6E7C; text-decoration:none;">${escapeHtml(group.customerName)}</a>
          </p>
          <ul style="margin:0; padding-left:18px;">
            ${group.tasks
              .map(
                (task) =>
                  `<li style="font-size:14px; line-height:20px; margin:0 0 5px; color:#06333B;">${escapeHtml(task.title)} <span style="color:${
                    task.overdue ? "#A32E22" : "#55696C"
                  };">— ${escapeHtml(task.dueLabel)}</span></li>`,
              )
              .join("")}
          </ul>
        </div>`,
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #06333B;">
      <div style="background:#06333B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#F99486; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">To-dos today</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${total} to-do${plural}${
          input.overdueCount > 0 ? `, ${input.overdueCount} overdue` : ""
        }</h1>
      </div>
      <div style="border:1px solid #C4D9DA; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        ${groupsHtml}
        <p style="margin:18px 0 0;">
          <a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block; background:#0A6E7C; color:white; font-size:14px; font-weight:600; padding:10px 18px; border-radius:6px; text-decoration:none;">
            Open the dashboard
          </a>
        </p>
        <p style="font-size:12px; color:#55696C; margin-top:20px; border-top:1px solid #C4D9DA; padding-top:12px;">
          Sent each morning only when something is due. Mark a to-do done on its customer page and it drops
          off this list. An automated notice from AquaRunner 24/7 Pro to ${escapeHtml(input.organizationName)}.
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}
