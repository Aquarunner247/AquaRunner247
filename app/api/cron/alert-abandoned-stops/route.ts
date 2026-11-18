import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAbandonedStopEmail, sendTechnicianAbandonedStopEmail } from "@/lib/email";
import { timeZoneForState, formatLocalTime } from "@/lib/timezone";
import {
  abandonedStopDecision,
  groupAbandonedStopsByProperty,
  splitAbandonedStopsByTechnician,
  formatOpenDuration,
  formatOnSiteDuration,
  ABANDONED_AFTER_HOURS,
  type AbandonedStopAlert,
} from "@/lib/abandoned-stop";

export const runtime = "nodejs";

/**
 * Tells an organization -- and the technician -- when stops were started and never finished,
 * while somebody could still do something about it.
 *
 * The nightly sweep already stamps `pushedAt` on these once the scheduled day is over, which is
 * how the org finds out today -- the next morning, as a record. Measured on 2026-10-25, 68 of
 * the 445 stops arrived at since September were never completed, roughly one in six, so this is
 * a real signal rather than noise. See lib/abandoned-stop.ts for both rules and their thresholds.
 *
 * Hourly rather than daily, because the point is to be timely; the thresholds do the filtering,
 * and running hourly only decides how soon after crossing one the mail goes out. No timezone
 * handling needed for the same reason -- the rule is "open too long" or "they left", not "open
 * past a particular hour". One alert per stop, ever.
 *
 * Two rules, so two candidate shapes: open past four hours, OR a recorded departure at any
 * elapsed time. The second is why the query cannot simply filter on an old `startedAt` -- a stop
 * entered at 9am and departed at 9:25 must be picked up on the 10am run, not at 1pm.
 *
 * GROUPED BY PROPERTY as of 2026-11-14. One email per address per sweep, however many bodies of
 * water were left open there, because a pool and a spa at one house are one occasion to go back
 * to -- the same reasoning the capture screen and the customer summary already use. Three emails
 * about one address is how a notice starts being filtered instead of read.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_HOURS * 60 * 60 * 1000);

  // Narrowed in SQL to what can possibly alert; abandonedStopDecision re-checks every condition,
  // so this is an optimisation rather than the rule.
  const candidates = await prisma.serviceVisit.findMany({
    where: {
      status: "IN_PROGRESS",
      completedAt: null,
      pushedAt: null,
      abandonedAlertSentAt: null,
      startedAt: { not: null },
      technicianId: { not: null },
      // Three ways in, one per rule: open past four hours, a recorded departure, or any capture
      // on it (the quiet rule, which can fire well inside the first hour). The decision function
      // re-checks all of it -- this only avoids loading stops no rule could possibly pick.
      OR: [
        { startedAt: { lte: cutoff } },
        { departedAt: { not: null } },
        { reading: { isNot: null } },
        { photos: { some: {} } },
        { doses: { some: {} } },
      ],
    },
    // Oldest arrival first, which is longest-open first. The email states the group's longest
    // open duration by reading the first row, and a technician scanning the list should meet the
    // stop they walked away from earliest at the top.
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      departedAt: true,
      completedAt: true,
      pushedAt: true,
      abandonedAlertSentAt: true,
      propertyId: true,
      technicianId: true,
      technician: { select: { name: true, email: true } },
      // Newest capture of each kind. Taken as one row apiece rather than counting, because the
      // quiet rule needs the timestamp; see QUIET_AFTER_MINUTES for why all three count.
      reading: { select: { createdAt: true } },
      photos: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      doses: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      bodyOfWater: { select: { name: true } },
      property: { select: { name: true } },
      organization: {
        select: {
          id: true,
          name: true,
          businessName: true,
          state: true,
          welcomeEmailSupportEmail: true,
          users: { where: { active: true, role: "ADMIN" }, select: { email: true } },
        },
      },
    },
  });

  type Candidate = (typeof candidates)[number];

  let sent = 0;
  let stopsCovered = 0;
  let skipped = 0;
  let failed = 0;
  let technicianEmailsSent = 0;
  let technicianEmailsFailed = 0;
  let technicianEmailsSkipped = 0;
  const triggers: Record<string, number> = { departed: 0, quiet: 0, elapsed: 0 };
  const reasons: Record<string, number> = {};
  const note = (reason: string) => {
    skipped++;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };

  /** Newest of this stop's own captures -- reading, photo or dose. Null when it has none. */
  const lastActivityOf = (visit: Candidate): Date | null => {
    const times = [visit.reading?.createdAt, visit.photos[0]?.createdAt, visit.doses[0]?.createdAt].filter(
      (d): d is Date => d != null,
    );
    return times.length === 0 ? null : new Date(Math.max(...times.map((d) => d.getTime())));
  };

  // The quiet rule asks whether the ADDRESS has gone quiet, not just the stop, so each candidate
  // needs to see its siblings' captures. Keyed by property AND technician: two people splitting a
  // commercial site are working separately, and one still capturing says nothing about the other
  // having gone home. Built from the candidates already loaded -- no extra query.
  const activityByPropertyTech = new Map<string, number>();
  for (const visit of candidates) {
    const at = lastActivityOf(visit);
    if (at == null) continue;
    const key = `${visit.propertyId}:${visit.technicianId}`;
    const best = activityByPropertyTech.get(key);
    if (best == null || at.getTime() > best) activityByPropertyTech.set(key, at.getTime());
  }

  // Decide first, group second. Every suppression still happens per stop -- a property with one
  // stop past the threshold and one that only arrived twenty minutes ago alerts about the first
  // and keeps watching the second.
  const alerting: AbandonedStopAlert<Candidate>[] = [];
  for (const visit of candidates) {
    const lastActivityAt = lastActivityOf(visit);
    // The sibling figure is the address maximum, which includes this stop; passing it is harmless
    // because the rule takes the later of the two anyway.
    const siblingMs = activityByPropertyTech.get(`${visit.propertyId}:${visit.technicianId}`);
    const decision = abandonedStopDecision(
      { ...visit, lastActivityAt, siblingLastActivityAt: siblingMs == null ? null : new Date(siblingMs) },
      now,
    );
    if (!decision.alert) {
      note(decision.reason);
      continue;
    }
    if (!visit.startedAt) {
      note("never-arrived");
      continue;
    }
    alerting.push({ visit, decision });
  }

  // Sequential, like the other sweeps: the connection pool is capped deliberately in
  // lib/prisma.ts and each iteration also makes Resend calls.
  for (const group of groupAbandonedStopsByProperty(alerting)) {
    const first = group.stops[0].visit;
    const org = first.organization;
    const timeZone = timeZoneForState(org.state);

    // Whoever runs the day. The org's support address when it has one -- that is where mail
    // about the day's work already goes -- otherwise every active admin. Same precedence as the
    // task digest, and the same reason: reach a person rather than nobody.
    const recipients = org.welcomeEmailSupportEmail
      ? [org.welcomeEmailSupportEmail]
      : org.users.map((u) => u.email).filter((e): e is string => Boolean(e));
    if (recipients.length === 0) {
      group.stops.forEach(() => note("no-recipient"));
      continue;
    }

    const line = ({ visit, decision }: AbandonedStopAlert<Candidate>) => ({
      bodyName: visit.bodyOfWater?.name ?? null,
      technicianName: visit.technician?.name ?? "A technician",
      openFor: formatOpenDuration(decision.openHours),
      arrivedAtLabel: `at ${formatLocalTime(visit.startedAt as Date, timeZone)}`,
      // Only when the device actually recorded it. Passed together, because a row only makes the
      // stronger "they left" claim when it has both.
      departedAtLabel:
        decision.trigger === "departed" && visit.departedAt
          ? `at ${formatLocalTime(visit.departedAt, timeZone)}`
          : null,
      onSiteFor: decision.trigger === "departed" ? formatOnSiteDuration(decision.onSiteMinutes) : null,
      visitUrl: `${appUrl}/dashboard/visits/${visit.id}`,
    });

    const result = await sendAbandonedStopEmail({
      to: recipients,
      organizationName: org.businessName ?? org.name,
      propertyName: first.property.name,
      stops: group.stops.map(line),
      scheduleUrl: `${appUrl}/dashboard/schedule`,
    });

    if (!result.ok) {
      failed++;
      console.error(
        "[cron alert-abandoned-stops] send failed for property",
        group.propertyId,
        group.stops.length,
        "stops:",
        result.error,
      );
      continue;
    }

    for (const stop of group.stops) triggers[stop.decision.trigger]++;
    sent++;
    stopsCovered += group.stops.length;

    // The technician's own copy, split so that two people sharing a big commercial site are each
    // told only about their own stops. Sent after the office notice and never allowed to fail the
    // sweep: the office alert is the one that must go out, and a technician with no email address
    // on the account is normal rather than an error.
    for (const perTech of splitAbandonedStopsByTechnician(group.stops)) {
      const tech = perTech.stops[0].visit.technician;
      if (!tech?.email) {
        technicianEmailsSkipped++;
        continue;
      }
      const techResult = await sendTechnicianAbandonedStopEmail({
        to: tech.email,
        technicianFirstName: tech.name ? tech.name.trim().split(/\s+/)[0] : null,
        propertyName: first.property.name,
        stops: perTech.stops.map(line),
        scheduleUrl: `${appUrl}/dashboard/schedule`,
      });
      if (techResult.ok) technicianEmailsSent++;
      else {
        technicianEmailsFailed++;
        console.error(
          "[cron alert-abandoned-stops] technician send failed for",
          perTech.technicianId,
          techResult.error,
        );
      }
    }

    // Stamped only after the office notice actually sent, so a total failure retries next hour
    // rather than being recorded as done. Every stop in the group is stamped together, which is
    // what makes the grouping safe: none of them can turn up in a second email next hour.
    await prisma.serviceVisit.updateMany({
      where: { id: { in: group.stops.map((s) => s.visit.id) } },
      data: { abandonedAlertSentAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    thresholdHours: ABANDONED_AFTER_HOURS,
    triggers,
    candidates: candidates.length,
    properties: sent,
    sent,
    stopsCovered,
    skipped,
    failed,
    technicianEmailsSent,
    technicianEmailsFailed,
    technicianEmailsSkipped,
    reasons,
  });
}
