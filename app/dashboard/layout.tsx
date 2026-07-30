import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { TechBottomNav } from "@/app/components/tech-bottom-nav";

function toYmd(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  let pastDue = false;
  if (!appUser.isPlatformAdmin) {
    const organization = await prisma.organization.findUnique({
      where: { id: appUser.organizationId },
      select: { planStatus: true },
    });
    if (organization?.planStatus === "CANCELED") redirect("/billing/expired");
    pastDue = organization?.planStatus === "PAST_DUE";
  }

  return (
    <>
      {pastDue ? (
        <div className="border-b border-brand-warn/40 bg-brand-warnFill px-4 py-2 text-center text-sm text-brand-warn">
          Your last payment failed.{" "}
          <a href="/dashboard/billing" className="font-medium underline">
            Update your billing info
          </a>{" "}
          to avoid an interruption.
        </div>
      ) : null}
      {/* Technician pages already reserve their own space for TechBottomNav (pb-24 per
          page); admin/office get the equivalent bottom nav from SideNav on mobile, which
          those pages were never built to leave room for, so pad it here instead of
          touching every page individually. */}
      {appUser.role === "TECHNICIAN" ? children : <div className="pb-20 md:pb-0">{children}</div>}
      {appUser.role === "TECHNICIAN" ? <TechBottomNav dateYmd={toYmd(new Date())} /> : null}
    </>
  );
}
