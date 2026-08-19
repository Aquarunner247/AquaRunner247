import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { downloadInspectionReportFile } from "@/lib/inspection-reports";
import { extractInspectionReportData } from "@/lib/inspection-report-extraction";

export const runtime = "nodejs";

/**
 * Runs LLM extraction against an already-uploaded inspection report and returns the
 * result for the admin to review -- never writes anything to the database itself. The
 * actual write only happens if/when the admin submits the separate
 * applyInspectionReportExtraction Server Action with their (possibly edited) selections.
 */
export async function POST(_req: Request, context: { params: Promise<{ reportId: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { reportId } = await context.params;

  const report = await prisma.inspectionReport.findFirst({
    where: { id: reportId, bodyOfWater: { property: { organizationId: appUser.organizationId } } },
    select: { id: true, storagePath: true, contentType: true },
  });
  if (!report) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const { bytes, contentType: downloadedContentType } = await downloadInspectionReportFile(report.storagePath);
    const mediaType = report.contentType || downloadedContentType || "application/octet-stream";
    const data = await extractInspectionReportData(bytes, mediaType);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[inspection report extraction] failed:", err);
    return NextResponse.json({ ok: false, error: "We couldn't read that report. Try again, or fill these in by hand." }, { status: 500 });
  }
}
