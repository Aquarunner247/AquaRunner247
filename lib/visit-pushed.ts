/**
 * One definition of "pushed", because four screens and one query ask the question and a disagreement
 * between them would be visible: a stop labelled Pushed on the schedule while still counted as an
 * overdue stop in the bell is exactly the confusion this was meant to end.
 *
 * Pushed = still IN_PROGRESS, and the nightly sweep stamped it after its own local day ended
 * (app/api/cron/send-pending-summaries). Nobody is working on it and nobody will on that day.
 *
 * Status is checked as well as the stamp, deliberately. The stamp is never cleared, so a stop someone
 * finishes days later keeps it -- and should read Completed, not Pushed. Asking about status first
 * means the real outcome always wins over the history of how it got there.
 */
export function isPushedVisit(visit: { status: string; pushedAt: Date | string | null }): boolean {
  return visit.status === "IN_PROGRESS" && visit.pushedAt != null;
}
