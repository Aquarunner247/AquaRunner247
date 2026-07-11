import { redirect } from "next/navigation";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { PortalNav } from "../components/portal-nav";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login?error=no-access");

  return (
    <div className="min-h-screen bg-[#EAF6FA] md:flex">
      <PortalNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
