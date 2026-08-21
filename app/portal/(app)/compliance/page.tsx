import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { getOrganizationRuleset, isComplianceActive } from "@/lib/compliance";
import { SimpleMarkdown } from "@/lib/simple-markdown";

export default async function PortalCompliancePage() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    select: {
      organizationId: true,
      properties: { select: { propertyType: true }, take: 1, where: { propertyType: "COMMERCIAL" } },
    },
  });
  if (!customer) redirect("/portal/login");

  const hasCommercialPools = customer.properties.length > 0;
  const ruleset = await getOrganizationRuleset(customer.organizationId);
  const rulesetStateName = ruleset?.stateName ?? null;
  const active = isComplianceActive(ruleset);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-sm font-medium text-brand-ink">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Compliance reference</h1>
        <p className="mt-1 text-sm text-brand-muted">
          How your service company applies your state&rsquo;s health department rules to your pool/spa.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        {!hasCommercialPools ? (
          <div className="text-sm text-brand-muted">
            <p className="font-medium text-brand-ink">Not applicable for this account</p>
            <p className="mt-1">Compliance rules only apply to commercial pools/spas.</p>
          </div>
        ) : !active ? (
          <div className="text-sm text-brand-muted">
            <p className="font-medium text-brand-ink">
              {rulesetStateName
                ? `Compliance tracking for ${rulesetStateName} is coming soon`
                : "Your service company hasn't set a state yet"}
            </p>
            <p className="mt-1">
              Your service data is still being logged normally in the meantime. This page will populate once your
              service company&rsquo;s state rules are available.
            </p>
          </div>
        ) : (
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
        )}
      </section>

      <p data-tour="portal-compliance-section" className="mt-6 text-xs text-brand-muted">
        <Link href="/portal" className="text-brand-primary underline">
          Back to upcoming service days
        </Link>
      </p>
    </main>
  );
}
