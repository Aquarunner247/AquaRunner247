import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ComplianceView } from "@/app/components/compliance-view";

export default async function CpoCompliancePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  // No dedicated /cpo settings page yet -- state is already captured at signup for this
  // product, so this link only matters in the rare edge case where it's missing.
  return <ComplianceView appUser={appUser} settingsHref="/cpo" />;
}
