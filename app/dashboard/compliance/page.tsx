import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrganizationRuleset, isComplianceActive, organizationHasCommercialPools } from "@/lib/compliance";
import { SimpleMarkdown } from "@/lib/simple-markdown";

const STAFF_ROLES_WITH_ACCESS = new Set(["ADMIN", "OFFICE", "TECHNICIAN"]);

export default async function CompliancePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!STAFF_ROLES_WITH_ACCESS.has(appUser.role)) redirect("/dashboard");
  const isAdmin = appUser.role === "ADMIN";

  const [organization, ruleset] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: appUser.organizationId },
      select: { state: true, hasCommercialPools: true },
    }),
    getOrganizationRuleset(appUser.organizationId),
  ]);

  const rulesetStateName = ruleset?.stateName ?? null;
  const active = isComplianceActive(ruleset);
  const hasCommercialPools = await organizationHasCommercialPools(appUser.organizationId, organization?.hasCommercialPools ?? null);

  // Not every unsupported state is "not built yet" -- a few (Idaho, Mississippi) have a
  // confirmed regulatory vacuum, not a pending feature. This is ComplianceRuleset's own
  // explicit hasNoLegalRequirement flag, not inferred from data presence -- these two
  // states DO carry real ChemistryThreshold rows now (CDC MAHC advisory reference values,
  // optional for technicians to log against), so "has any data" stopped being a reliable
  // signal for this the moment that data was seeded.
  const gapNotes =
    ruleset != null && !ruleset.isSupported && ruleset.hasNoLegalRequirement
      ? await prisma.complianceNote.findMany({
          where: { complianceRulesetId: ruleset.id, kind: "GAP" },
          select: { summary: true },
        })
      : [];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Compliance</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Compliance reference</h1>
        <p className="mt-1 text-sm text-brand-muted">
          How AquaRunner applies your state&rsquo;s health department rules to closure-risk banners and the public
          inspector log.
        </p>
      </header>

      <section data-tour="compliance-rules" className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        {!hasCommercialPools ? (
          <div className="text-sm text-brand-muted">
            <p className="font-medium text-brand-ink">Not applicable for this account</p>
            <p className="mt-1">
              Compliance rules only apply to commercial pools. This account is set up for residential service, so
              there&rsquo;s no state rule engine to show here.
            </p>
          </div>
        ) : !organization?.state ? (
          <div className="text-sm text-brand-muted">
            <p className="font-medium text-brand-ink">Set your state to enable compliance tracking</p>
            <p className="mt-1">
              This account has commercial properties, but no state is set yet, so AquaRunner doesn&rsquo;t know which
              health department&rsquo;s rules to apply.{" "}
              {isAdmin ? (
                <>
                  <Link href="/dashboard/settings" className="app-link">
                    Set it in Settings
                  </Link>
                  .
                </>
              ) : (
                "Ask an admin to set it in Settings."
              )}
            </p>
          </div>
        ) : active ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-brand-ink">
                {ruleset.stateName}
                {ruleset.healthDepartmentName ? ` — ${ruleset.healthDepartmentName}` : ""}
              </p>
              <span className="app-pill-good">Fully supported</span>
            </div>
            {ruleset.referenceContent ? (
              <SimpleMarkdown content={ruleset.referenceContent} className="mt-3" />
            ) : (
              <p className="mt-3 text-sm text-brand-muted">No reference content written yet for this state.</p>
            )}
            {ruleset.codeReferenceLabel || ruleset.logSheetSourceLabel ? (
              <div className="mt-6 border-t border-brand-border pt-4 text-xs text-brand-muted">
                {ruleset.codeReferenceLabel ? (
                  <p>
                    Code reference:{" "}
                    {ruleset.codeReferenceUrl ? (
                      <a href={ruleset.codeReferenceUrl} target="_blank" rel="noreferrer" className="app-link">
                        {ruleset.codeReferenceLabel}
                      </a>
                    ) : (
                      ruleset.codeReferenceLabel
                    )}
                  </p>
                ) : null}
                {ruleset.logSheetSourceLabel ? (
                  <p className="mt-1">
                    Log sheet source: {ruleset.logSheetSourceLabel}
                    {ruleset.logSheetSourceNotes ? ` — ${ruleset.logSheetSourceNotes}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : gapNotes.length > 0 ? (
          <div className="text-sm text-brand-muted">
            <p className="font-medium text-brand-ink">
              {rulesetStateName ?? organization?.state ?? "Your state"} has no state-level pool chemistry regulation
            </p>
            <p className="mt-1">
              This isn&rsquo;t a feature we haven&rsquo;t built yet — there&rsquo;s no state code for AquaRunner to apply, so
              closure-risk banners and the inspector log aren&rsquo;t available for this reason specifically. Your
              service data is still being logged normally, and technicians can optionally log against CDC Model
              Aquatic Health Code reference values on the visit chemistry form — not a legal requirement, just a
              commonly-used national standard to track against.
            </p>
            <div className="mt-3 space-y-2 border-t border-brand-border pt-3">
              {gapNotes.map((n, i) => (
                <p key={i}>{n.summary}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-brand-muted">
            <p className="font-medium text-brand-ink">
              Compliance tracking for {rulesetStateName ?? organization?.state ?? "your state"} is coming soon
            </p>
            <p className="mt-1">
              Your service data is still being logged normally in the meantime. Closure-risk banners, the public QR
              inspector log, and this reference page will populate automatically once we&rsquo;ve built out your
              state&rsquo;s rules.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
