import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { BillingView } from "@/app/components/billing-view";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function CpoBillingPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const params = (await searchParams) ?? {};

  return <BillingView organizationId={appUser.organizationId} error={params.error} />;
}
