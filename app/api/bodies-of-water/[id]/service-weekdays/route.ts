import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateServiceWeekdays } from "@/lib/service-weekdays";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET: list ISO weekdays (1=Mon … 7=Sun) configured for this body of water.
 * PUT: replace schedule — must be 1–7 distinct weekdays.
 * TODO: require Supabase session + org scoping (RLS) before production.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const rows = await prisma.bodyOfWaterServiceWeekday.findMany({
    where: { bodyOfWaterId: id },
    orderBy: { weekday: "asc" },
    select: { weekday: true },
  });

  const weekdays = rows.map((r) => r.weekday);
  return NextResponse.json({ bodyOfWaterId: id, weekdays });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
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
    where: { id },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Body of water not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.bodyOfWaterServiceWeekday.deleteMany({ where: { bodyOfWaterId: id } }),
    prisma.bodyOfWaterServiceWeekday.createMany({
      data: validation.weekdays.map((weekday) => ({ bodyOfWaterId: id, weekday })),
    }),
  ]);

  return NextResponse.json({ bodyOfWaterId: id, weekdays: validation.weekdays });
}
