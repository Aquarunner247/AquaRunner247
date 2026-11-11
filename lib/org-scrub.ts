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
 *   - Property (kept, but every contact and free-text field cleared -- see
 *     PROPERTY_FIELDS_CLEARED_ON_SCRUB. Only name/propertyType/addressLine1/city/region
 *     are read by the public log, so the rest was retained forever for nothing)
 *   - BodyOfWater (kept fully -- needed to resolve/render the QR page)
 *   - ServiceVisit (kept, but technicianId/techNotes/arrival GPS fields cleared --
 *     operational/PII, not compliance-relevant)
 *   - VisitWaterReading, ContaminationIncident, IncidentMonitoringReading,
 *     InspectionReport (kept fully -- this IS the retained compliance data)
 *   - CustomerUser (kept fully -- blocked from portal access via the org's live
 *     planStatus, not deleted, so the customer can subscribe to AquaRunner Compliance
 *     themselves and keep their identity/records; see lib/auth/customer-user.ts)
 * Every other org-owned model below is deleted in full. dryRun computes counts only
 * (via `.count()` on the same `where` a live run would `.deleteMany()` with) and
 * removes no storage files -- see app/api/cron/scrub-canceled-orgs/route.ts for how
 * dry-run stays the default until this feature's trial period ends.
 */
/**
 * Property fields cleared on a retained Property row, rather than kept with it.
 *
 * Why this list exists at all: a Property row survives the scrub indefinitely, because the
 * public compliance log at /p/[publicSlug] has to keep resolving after the pool company
 * cancels. But that page reads only `name`, `propertyType`, `addressLine1`, `city`,
 * `region` and the parent Customer's `name` -- check app/p/[publicSlug]/page.tsx before
 * trusting that sentence. Everything below was being retained with no end date and no
 * purpose: four separate contact blocks (property manager, on-site maintenance, HOA
 * manager, residential owner), the directions for physically getting to the pool, and the
 * organization's free-text notes on the property.
 *
 * Several of these are worse than ordinary contact data. `accessNotes` is where a gate
 * code goes. The owner/manager blocks are a named individual's personal phone number and
 * email address, which under CPRA stay personal information for as long as they are held
 * -- and "we need it so a health inspector can scan a QR code" does not reach them.
 *
 * Tradeoff, so it is on the record: if an end customer later subscribes to AquaRunner
 * Compliance themselves, app/portal/subscribe/actions.ts MOVES these same Property rows
 * into their new organization, and they will arrive with the contact fields blank. That is
 * the property owner re-entering their own name and phone number once, which is not a
 * reason to hold everyone else's indefinitely.
 *
 * Deliberately NOT cleared: latitude/longitude/postalCode/geofenceMeters, which locate the
 * body of water the log belongs to rather than describing a person, and isHOA/hasDog, which
 * are property attributes with no contact value once the blocks above are gone.
 */
export const PROPERTY_FIELDS_CLEARED_ON_SCRUB = {
  reportEmail: null,
  managerName: null,
  managerBusinessPhone: null,
  managerMobilePhone: null,
  managerPhone: null,
  managerEmail: null,
  maintenanceName: null,
  maintenanceCellPhone: null,
  maintenanceEmail: null,
  hoaManagerName: null,
  hoaManagerPhone: null,
  hoaManagerEmail: null,
  ownerName: null,
  ownerMobilePhone: null,
  ownerHomePhone: null,
  ownerEmail: null,
  accessNotes: null,
  notes: null,
} as const;

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

    // Customer-facing (non-compliance) records. CustomerUser is deliberately NOT scrubbed
    // here -- it's kept (blocked via the org's own live planStatus check, see
    // lib/auth/customer-user.ts) so a canceled org's customers can still subscribe to
    // AquaRunner Compliance themselves and keep their compliance records/portal identity.
    deletedCounts.customerDocument = await scrub(dryRun, prisma.customerDocument, { customer: { organizationId } });
    deletedCounts.customerAlert = await scrub(dryRun, prisma.customerAlert, { customer: { organizationId } });

    // Staff logins.
    deletedCounts.user = await scrub(dryRun, prisma.user, { organizationId });

    deletedCounts.managementCompany = await scrub(dryRun, prisma.managementCompany, { organizationId });

    if (!dryRun) {
      await prisma.serviceVisit.updateMany({
        where: { organizationId },
        data: { technicianId: null, techNotes: null, arrivalLatitude: null, arrivalLongitude: null, arrivalAccuracyMeters: null },
      });
      await prisma.customer.updateMany({ where: { organizationId }, data: { notes: null, billingRef: null } });
      await prisma.property.updateMany({ where: { organizationId }, data: { ...PROPERTY_FIELDS_CLEARED_ON_SCRUB } });
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
