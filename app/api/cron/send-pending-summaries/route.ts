import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBundledServiceSummary } from "@/lib/service-summary-email";
import { timeZoneForState, localDayBounds, ymdInTimeZone } from "@/lib/timezone";

export const runtime = "nodejs";

/**
 * Sends any customer service summary that is still waiting on a body of water nobody finished.
 *
 * A summary covers a whole walk-up, so it waits for the last body: completing the pool sends nothing
 * while the spa is outstanding. That is right on the day, and wrong forever after -- the send is
 * triggered by a completion, so a spa left IN_PROGRESS means the customer never hears about the pool
 * either. Nothing else would ever notice.
 *
 * So once a day has passed, this gives up waiting and sends what exists, naming the unfinished body
 * as not completed. A partial summary beats silence, and the org is BCC'd on it, so an unfinished
 * stop surfaces to the office rather than disappearing.
 *
 * Deliberately only looks at days already over, in each org's OWN timezone. Sweeping today would
 * race a technician still working: a pool done at 9am and a spa due at 3pm is not a stuck bundle.
 *
 * Then closes out those unfinished stops -- see closeOutUnfinishedVisits below. Both halves answer the
 * same problem from different ends: the customer stops waiting for an email that was never coming, and
 * the office stops seeing a stop claim someone is working on it weeks later.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A completed visit whose summary never went out. Most have a perfectly good reason -- no contact
  // email on the property -- and those are cheap to re-check and skip. Bounded to the last 14 days so
  // this can't grow into a scan of all history; anything older has been unsent long enough that
  // emailing it now would confuse a customer more than help.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const pending = await prisma.serviceVisit.findMany({
    where: {
      status: "COMPLETED",
      // A logbook import is not a visit to tell a customer about, and a recent one would otherwise
      // fall inside the window and get emailed.
      logOnlyRecord: false,
      summaryEmailSentAt: null,
      completedAt: { gte: since },
    },
    orderBy: { completedAt: "asc" },
    select: {
      id: true,
      scheduledStart: true,
      organization: { select: { state: true } },
    },
  });

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};

  // Sequential, not Promise.all -- lib/prisma.ts caps the connection pool deliberately so several
  // warm Fluid Compute instances can coexist under Supabase's client cap, and each send also makes an
  // external Resend call. Fanning this out would serialize on the pool anyway.
  for (const visit of pending) {
    const timeZone = timeZoneForState(visit.organization.state);
    const { end: dayEnd } = localDayBounds(ymdInTimeZone(visit.scheduledStart, timeZone), timeZone);
    // Its local day must be over. dayEnd is exclusive (start of the next local day).
    if (now < dayEnd) {
      skipped++;
      reasons["day-not-over"] = (reasons["day-not-over"] ?? 0) + 1;
      continue;
    }

    try {
      const result = await sendBundledServiceSummary(visit.id, { force: true });
      if (result.sent) {
        sent++;
      } else {
        skipped++;
        reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      }
    } catch (error) {
      failed++;
      console.error("[cron send-pending-summaries] visit", visit.id, error);
    }
  }

  const pushed = await closeOutUnfinishedVisits(now);

  return NextResponse.json({ ok: true, considered: pending.length, sent, skipped, failed, reasons, pushed });
}

/**
 * Stops an unfinished stop reading "In progress" forever.
 *
 * A visit left IN_PROGRESS stays that way indefinitely -- nothing ever closes it -- so weeks-old stops
 * still said someone was working on them and still counted as overdue stops in the bell. Once the
 * visit's own local day has ended that is simply false: nobody is working on it, and nobody will on
 * that day.
 *
 * Stamping `pushedAt` rather than setting status = COMPLETED, which is what the compliance log and the
 * public inspector record count. The stop was not serviced and the record has to keep saying so.
 * Readings already entered stay exactly where they are, which is the whole reason they were imported
 * or typed in the first place.
 *
 * Deliberately silent. A customer whose pool WAS serviced has already had the summary naming this body
 * as not completed (that is the loop above). A stop with no finished sibling has had no email at all,
 * and a bare "we didn't finish" with no readings and nothing serviced alarms more than it informs --
 * that is the office's call to make, not a cron job's at 3am. The office sees these on the dashboard.
 */
async function closeOutUnfinishedVisits(now: Date): Promise<number> {
  // 90 days, not the 14 the summary loop uses: that window is about what is still reasonable to email
  // a customer, and this is about not lying on a screen, which does not expire. Bounded all the same so
  // this can never become a scan of all history.
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const open = await prisma.serviceVisit.findMany({
    where: {
      status: "IN_PROGRESS",
      pushedAt: null,
      scheduledStart: { gte: since },
    },
    select: { id: true, scheduledStart: true, organization: { select: { state: true } } },
  });

  // Same per-org timezone rule as the summary loop: sweeping today would push a stop a technician is
  // working on right now. A pool started at 9am is not an abandoned one at 9:05.
  const dueIds = open
    .filter((visit) => {
      const timeZone = timeZoneForState(visit.organization.state);
      const { end: dayEnd } = localDayBounds(ymdInTimeZone(visit.scheduledStart, timeZone), timeZone);
      return now >= dayEnd;
    })
    .map((visit) => visit.id);

  if (dueIds.length === 0) return 0;

  const result = await prisma.serviceVisit.updateMany({
    where: { id: { in: dueIds }, status: "IN_PROGRESS", pushedAt: null },
    data: { pushedAt: now },
  });
  return result.count;
}
