import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SideNav } from "./components/side-nav";
import { OnboardingCallBanner } from "./components/onboarding-call-banner";
import { ServiceWorkerRegister } from "./components/service-worker-register";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";
import { BRAND_INK } from "@/app/lib/chart-colors";

// Satoshi (display + body) isn't on Google Fonts, so it can't go through next/font/google
// like the fonts below -- it's loaded via Fontshare's own CDN instead (see the <link>
// tags in the returned JSX) and wired into --font-display/--font-body directly in
// globals.css. Fontshare is the font's own vendor-sanctioned hosting path (self-hosting
// the files is also permitted, but requires downloading them from fontshare.com by hand
// first -- this avoids that with no meaningful cost, same tradeoff Google Fonts already
// represents for the font below).
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
        select: { name: true, onboardingCallBookedAt: true, onboardingCallDeclinedAt: true },
      })
    : null;
  // Platform admins aren't a customer who signed up for the product -- never show them
  // an offer meant for someone stuck using it.
  const showOnboardingCallBanner =
    Boolean(appUser) &&
    !appUser?.isPlatformAdmin &&
    !organization?.onboardingCallBookedAt &&
    !organization?.onboardingCallDeclinedAt;

  return (
    <html lang="en" className={mono.variable}>
      <link rel="preconnect" href="https://api.fontshare.com" />
      <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
      <link href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap" rel="stylesheet" />
      <body className="min-h-screen bg-brand-foam font-[family-name:var(--font-body)] antialiased">
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
        <OnboardingCallBanner show={showOnboardingCallBanner} />
        <div className="md:flex">
          <SideNav
            isLoggedIn={Boolean(appUser)}
            role={appUser?.role ?? null}
            userName={appUser?.name ?? appUser?.email ?? null}
            orgName={organization?.name ?? null}
          />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
