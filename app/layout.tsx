import type { Metadata } from "next";
import { Big_Shoulders, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SideNav } from "./components/side-nav";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-[#EAF6FA] font-[family-name:var(--font-body)] antialiased md:flex">
        <SideNav isLoggedIn={Boolean(user)} isAdmin={appUser?.role === "ADMIN"} />
        <div className="min-w-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
