import { redirect } from "next/navigation";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { PortalNav } from "../components/portal-nav";
import { PortalOnboardingTourLauncher } from "@/app/components/portal-onboarding-tour-launcher";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login?error=no-access");

  return (
    <div className="min-h-screen bg-brand-surface md:flex">
      <PortalNav />
      <div className="min-w-0 flex-1">{children}</div>
      <PortalOnboardingTourLauncher tourSeen={Boolean(customerUser.onboardingTourSeenAt)} />
    </div>
  );
}
