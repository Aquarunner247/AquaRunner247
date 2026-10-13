/**
 * One definition of "pushed", because four screens and one query ask the question and a disagreement
 * between them would be visible: a stop labelled Pushed on the schedule while still counted as an
 * overdue stop in the bell is exactly the confusion this was meant to end.
 *
 * Pushed = never finished, and the nightly sweep stamped it after its own local day ended
 * (app/api/cron/send-pending-summaries). Nobody is working on it and nobody will on that day.
 *
 * Status is checked as well as the stamp, deliberately. Completing or skipping does not clear the
 * stamp, so a stop someone finishes days later keeps it -- and should read Completed, not Pushed.
 * Asking about status means the real outcome always wins over the history of how it got there.
 *
 * Arrival DOES clear it (app/api/visits/[id]/reschedule's sibling, the arrival route), because
 * picking a swept stop back up means somebody is on it again.
 */
export function isPushedVisit(visit: { status: string; pushedAt: Date | string | null }): boolean {
  if (visit.pushedAt == null) return false;
  // SCHEDULED counts as of 2026-10-13, when the sweep started closing out stops nobody ever
  // started. Without this they carried the stamp but still read "Pending" on the schedule, which
  // is the one thing they are not.
  return visit.status === "IN_PROGRESS" || visit.status === "SCHEDULED";
}
