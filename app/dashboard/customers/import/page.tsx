import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { CustomerImportForm } from "./customer-import-form";

export default async function ImportCustomersPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  return (
    <main className="app-page-wide">
      <header className="app-page-head flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-kicker">Admin</p>
          <h1 className="app-h1">Import customers</h1>
          <p className="app-subhead">Bring in customers, properties, and their pool/spa in bulk from a CSV export.</p>
        </div>
        <Link href="/dashboard/customers" className="app-link">
          Back to customers
        </Link>
      </header>

      <div className="mt-6">
        <CustomerImportForm />
      </div>
    </main>
  );
}
