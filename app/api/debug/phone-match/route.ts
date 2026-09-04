import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchCallerToProperty, normalizePhone } from "@/lib/phone-match";

// TEMPORARY diagnostic route -- reproduces findPropertyByCallerNumber's exact query
// live in production to debug why a known-good match isn't being found. Gated behind
// DIALOGFLOW_WEBHOOK_SECRET (an existing secret, not a new one) purely so this isn't
// wide open while it exists. Remove immediately after debugging -- same pattern as the
// prior "Temporarily re-add Dialogflow WIF verification route" commits in this repo's
// history.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== process.env.DIALOGFLOW_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const organizationId = url.searchParams.get("org");
  const callerNumber = url.searchParams.get("phone");
  if (!organizationId || !callerNumber) {
    return NextResponse.json({ error: "Missing org or phone query param" }, { status: 400 });
  }

  const properties = await prisma.property.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      customerId: true,
      customer: { select: { name: true } },
      managerBusinessPhone: true,
      managerMobilePhone: true,
      managerPhone: true,
      maintenanceCellPhone: true,
      ownerMobilePhone: true,
      ownerHomePhone: true,
    },
  });

  const match = matchCallerToProperty(callerNumber, properties);

  return NextResponse.json({
    normalizedCallerNumber: normalizePhone(callerNumber),
    propertyCount: properties.length,
    match,
    properties: properties.map((p) => ({
      id: p.id,
      name: p.name,
      managerBusinessPhone: p.managerBusinessPhone,
      managerMobilePhone: p.managerMobilePhone,
      managerPhone: p.managerPhone,
      maintenanceCellPhone: p.maintenanceCellPhone,
      ownerMobilePhone: p.ownerMobilePhone,
      ownerHomePhone: p.ownerHomePhone,
    })),
  });
}
