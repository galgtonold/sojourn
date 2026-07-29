import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { getBranding } from "@/lib/branding";
import { defaultTitle, DEFAULT_LOCALE } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";
import { RouteProgress } from "@/components/route-progress";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { I18nProvider } from "@/components/i18n";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { DemoBanner } from "@/components/demo-banner";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// `latin-ext` alongside `latin` because this is a travel journal: Hokkaidō,
// Kraków, Košice, Tromsø's neighbours. Latin Extended-A (ō ā ē ū š ž ł ő ą) is
// NOT in the `latin` subset, and without it the browser drops to a fallback
// face mid-word — which is how "Hokkaidō" came out with its macron sitting over
// the comma. Costs nothing on pages that don't need it: next/font emits one
// @font-face per subset with its own unicode-range, so the extended file is
// only fetched when an extended character is actually on the page.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
  // No `axes` — deliberately.
  //
  // `axes: ["opsz"]` used to be set here to keep SOFT/WONK out of the payload,
  // but the build Google returns for that combination has broken mark
  // positioning: every Latin Extended letter followed by another character
  // rendered its diacritic over the NEXT glyph, which is how "Hokkaidō," came
  // out with the macron over the comma. Measured on the rendered pixels — the
  // same file requested with the default axis, or with opsz *and* wght, places
  // the mark correctly, so it is that specific build and not the font.
  //
  // Dropping the option asks for the weight axis alone, which is smaller than
  // what was here before, not larger. The cost is `font-optical-sizing: auto`
  // in globals.css becoming a no-op — a subtlety worth losing to have accents
  // land on the right letter.
});

export async function generateMetadata(): Promise<Metadata> {
  const { name, tagline } = await getBranding();
  return {
    metadataBase: new URL(env.siteUrl),
    title: {
      // Metadata is rendered server-side in the default locale.
      default: `${name} — ${tagline[DEFAULT_LOCALE] || defaultTitle("meta.tagline")}`,
      template: `%s · ${name}`,
    },
    description:
      "A bold, immersive travel journal — stories, photo galleries and maps from the road.",
    openGraph: {
      type: "website",
      siteName: name,
      locale: "de_DE",
    },
    twitter: {
      card: "summary_large_image",
    },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0908",
  // The site ships a single, dark palette. Declaring the scheme (this emits
  // <meta name="color-scheme" content="dark">, read during navigation before CSS
  // parses) stops Android Chrome's "auto dark theme" from force-darkening an
  // already-dark page — which was recolouring the map number badges, boxes and
  // buttons. Pairs with `:root { color-scheme: dark }` in globals.css.
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { name, tagline, heroLead, heroAccent, kicker } = await getBranding();
  const brand = { tagline, heroLead, heroAccent, kicker };
  return (
    <html lang={DEFAULT_LOCALE} className={`${inter.variable} ${fraunces.variable}`}>
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
          <DemoBanner />
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
