import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { defaultTitle } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";
import { RouteProgress } from "@/components/route-progress";
import { I18nProvider } from "@/components/i18n";
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

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: `${env.siteName} — ${defaultTitle("meta.tagline")}`,
    template: `%s · ${env.siteName}`,
  },
  description:
    "A bold, immersive travel journal — stories, photo galleries and maps from the road.",
  openGraph: {
    type: "website",
    siteName: env.siteName,
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a0908",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh antialiased">
        <I18nProvider>
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <SiteChrome header={<SiteHeader />} footer={<SiteFooter />}>
            {children}
          </SiteChrome>
        </I18nProvider>
      </body>
    </html>
  );
}
