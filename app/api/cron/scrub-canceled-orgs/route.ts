import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runOrgScrub } from "@/lib/org-scrub";

export const runtime = "nodejs";

/**
 * Runs daily (see vercel.ts). Scrubs every org whose 48h post-cancellation grace period
 * (set by the customer.subscription.deleted webhook handler) has elapsed and hasn't
 * been scrubbed yet.
 *
 * Ships dry-run by default -- per this project's standing rule that anything deleting
 * production data defaults to a dry run until explicitly told to apply. Set
 * ORG_SCRUB_DRY_RUN=false only after reviewing a few real dry-run reports
 * (OrganizationScrubRun.deletedCounts) and being confident the retain/delete split is
 * correct.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = process.env.ORG_SCRUB_DRY_RUN !== "false";

  const dueOrgs = await prisma.organization.findMany({
    where: { planStatus: "CANCELED", dataScrubScheduledAt: { lte: new Date() }, dataScrubbedAt: null },
    select: { id: true },
  });

  let orgsProcessed = 0;
  let orgsFailed = 0;

  // Sequential, not Promise.all -- lib/prisma.ts caps the connection pool at max: 3
  // specifically so several warm Fluid Compute instances can coexist under Supabase's
  // session-pooler client cap; fanning this out would just serialize on that pool anyway.
  for (const org of dueOrgs) {
    const outcome = await runOrgScrub(org.id, dryRun);

    await prisma.organizationScrubRun.create({
      data: {
        organizationId: org.id,
        dryRun,
        completedAt: new Date(),
        status: outcome.status,
        error: outcome.error,
        deletedCounts: outcome.deletedCounts,
      },
    });

    if (outcome.status === "SUCCESS") {
      orgsProcessed += 1;
      if (!dryRun) {
        await prisma.organization.update({ where: { id: org.id }, data: { dataScrubbedAt: new Date() } });
      }
    } else {
      orgsFailed += 1;
      console.error(`[scrub-canceled-orgs] scrub failed for org ${org.id}:`, outcome.error);
    }
  }

  return NextResponse.json({ dryRun, orgsDue: dueOrgs.length, orgsProcessed, orgsFailed });
}
