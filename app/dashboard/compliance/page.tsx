import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrganizationRuleset, isComplianceActive, organizationHasCommercialPools } from "@/lib/compliance";
import { SimpleMarkdown } from "@/lib/simple-markdown";

export default async function CompliancePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

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

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Admin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Compliance reference</h1>
        <p className="mt-1 text-sm text-slate-600">
          How AquaRunner applies your state&rsquo;s health department rules to closure-risk banners and the public
          inspector log.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {!hasCommercialPools ? (
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900">Not applicable for this account</p>
            <p className="mt-1">
              Compliance rules only apply to commercial pools. This account is set up for residential service, so
              there&rsquo;s no state rule engine to show here.
            </p>
          </div>
        ) : !organization?.state ? (
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900">Set your state to enable compliance tracking</p>
            <p className="mt-1">
              This account has commercial properties, but no state is set yet, so AquaRunner doesn&rsquo;t know which
              health department&rsquo;s rules to apply.{" "}
              <Link href="/dashboard/settings" className="text-[#0A5FA4] underline">
                Set it in Settings
              </Link>
              .
            </p>
          </div>
        ) : active ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">
                {ruleset.stateName}
                {ruleset.healthDepartmentName ? ` — ${ruleset.healthDepartmentName}` : ""}
              </p>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                Fully supported
              </span>
            </div>
            {ruleset.referenceContent ? (
              <SimpleMarkdown content={ruleset.referenceContent} className="mt-3" />
            ) : (
              <p className="mt-3 text-sm text-slate-500">No reference content written yet for this state.</p>
            )}
            {ruleset.codeReferenceLabel || ruleset.logSheetSourceLabel ? (
              <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
                {ruleset.codeReferenceLabel ? (
                  <p>
                    Code reference:{" "}
                    {ruleset.codeReferenceUrl ? (
                      <a href={ruleset.codeReferenceUrl} target="_blank" rel="noreferrer" className="text-[#0A5FA4] underline">
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
        ) : (
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900">
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
