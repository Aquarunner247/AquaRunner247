import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAbandonedStopEmail } from "@/lib/email";
import { timeZoneForState, formatLocalTime } from "@/lib/timezone";
import { abandonedStopDecision, formatOpenDuration, ABANDONED_AFTER_HOURS } from "@/lib/abandoned-stop";

export const runtime = "nodejs";

/**
 * Tells an organization when a stop was started and never finished, while somebody could still
 * do something about it.
 *
 * The nightly sweep already stamps `pushedAt` on these once the scheduled day is over, which is
 * how the org finds out today -- the next morning, as a record. Measured on 2026-10-25, 68 of
 * the 445 stops arrived at since September were never completed, roughly one in six, so this is
 * a real signal rather than noise. See lib/abandoned-stop.ts for why elapsed time is enough.
 *
 * Hourly rather than daily, because the point is to be timely; the four-hour threshold does the
 * filtering, and running hourly only decides how soon after crossing it the mail goes out. No
 * timezone handling needed for the same reason -- the rule is "open too long", not "open past a
 * particular hour". One alert per stop, ever.
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
      startedAt: { not: null, lte: cutoff },
      technicianId: { not: null },
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      pushedAt: true,
      abandonedAlertSentAt: true,
      technicianId: true,
      technician: { select: { name: true } },
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

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};
  const note = (reason: string) => {
    skipped++;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };

  // Sequential, like the other sweeps: the connection pool is capped deliberately in
  // lib/prisma.ts and each iteration also makes a Resend call.
  for (const visit of candidates) {
    const decision = abandonedStopDecision(visit, now);
    if (!decision.alert) {
      note(decision.reason);
      continue;
    }
    const startedAt = visit.startedAt;
    if (!startedAt) {
      note("never-arrived");
      continue;
    }

    const org = visit.organization;
    // Whoever runs the day. The org's support address when it has one -- that is where mail
    // about the day's work already goes -- otherwise every active admin. Same precedence as the
    // task digest, and the same reason: reach a person rather than nobody.
    const recipients = org.welcomeEmailSupportEmail
      ? [org.welcomeEmailSupportEmail]
      : org.users.map((u) => u.email).filter((e): e is string => Boolean(e));
    if (recipients.length === 0) {
      note("no-recipient");
      continue;
    }

    const timeZone = timeZoneForState(org.state);
    const result = await sendAbandonedStopEmail({
      to: recipients,
      organizationName: org.businessName ?? org.name,
      technicianName: visit.technician?.name ?? "A technician",
      propertyName: visit.property.name,
      bodyName: visit.bodyOfWater?.name ?? null,
      openFor: formatOpenDuration(decision.openHours),
      arrivedAtLabel: `at ${formatLocalTime(startedAt, timeZone)}`,
      visitUrl: `${appUrl}/dashboard/visits/${visit.id}`,
    });

    if (result.ok) {
      // Stamped only after something actually sent, so a total failure retries next hour rather
      // than being recorded as done.
      await prisma.serviceVisit.update({
        where: { id: visit.id },
        data: { abandonedAlertSentAt: new Date() },
      });
      sent++;
    } else {
      failed++;
      console.error("[cron alert-abandoned-stops] send failed for visit", visit.id, result.error);
    }
  }

  return NextResponse.json({
    ok: true,
    thresholdHours: ABANDONED_AFTER_HOURS,
    candidates: candidates.length,
    sent,
    skipped,
    failed,
    reasons,
  });
}
