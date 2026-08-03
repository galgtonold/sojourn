import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { getBranding, getAnalyticsProvider } from "@/lib/branding";
import { defaultTitle, DEFAULT_LOCALE } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";
import { RouteProgress } from "@/components/route-progress";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { I18nProvider } from "@/components/i18n";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { DemoBanner } from "@/components/demo-banner";
import { SiteAnalytics } from "@/components/site-analytics";
import { publicConfigFromEnv, publicConfigScript } from "@/lib/public-config";
import "./globals.css";

// `latin-ext` alongside `latin` because this is a travel journal: Hokkaidō,
// Kraków, Košice, Tromsø's neighbours. Latin Extended-A (ō ā ē ū š ž ł ő ą) is
// NOT in the `latin` subset.
//
// Without it the browser has to source those letters from the fallback while
// their neighbours come from Fraunces, and the mark stops riding on its base:
// measured at 100px, `ō` came out 4px WIDER than `o`, the macron taking an
// advance of its own and landing on the following character. That is how
// "Hokkaidō," rendered with the macron over the comma. With the subset present
// `ō` and `o` measure identically — one composed glyph — for every accent the
// site is likely to meet.
//
// Costs nothing on pages that don't need it: next/font emits one @font-face per
// subset with its own unicode-range, so the extended file is only fetched when
// an extended character is actually on the page.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
  // Only the optical-size axis is used; SOFT/WONK were never referenced and just
  // enlarged the variable-font payload. (Checked while chasing the macron above:
  // this build composes accented glyphs correctly, so it is not implicated.)
  axes: ["opsz"],
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
  const [{ name, tagline, heroLead, heroAccent, kicker }, analytics] =
    await Promise.all([getBranding(), getAnalyticsProvider()]);
  const brand = { tagline, heroLead, heroAccent, kicker };
  return (
    <html lang={DEFAULT_LOCALE} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh antialiased">
        {/*
          The browser's Supabase URL and key, read from this server's own
          environment at request time and handed over before any bundle loads.
          First child of <body> deliberately: it has to run before the framework
          scripts that pull in @/lib/env.

          Without it those values would be whatever was inlined when the app was
          BUILT, which is fine when you build your own deployment and wrong the
          moment anyone runs a prebuilt image. See @/lib/public-config.
        */}
        <script
          id="sojourn-config"
          dangerouslySetInnerHTML={{
            __html: publicConfigScript(publicConfigFromEnv(process.env)),
          }}
        />
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
        <SiteAnalytics provider={analytics} />
      </body>
    </html>
  );
}
