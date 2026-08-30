import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ComplianceView } from "@/app/components/compliance-view";

const STAFF_ROLES_WITH_ACCESS = new Set(["ADMIN", "OFFICE", "TECHNICIAN"]);

export default async function CompliancePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!STAFF_ROLES_WITH_ACCESS.has(appUser.role)) redirect("/dashboard");

  return <ComplianceView appUser={appUser} settingsHref="/dashboard/settings" />;
}
