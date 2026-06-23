import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { getBranding } from "@/lib/branding";
import { defaultTitle } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";
import { RouteProgress } from "@/components/route-progress";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { I18nProvider } from "@/components/i18n";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { name, tagline } = await getBranding();
  return {
    metadataBase: new URL(env.siteUrl),
    title: {
      // Metadata is rendered server-side in the default locale.
      default: `${name} — ${tagline.de || defaultTitle("meta.tagline")}`,
      template: `%s · ${name}`,
    },
    description:
      "A bold, immersive travel journal — stories, photo galleries and maps from the road.",
    openGraph: {
      type: "website",
      siteName: name,
    },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0908",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { name, tagline, heroLead, heroAccent, kicker } = await getBranding();
  const brand = { tagline, heroLead, heroAccent, kicker };
  return (
    <html lang="de" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh antialiased">
        <I18nProvider siteName={name} brand={brand}>
          <ServiceWorkerRegistrar />
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <ConfirmProvider>
            <SiteChrome header={<SiteHeader />} footer={<SiteFooter name={name} />}>
              {children}
            </SiteChrome>
          </ConfirmProvider>
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
