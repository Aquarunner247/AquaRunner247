import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "./components/top-nav";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";

export const metadata: Metadata = {
  title: "AquaRunner 24/7 Pro",
  description: "Commercial pool maintenance — scheduling, service logs, and SNHD-friendly records.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const appUser = user ? await getAppUserForAuthUser(user) : null;

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">
        <TopNav isLoggedIn={Boolean(user)} isAdmin={appUser?.role === "ADMIN"} />
        {children}
      </body>
    </html>
  );
}
