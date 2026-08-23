import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { updateTicketStatus } from "../settings/phone-agent/actions";
import { timeZoneForState, formatLocalDateTime } from "@/lib/timezone";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-brand-warnFill text-brand-warn",
  REVIEWED: "bg-brand-foam text-brand-muted",
  RESOLVED: "bg-brand-okFill text-brand-ok",
};

const ROUTED_LABEL: Record<string, string> = {
  AFTER_HOURS: "After-hours",
  BUSY_OVERFLOW: "Overflow (busy)",
};

const CALL_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  ABANDONED: "Abandoned",
};

export default async function PhoneAgentTicketsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN" && appUser.role !== "OFFICE") redirect("/dashboard");

  const [calls, org] = await Promise.all([
    prisma.phoneAgentCall.findMany({
      where: { organizationId: appUser.organizationId },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { state: true } }),
  ]);
  const tz = timeZoneForState(org?.state);
  const fmtDateTime = (d: Date) => formatLocalDateTime(d, tz);

  const hasSettings = await prisma.orgPhoneAgentSettings.findUnique({
    where: { organizationId: appUser.organizationId },
    select: { id: true, twilioPhoneNumber: true, primaryPhoneNumber: true },
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Phone Agent tickets</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Calls that fell through to the interactive voicemail agent — after-hours or a busy primary line.{" "}
          {appUser.role === "ADMIN" ? (
            <Link href="/dashboard/settings/phone-agent" className="app-link">
              Manage settings
            </Link>
          ) : null}
        </p>
        {!hasSettings?.twilioPhoneNumber || !hasSettings?.primaryPhoneNumber ? (
          <p data-tour="phone-agent-setup" className="mt-3 rounded border border-brand-warn/30 bg-brand-warnFill px-3 py-2 text-sm text-brand-warn">
            Setup isn&rsquo;t finished yet — {!hasSettings?.twilioPhoneNumber ? "no Twilio number" : "no primary business number"} configured.{" "}
            {appUser.role === "ADMIN" ? (
              <Link href="/dashboard/settings/phone-agent" className="underline">
                Finish setup
              </Link>
            ) : (
              "Ask an admin to finish setup."
            )}
          </p>
        ) : null}
      </header>

      <section data-tour="phone-agent-calls" className="mt-6 space-y-3">
        {calls.length === 0 ? (
          <p className="app-card text-sm text-brand-muted">No calls yet.</p>
        ) : (
          calls.map((call) => (
            <div key={call.id} className="app-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-brand-ink">
                    {call.callerName ?? call.callerNumber}
                    {call.callerName ? <span className="app-metric ml-2 text-xs text-brand-muted">{call.callerNumber}</span> : null}
                  </p>
                  <p className="app-metric mt-0.5 text-xs text-brand-muted">
                    {fmtDateTime(call.startedAt)} · {ROUTED_LABEL[call.routedAs]} · {CALL_STATUS_LABEL[call.callStatus]}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[call.ticketStatus] ?? ""}`}>
                  {call.ticketStatus}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-muted">
                {call.issueType ? <span>Issue: {call.issueType}</span> : null}
                {call.urgency ? <span>Urgency: {call.urgency}</span> : null}
                {call.propertyAddress ? <span>Address: {call.propertyAddress}</span> : null}
                {call.callerCallbackNumber ? <span>Callback: {call.callerCallbackNumber}</span> : null}
                {call.requestedCallbackTime ? <span>Requested: {call.requestedCallbackTime}</span> : null}
              </div>

              {call.aiSummary ? <p className="mt-2 text-sm text-brand-ink">{call.aiSummary}</p> : null}
              {!call.aiSummary && call.callStatus === "COMPLETED" ? (
                <p className="mt-2 text-sm text-brand-muted">Transcription unavailable — listen to the recording.</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {call.recordingUrl ? (
                  <a href={call.recordingUrl} target="_blank" rel="noreferrer" className="app-link text-sm">
                    Listen to recording
                  </a>
                ) : null}
                {appUser.role === "ADMIN" ? (
                  <form action={updateTicketStatus} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={call.id} />
                    <select name="status" defaultValue={call.ticketStatus} className="app-field w-auto text-xs">
                      <option value="NEW">New</option>
                      <option value="REVIEWED">Reviewed</option>
                      <option value="RESOLVED">Resolved</option>
                    </select>
                    <button type="submit" className="app-btn-secondary-sm">
                      Update
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
