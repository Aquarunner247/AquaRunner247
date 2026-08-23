import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Inter, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SideNav } from "./components/side-nav";
import { ServiceWorkerRegister } from "./components/service-worker-register";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";
import { BRAND_INK } from "@/app/lib/chart-colors";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  // Next's curated font-metrics database doesn't include Big Shoulders, so automatic
  // fallback-metric adjustment always fails with a console warning. Disabling it trades
  // away that auto CLS-mitigation for this one font in exchange for a clean build/dev log.
  adjustFontFallback: false,
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
  description: "Commercial pool maintenance — scheduling, service logs, and health-department-friendly records.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_INK,
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
  const organization = appUser
    ? await prisma.organization.findUnique({
        where: { id: appUser.organizationId },
        select: { name: true },
      })
    : null;

  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-brand-foam font-[family-name:var(--font-body)] antialiased md:flex">
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-T91TBD4WF1" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-T91TBD4WF1');
          `}
        </Script>
        <ServiceWorkerRegister />
        <SideNav
          isLoggedIn={Boolean(appUser)}
          role={appUser?.role ?? null}
          userName={appUser?.name ?? appUser?.email ?? null}
          orgName={organization?.name ?? null}
        />
        <div className="min-w-0 flex-1">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
