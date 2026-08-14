import type { Metadata, Viewport } from "next";
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

// Fonts are declared in ./fonts.css and served from public/fonts, not fetched
// from Google during the build. The @font-face rules there were lifted out of a
// next/font/google build, so nothing about the typography changed — only where
// the bytes come from. The reasoning for the subset split, which is load-bearing
// rather than an optimisation, lives with the rules.
//
// The two Latin subsets are preloaded below because next/font is no longer here
// to emit the link tags: every page uses both (body text and headings), so they
// are wanted immediately rather than after the CSS has been parsed. The other
// five files carry Greek, Cyrillic and Vietnamese and are fetched only if a page
// actually contains those characters — that is what unicode-range is for.
const PRELOADED_FONTS = [
  "/fonts/inter-latin.woff2",
  "/fonts/inter-latin-ext.woff2",
  "/fonts/fraunces-latin.woff2",
  "/fonts/fraunces-latin-ext.woff2",
];

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
    <html lang={DEFAULT_LOCALE}>
      <head>
        {PRELOADED_FONTS.map((href) => (
          <link
            key={href}
            rel="preload"
            href={href}
            as="font"
            type="font/woff2"
            // Fonts are always fetched anonymously, even same-origin. Without
            // this the preload is made with different credentials mode than the
            // CSS request that follows, the two do not match, and the file is
            // downloaded twice — a preload that costs bandwidth instead of
            // saving it, and one the console warns about.
            crossOrigin="anonymous"
          />
        ))}
      </head>
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
