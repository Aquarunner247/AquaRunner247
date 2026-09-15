/**
 * Shared by the single-customer alert history (app/dashboard/customers/[id]/page.tsx) and
 * the org-wide aggregate view (app/dashboard/customers/alerts/page.tsx) -- same CustomerAlert
 * fields, same four real outcomes, one place to keep them looking identical.
 *
 * Null (an alert sent before CustomerAlert.sendOutcome existed) intentionally renders
 * nothing -- "status unknown" is more honest than guessing a badge for a row that predates
 * tracking.
 */
export function AlertOutcomeBadge(a: { sendOutcome: string | null; recipientCount: number | null; failedRecipientCount: number | null }) {
  if (!a.sendOutcome) return null;
  const delivered = (a.recipientCount ?? 0) - (a.failedRecipientCount ?? 0);
  if (a.sendOutcome === "SENT") {
    return <span className="app-pill-good">Delivered to {a.recipientCount ?? delivered}</span>;
  }
  if (a.sendOutcome === "PARTIAL") {
    return (
      <span className="app-pill-attention">
        Delivered to {delivered} of {a.recipientCount}
      </span>
    );
  }
  if (a.sendOutcome === "FAILED") {
    return <span className="app-pill-danger">Failed to send</span>;
  }
  return <span className="app-pill-inactive">No email on file</span>;
}
