import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

type ReadingPayload = {
  ph?: number | null;
  freeChlorinePpm?: number | null;
  alkalinityPpm?: number | null;
  cyanuricAcidPpm?: number | null;
  temperatureF?: number | null;
  filterPressurePsi?: number | null;
  vacGaugeReading?: number | null;
  pumpPressurePsi?: number | null;
  filterGaugeReading?: number | null;
  flowMeterGpm?: number | null;
  backwashPerformed?: boolean;
  backwashAt?: string | null;
};

function numOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { id: true, technicianId: true, organizationId: true, status: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.status === "COMPLETED") {
    return NextResponse.json({ error: "VISIT_ALREADY_COMPLETED" }, { status: 400 });
  }

  const raw = (await request.json()) as ReadingPayload;

  // backwashAt: if the technician says no backwash happened, clear it. If yes, use provided
  // time (or "now" if no time was given).
  let backwashAt: Date | null | undefined = undefined;
  if (raw.backwashPerformed === false) {
    backwashAt = null;
  } else if (raw.backwashPerformed === true) {
    backwashAt = raw.backwashAt ? new Date(raw.backwashAt) : new Date();
    if (Number.isNaN(backwashAt.getTime())) backwashAt = new Date();
  }

  const data = {
    ph: numOrNull(raw.ph),
    freeChlorinePpm: numOrNull(raw.freeChlorinePpm),
    alkalinityPpm: numOrNull(raw.alkalinityPpm),
    cyanuricAcidPpm: numOrNull(raw.cyanuricAcidPpm),
    temperatureF: numOrNull(raw.temperatureF),
    filterPressurePsi: numOrNull(raw.filterPressurePsi),
    vacGaugeReading: numOrNull(raw.vacGaugeReading),
    pumpPressurePsi: numOrNull(raw.pumpPressurePsi),
    filterGaugeReading: numOrNull(raw.filterGaugeReading),
    flowMeterGpm: numOrNull(raw.flowMeterGpm),
    backwashAt,
  };

  const cleaned = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

  const reading = await prisma.visitWaterReading.upsert({
    where: { visitId: id },
    create: {
      visitId: id,
      capturedAt: new Date(),
      ...cleaned,
    },
    update: {
      capturedAt: new Date(),
      ...cleaned,
    },
  });

  return NextResponse.json({ ok: true, reading });
}
