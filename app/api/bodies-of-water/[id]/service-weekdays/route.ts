import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { validateServiceWeekdays } from "@/lib/service-weekdays";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET: list ISO weekdays (1=Mon … 7=Sun) configured for this body of water.
 * PUT: replace schedule — must be 1–7 distinct weekdays.
 */
type AppUser = Awaited<ReturnType<typeof getCurrentAppUser>>;
type OrgAdminError = { status: number; message: string };
type RequireOrgAdminResult =
  | { appUser: NonNullable<AppUser>; error: null }
  | { appUser: null; error: OrgAdminError };

async function requireOrgAdmin(): Promise<RequireOrgAdminResult> {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return { appUser: null, error: { status: 401, message: "Unauthorized" } };
  }
  if (appUser.role !== "ADMIN" && appUser.role !== "OFFICE") {
    return { appUser: null, error: { status: 403, message: "Forbidden" } };
  }
  return { appUser, error: null };
}

async function requireBodyInOrg(bodyOfWaterId: string, organizationId: string) {
  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyOfWaterId, property: { organizationId } },
    select: { id: true },
  });
  return body?.id ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const auth = await requireOrgAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const bodyId = await requireBodyInOrg(id, auth.appUser.organizationId);
  if (!bodyId) return NextResponse.json({ error: "Body of water not found" }, { status: 404 });

  const rows = await prisma.bodyOfWaterServiceWeekday.findMany({
    where: { bodyOfWaterId: bodyId },
    orderBy: { weekday: "asc" },
    select: { weekday: true },
  });

  const weekdays = rows.map((r) => r.weekday);
  return NextResponse.json({ bodyOfWaterId: id, weekdays });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const auth = await requireOrgAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const bodyId = await requireBodyInOrg(id, auth.appUser.organizationId);
  if (!bodyId) return NextResponse.json({ error: "Body of water not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("weekdays" in body)) {
    return NextResponse.json({ error: "Expected { weekdays: number[] }" }, { status: 400 });
  }

  const weekdaysRaw = (body as { weekdays: unknown }).weekdays;
  if (!Array.isArray(weekdaysRaw)) {
    return NextResponse.json({ error: "weekdays must be an array" }, { status: 400 });
  }

  const parsed = weekdaysRaw.map((n) => Number(n));
  const validation = validateServiceWeekdays(parsed);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const exists = await prisma.bodyOfWater.findUnique({
    where: { id: bodyId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Body of water not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.bodyOfWaterServiceWeekday.deleteMany({ where: { bodyOfWaterId: bodyId } }),
    prisma.bodyOfWaterServiceWeekday.createMany({
      data: validation.weekdays.map((weekday) => ({ bodyOfWaterId: bodyId, weekday })),
    }),
  ]);

  return NextResponse.json({ bodyOfWaterId: bodyId, weekdays: validation.weekdays });
}
