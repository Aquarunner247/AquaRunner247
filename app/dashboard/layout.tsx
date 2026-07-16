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
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Your last payment failed.{" "}
          <a href="/dashboard/billing" className="font-medium underline">
            Update your billing info
          </a>{" "}
          to avoid an interruption.
        </div>
      ) : null}
      {children}
      {appUser.role === "TECHNICIAN" ? <TechBottomNav dateYmd={toYmd(new Date())} /> : null}
    </>
  );
}
