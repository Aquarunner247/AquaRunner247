import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { PlacardPicker } from "./placard-picker";

export default async function PlacardsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  // Same gate the individual placard page (app/p/[publicSlug]/placard) already enforces --
  // residential has no public QR log at all, and an org whose state ruleset isn't active
  // yet has no compliance log for a placard to point at, so neither is worth listing here.
  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { complianceRuleset: { select: { isSupported: true } } },
  });
  const rulesetActive = org?.complianceRuleset?.isSupported ?? false;

  const properties = rulesetActive
    ? (
        await prisma.property.findMany({
          where: { organizationId: appUser.organizationId, propertyType: { not: "RESIDENTIAL" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, bodiesOfWater: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
        })
      ).filter((p) => p.bodiesOfWater.length > 0)
    : [];

  return (
    <main className="app-page-wide">
      <header className="app-page-head flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-kicker">Admin</p>
          <h1 className="app-h1">Print placards</h1>
          <p className="app-subhead">Select any number of aquatic venues and print all their QR placards in one batch.</p>
        </div>
        <Link href="/dashboard/customers" className="app-link">
          Back to customers
        </Link>
      </header>

      {!rulesetActive ? (
        <p className="app-card-inset mt-6 text-sm text-brand-muted">
          Placards aren&rsquo;t available yet — your account&rsquo;s state compliance ruleset isn&rsquo;t active. Contact support to
          get it set up.
        </p>
      ) : properties.length === 0 ? (
        <p className="app-card-inset mt-6 text-sm text-brand-muted">No commercial aquatic venues to print placards for yet.</p>
      ) : (
        <div className="mt-6">
          <PlacardPicker properties={properties} />
        </div>
      )}
    </main>
  );
}
