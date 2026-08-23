import { prisma } from "@/lib/prisma";
import { downloadVisitPhotoFile } from "@/lib/visit-photos";
import { downloadInspectionReportFile } from "@/lib/inspection-reports";

/**
 * Shared JSON-export core for two different callers:
 *   - the self-serve "export my data" route (metadata only, org-triggered, any date
 *     range, downloaded directly -- never touches Blob)
 *   - the automatic cancellation safety-net export (full history, no date range,
 *     copies actual photo/inspection-report file bytes, uploaded to Vercel Blob)
 * buildComplianceArchive() always stays metadata-only so the self-export path never
 * pays for file downloads it doesn't want -- file-copying is layered on top by
 * runCancellationSafetyExport(), below, for the one caller that needs it.
 */

export type ComplianceArchiveScope = {
  organizationId: string;
  /** Inclusive lower bound, matched against each record's own natural date field
   * (visit completion/scheduled date, incident discovery date, report upload date).
   * Omit for all-time. */
  from?: Date;
  /** Inclusive upper bound. Omit for all-time. */
  to?: Date;
};

export type ComplianceArchiveEnvelope = Awaited<ReturnType<typeof buildComplianceArchive>>;

function dateRange(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

/** ServiceVisit has no single reliable date column across its lifecycle (a scheduled-
 * but-not-yet-completed visit has completedAt: null) -- prefer completedAt when set,
 * fall back to scheduledStart otherwise, so a date range still includes upcoming work. */
function visitDateFilter(from?: Date, to?: Date) {
  const range = dateRange(from, to);
  if (!range) return {};
  return { OR: [{ completedAt: range }, { completedAt: null, scheduledStart: range }] };
}

export async function buildComplianceArchive(scope: ComplianceArchiveScope) {
  const { organizationId, from, to } = scope;

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, name: true, businessName: true },
  });

  const [serviceVisits, contaminationIncidents, inspectionReports] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: { organizationId, ...visitDateFilter(from, to) },
      orderBy: { scheduledStart: "asc" },
      include: {
        property: { select: { name: true } },
        bodyOfWater: { select: { name: true } },
        technician: { select: { name: true } },
        reading: true,
        doses: true,
        photos: true,
        issues: true,
        checklistCompletions: { include: { checklistItem: { select: { label: true } } } },
      },
    }),
    prisma.contaminationIncident.findMany({
      where: { property: { organizationId }, discoveredAt: dateRange(from, to) },
      orderBy: { discoveredAt: "asc" },
      include: {
        property: { select: { name: true } },
        bodyOfWater: { select: { name: true } },
        monitoringReadings: { orderBy: { sequence: "asc" } },
      },
    }),
    prisma.inspectionReport.findMany({
      where: { bodyOfWater: { property: { organizationId } }, createdAt: dateRange(from, to) },
      orderBy: { createdAt: "asc" },
      include: { bodyOfWater: { select: { name: true } } },
    }),
  ]);

  return {
    schemaVersion: 1 as const,
    organizationId: organization.id,
    organizationName: organization.businessName ?? organization.name,
    generatedAt: new Date(),
    scope: { from: from ?? null, to: to ?? null },
    counts: {
      serviceVisits: serviceVisits.length,
      visitPhotos: serviceVisits.reduce((n, v) => n + v.photos.length, 0),
      contaminationIncidents: contaminationIncidents.length,
      inspectionReports: inspectionReports.length,
    },
    serviceVisits: serviceVisits.map((v) => ({
      id: v.id,
      propertyName: v.property.name,
      bodyOfWaterName: v.bodyOfWater.name,
      technicianName: v.technician?.name ?? null,
      scheduledStart: v.scheduledStart,
      scheduledEnd: v.scheduledEnd,
      status: v.status,
      serviceComplete: v.serviceComplete,
      techNotes: v.techNotes,
      startedAt: v.startedAt,
      completedAt: v.completedAt,
      reading: v.reading,
      doses: v.doses.map((d) => ({ productName: d.productName, quantity: d.quantity, unit: d.unit, createdAt: d.createdAt })),
      photos: v.photos.map((p) => ({
        id: p.id,
        storagePath: p.storagePath,
        contentType: p.contentType,
        takenAt: p.takenAt,
        createdAt: p.createdAt,
        // Populated only when the caller copies bytes into the archive -- see
        // runCancellationSafetyExport. Absent (undefined) for the self-export path.
        archivedBlobPath: undefined as string | undefined,
      })),
      issues: v.issues.map((i) => ({ code: i.code, description: i.description, severity: i.severity, resolved: i.resolved, createdAt: i.createdAt })),
      checklistCompletions: v.checklistCompletions.map((c) => ({ label: c.checklistItem?.label ?? c.label, completed: c.completed })),
    })),
    contaminationIncidents: contaminationIncidents.map((inc) => ({
      id: inc.id,
      propertyName: inc.property.name,
      bodyOfWaterName: inc.bodyOfWater.name,
      status: inc.status,
      contaminationType: inc.contaminationType,
      discoveredAt: inc.discoveredAt,
      batherCountAtTime: inc.batherCountAtTime,
      cyaPresentPpm: inc.cyaPresentPpm,
      targetConcentrationReachedAt: inc.targetConcentrationReachedAt,
      verifiedEvenDistributionAt: inc.verifiedEvenDistributionAt,
      contactTimeEndedAt: inc.contactTimeEndedAt,
      reopenedAt: inc.reopenedAt,
      remediationSteps: inc.remediationSteps,
      notes: inc.notes,
      monitoringReadings: inc.monitoringReadings.map((r) => ({
        checkpointLabel: r.checkpointLabel,
        sequence: r.sequence,
        recordedAt: r.recordedAt,
        freeChlorinePpm: r.freeChlorinePpm,
        totalChlorinePpm: r.totalChlorinePpm,
        ph: r.ph,
        temperature: r.temperature,
        distributionVerified: r.distributionVerified,
        notes: r.notes,
      })),
    })),
    inspectionReports: inspectionReports.map((r) => ({
      id: r.id,
      bodyOfWaterName: r.bodyOfWater.name,
      label: r.label,
      storagePath: r.storagePath,
      contentType: r.contentType,
      fileSize: r.fileSize,
      createdAt: r.createdAt,
      archivedBlobPath: undefined as string | undefined,
    })),
  };
}

