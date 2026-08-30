import { redirect } from "next/navigation";
import { getCurrentCustomerPortalAccessState } from "@/lib/auth/current-customer-user";
import { PortalNav } from "../components/portal-nav";
import { PortalOnboardingTourLauncher } from "@/app/components/portal-onboarding-tour-launcher";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentCustomerPortalAccessState();
  if (access.status === "none") redirect("/portal/login?error=no-access");
  if (access.status === "converted") redirect("/login");
  if (access.status === "blocked") redirect("/portal/subscribe");
  const customerUser = access.customerUser;

  return (
    <div className="min-h-screen bg-brand-surface md:flex">
      <PortalNav />
      <div className="min-w-0 flex-1">{children}</div>
      <PortalOnboardingTourLauncher seenPages={customerUser.seenTourPages} />
    </div>
  );
}
