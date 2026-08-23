import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";
import { CUSTOMER_DOCUMENTS_BUCKET } from "@/lib/customer-documents";
import { SDS_DOCUMENTS_BUCKET } from "@/lib/sds-documents";

export type OrgScrubOutcome = {
  status: "SUCCESS" | "FAILED";
  error?: string;
  /** Per-model row count deleted (live run) or that would be deleted (dry run). */
  deletedCounts: Record<string, number>;
};

/**
 * Default is delete -- the compliance-retained allowlist is deliberately narrow and
 * explicit:
 *   - Organization (kept entirely as-is -- it's the business account, not customer
 *     data, and its own Stripe ids stay so a canceled org is still identifiable for
 *     support/audit; nulling them would also permanently break self-serve reactivation)
 *   - Customer (kept, but notes/billingRef cleared -- only `name` is needed, shown on
 *     the public QR page)
 *   - Property, BodyOfWater (kept fully -- needed to resolve/render the QR page)
 *   - ServiceVisit (kept, but technicianId/techNotes/arrival GPS fields cleared --
 *     operational/PII, not compliance-relevant)
 *   - VisitWaterReading, ContaminationIncident, IncidentMonitoringReading,
 *     InspectionReport (kept fully -- this IS the retained compliance data)
 * Every other org-owned model below is deleted in full. dryRun computes counts only
 * (via `.count()` on the same `where` a live run would `.deleteMany()` with) and
 * removes no storage files -- see app/api/cron/scrub-canceled-orgs/route.ts for how
 * dry-run stays the default until this feature's trial period ends.
 */
export async function runOrgScrub(organizationId: string, dryRun: boolean): Promise<OrgScrubOutcome> {
  const deletedCounts: Record<string, number> = {};

  try {
    if (!dryRun) {
      await removeOrphanableFiles(organizationId);
    }

    // Visit-child operational/non-compliance data.
    deletedCounts.visitChemicalDose = await scrub(dryRun, prisma.visitChemicalDose, { visit: { organizationId } });
    deletedCounts.visitChecklistCompletion = await scrub(dryRun, prisma.visitChecklistCompletion, { visit: { organizationId } });
    deletedCounts.visitIssueFlag = await scrub(dryRun, prisma.visitIssueFlag, { visit: { organizationId } });
    deletedCounts.chemistryRecommendation = await scrub(dryRun, prisma.chemistryRecommendation, { visit: { organizationId } });
    deletedCounts.visitPhoto = await scrub(dryRun, prisma.visitPhoto, { visit: { organizationId } });

    // Body-of-water-child equipment/volume/schedule metadata -- not shown on the public
    // compliance log, so not retained.
    deletedCounts.equipment = await scrub(dryRun, prisma.equipment, { bodyOfWater: { property: { organizationId } } });
    deletedCounts.volumeCalculation = await scrub(dryRun, prisma.volumeCalculation, { bodyOfWater: { property: { organizationId } } });
    deletedCounts.bodyOfWaterServiceWeekday = await scrub(dryRun, prisma.bodyOfWaterServiceWeekday, {
      bodyOfWater: { property: { organizationId } },
    });

    // Scheduling/routing.
    deletedCounts.recurringRoute = await scrub(dryRun, prisma.recurringRoute, { organizationId });
    deletedCounts.adHocStop = await scrub(dryRun, prisma.adHocStop, { organizationId });

    // Payroll / dosing catalog / compliance-target overrides / phone agent.
    deletedCounts.technicianPayRate = await scrub(dryRun, prisma.technicianPayRate, { organizationId });
    deletedCounts.orgPayrollSettings = await scrub(dryRun, prisma.orgPayrollSettings, { organizationId });
    deletedCounts.orgChemicalProductSetting = await scrub(dryRun, prisma.orgChemicalProductSetting, { organizationId });
    deletedCounts.orgComplianceTarget = await scrub(dryRun, prisma.orgComplianceTarget, { organizationId });
    deletedCounts.orgPhoneAgentSettings = await scrub(dryRun, prisma.orgPhoneAgentSettings, { organizationId });
    deletedCounts.phoneAgentCall = await scrub(dryRun, prisma.phoneAgentCall, { organizationId });
    deletedCounts.phoneAgentDailyUsage = await scrub(dryRun, prisma.phoneAgentDailyUsage, { organizationId });

    // Catalogs.
    deletedCounts.chemicalProduct = await scrub(dryRun, prisma.chemicalProduct, { organizationId });
    deletedCounts.checklistItemDefinition = await scrub(dryRun, prisma.checklistItemDefinition, { organizationId });
    deletedCounts.customerChecklistExclusion = await scrub(dryRun, prisma.customerChecklistExclusion, { customer: { organizationId } });

    // Customer-facing (non-compliance) records and portal logins.
    deletedCounts.customerDocument = await scrub(dryRun, prisma.customerDocument, { customer: { organizationId } });
    deletedCounts.customerAlert = await scrub(dryRun, prisma.customerAlert, { customer: { organizationId } });
    deletedCounts.customerUser = await scrub(dryRun, prisma.customerUser, { customer: { organizationId } });

    // Staff logins.
    deletedCounts.user = await scrub(dryRun, prisma.user, { organizationId });

    deletedCounts.managementCompany = await scrub(dryRun, prisma.managementCompany, { organizationId });

    if (!dryRun) {
      await prisma.serviceVisit.updateMany({
        where: { organizationId },
        data: { technicianId: null, techNotes: null, arrivalLatitude: null, arrivalLongitude: null, arrivalAccuracyMeters: null },
      });
      await prisma.customer.updateMany({ where: { organizationId }, data: { notes: null, billingRef: null } });
    }

    return { status: "SUCCESS", deletedCounts };
  } catch (err) {
    return { status: "FAILED", error: err instanceof Error ? err.message : "Unknown scrub error", deletedCounts };
  }
}

