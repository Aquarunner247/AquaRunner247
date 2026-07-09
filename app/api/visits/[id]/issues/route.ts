import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

type IssuePayload = {
  description?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { id: true, technicianId: true, organizationId: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await request.json()) as IssuePayload;
  const description = (body.description ?? "").trim();
  const severity = (["LOW", "MEDIUM", "HIGH"] as const).includes(body.severity as "LOW" | "MEDIUM" | "HIGH")
    ? (body.severity as "LOW" | "MEDIUM" | "HIGH")
    : "MEDIUM";
  if (!description) return NextResponse.json({ error: "INVALID_DESCRIPTION" }, { status: 400 });

  const issue = await prisma.visitIssueFlag.create({
    data: {
      visitId: id,
      code: "TECH_REPORTED",
      description,
      severity,
    },
  });

  return NextResponse.json({ ok: true, issue });
}
