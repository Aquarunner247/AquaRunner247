import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SideNav } from "./components/side-nav";
import { OnboardingCallBanner } from "./components/onboarding-call-banner";
import { ServiceWorkerRegister } from "./components/service-worker-register";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";
import { BRAND_INK } from "@/app/lib/chart-colors";

// Satoshi (display + body) isn't on Google Fonts, so it can't go through next/font/google
// like the font below -- self-hosted instead via next/font/local, using the actual woff2
// files pulled from Fontshare's CDN once (public/fonts/satoshi/) rather than a Fontshare
// <link>/stylesheet fetched fresh on every visit. Wired into --font-display/--font-body
// through this font's own --font-satoshi variable in globals.css, same pattern as
// --font-mono below.
const satoshi = localFont({
  src: [
    { path: "../public/fonts/satoshi/satoshi-300.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/satoshi/satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/satoshi/satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/satoshi/satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/satoshi/satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
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
  // Set by middleware.ts alongside the Content-Security-Policy response header -- passed
  // to the two <Script> tags below so they're allowed under the nonce-based script-src
  // instead of needing 'unsafe-inline'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

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
    <html lang="en" className={`${satoshi.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-brand-foam font-[family-name:var(--font-body)] antialiased">
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-T91TBD4WF1" strategy="afterInteractive" nonce={nonce} />
        <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>
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
        <SpeedInsights />
      </body>
    </html>
  );
}