async function uploadArchiveJson(pathname: string, payload: unknown): Promise<string> {
  const { put } = await import("@vercel/blob");
  const blob = await put(pathname, JSON.stringify(payload, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
  });
  return blob.pathname;
}

/**
 * Automatic full-history export taken the moment a subscription cancellation is
 * detected -- a backstop in case the org never uses the self-serve export tool
 * themselves before the scrub cron runs. Unlike buildComplianceArchive's normal
 * metadata-only output, this also copies the actual photo/inspection-report file
 * bytes out of Supabase Storage into the same Blob "package" as the JSON, since a
 * cascade-deleted VisitPhoto/InspectionReport row does NOT delete its underlying
 * storage file, but a scrub does eventually intend to -- see lib/org-scrub.ts.
 */
export async function runCancellationSafetyExport(organizationId: string): Promise<{ blobPath: string; recordCount: number }> {
  const envelope = await buildComplianceArchive({ organizationId });
  const timestamp = envelope.generatedAt.toISOString().replace(/[:.]/g, "-");
  const basePath = `org-scrub/${organizationId}/${timestamp}`;

  for (const visit of envelope.serviceVisits) {
    for (const photo of visit.photos) {
      try {
        const { bytes, contentType } = await downloadVisitPhotoFile(photo.storagePath);
        const blobPathname = `${basePath}/files/visitPhoto/${photo.id}`;
        const { put } = await import("@vercel/blob");
        const blob = await put(blobPathname, Buffer.from(bytes), {
          access: "private",
          contentType: contentType ?? "application/octet-stream",
          addRandomSuffix: false,
        });
        photo.archivedBlobPath = blob.pathname;
      } catch (err) {
        // Best-effort -- a single missing/unreadable photo shouldn't abort the whole
        // safety export. The JSON metadata for this photo is still preserved either way.
        console.error(`[compliance-archive] failed to copy visit photo ${photo.id} to Blob:`, err);
      }
    }
  }

  for (const report of envelope.inspectionReports) {
    try {
      const { bytes, contentType } = await downloadInspectionReportFile(report.storagePath);
      const blobPathname = `${basePath}/files/inspectionReport/${report.id}`;
      const { put } = await import("@vercel/blob");
      const blob = await put(blobPathname, Buffer.from(bytes), {
        access: "private",
        contentType: contentType ?? "application/octet-stream",
        addRandomSuffix: false,
      });
      report.archivedBlobPath = blob.pathname;
    } catch (err) {
      console.error(`[compliance-archive] failed to copy inspection report ${report.id} to Blob:`, err);
    }
  }

  const blobPath = await uploadArchiveJson(`${basePath}.json`, envelope);
  const recordCount = envelope.counts.serviceVisits + envelope.counts.contaminationIncidents + envelope.counts.inspectionReports;
  return { blobPath, recordCount };
}
