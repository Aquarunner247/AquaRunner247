import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { OnboardingHelpContent } from "@/app/components/onboarding-help-content";

export default async function HelpPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  return (
    <main className="app-page-centered-md">
      <div className="app-page-head">
        <p className="app-kicker">Help</p>
        <h1 className="app-h1">Need a hand?</h1>
      </div>
      <div className="mt-6">
        <OnboardingHelpContent />
      </div>
    </main>
  );
}
