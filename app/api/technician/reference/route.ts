import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { applyServiceMessagePlaceholders } from "@/lib/default-service-messages";

/**
 * GET /api/technician/reference -- the slow-changing, organization-wide set the visit forms need.
 *
 * Phase 1b of NATIVE-REBUILD-PLAN.md. Separate from the per-stop payload because it is the same
 * for every stop: fetching it once per day costs one request, fetching it per stop costs twenty.
 *
 * WHAT IS NOT HERE, correcting the plan: checklist definitions. The plan listed them, but the
 * query in app/dashboard/visits/[id]/page.tsx scopes them per visit -- RESIDENTIAL or COMMERCIAL
 * by the property's type, minus any item the customer has opted out of. They are therefore part
 * of the stop, not of the organization, and they live in GET /api/visits/[id] instead. Putting
 * them here would have shipped a residential technician the commercial checklist.
 */
export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const [org, chemicalProducts, serviceMessageTemplates] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: appUser.organizationId },
      select: { name: true, state: true, trackCalciumHardness: true, trackSaltPpm: true },
    }),
    prisma.chemicalProduct.findMany({
      where: { organizationId: appUser.organizationId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
    prisma.serviceMessageTemplate.findMany({
      where: { organizationId: appUser.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, body: true },
    }),
  ]);

  if (!org) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    organization: {
      name: org.name,
      state: org.state,
      trackCalciumHardness: org.trackCalciumHardness,
      trackSaltPpm: org.trackSaltPpm,
    },
    chemicalProducts,
    /**
     * Interpolated here for the same reason the page interpolates it: a technician choosing
     * between messages has to read what the customer will actually receive, and a literal
     * "{{orgName}}" in the picker is indistinguishable from a message that would send broken.
     * The client still posts the template id and the completion API re-interpolates from the
     * database, so this is display-only and cannot be tampered with.
     */
    serviceMessages: serviceMessageTemplates.map((msg) => ({
      ...msg,
      body: applyServiceMessagePlaceholders(msg.body, { orgName: org.name }),
    })),
  });
}