/** Live-run only -- deletes the underlying storage objects for rows about to be
 * deleted, batched per bucket. Best-effort per file: a single unreadable/missing
 * object must not abort the scrub, since the DB row is getting deleted either way. */
async function removeOrphanableFiles(organizationId: string): Promise<void> {
  const supabaseAdmin = createSupabaseAdminClient();

  const photos = await prisma.visitPhoto.findMany({ where: { visit: { organizationId } }, select: { storagePath: true } });
  if (photos.length) {
    const { error } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).remove(photos.map((p) => p.storagePath));
    if (error) console.error(`[org-scrub] failed to remove visit-photo files for org ${organizationId}:`, error);
  }

  const documents = await prisma.customerDocument.findMany({ where: { customer: { organizationId } }, select: { storagePath: true } });
  if (documents.length) {
    const { error } = await supabaseAdmin.storage.from(CUSTOMER_DOCUMENTS_BUCKET).remove(documents.map((d) => d.storagePath));
    if (error) console.error(`[org-scrub] failed to remove customer-document files for org ${organizationId}:`, error);
  }

  const sdsUploads = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId, sdsStoragePath: { not: null } },
    select: { sdsStoragePath: true },
  });
  const sdsPaths = sdsUploads.map((s) => s.sdsStoragePath).filter((p): p is string => p != null);
  if (sdsPaths.length) {
    const { error } = await supabaseAdmin.storage.from(SDS_DOCUMENTS_BUCKET).remove(sdsPaths);
    if (error) console.error(`[org-scrub] failed to remove org-SDS files for org ${organizationId}:`, error);
  }
}

/** Shared dry-run/live-run body: dry run counts rows matching `where`, live run deletes
 * them -- both against the exact same filter, so a dry-run report is guaranteed to
 * match what a live run would actually do. */
async function scrub<W>(
  dryRun: boolean,
  delegate: { count: (args: { where: W }) => Promise<number>; deleteMany: (args: { where: W }) => Promise<{ count: number }> },
  where: W,
): Promise<number> {
  if (dryRun) return delegate.count({ where });
  const result = await delegate.deleteMany({ where });
  return result.count;
}
