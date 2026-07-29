"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * The last resort: an error thrown by the root layout itself, before any of the
 * app's own chrome exists. It has to render its own <html> and <body>, and it
 * cannot use the i18n provider, the fonts or the design tokens — none of them
 * have mounted — so the styling is inline and the copy is English only.
 *
 * Its real job is reporting. Sentry warned on every single build that React
 * render errors could not be captured without this file, which meant the one
 * class of failure that takes the whole site down was also the one class that
 * never reached the dashboard.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0a0908",
          color: "#f2ebe0",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>
            Something went badly wrong
          </h1>
          <p style={{ margin: "0.75rem 0 1.75rem", opacity: 0.75 }}>
            The page couldn&apos;t be displayed. Reloading usually helps.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              background: "#f56a1f",
              color: "#0a0908",
              fontWeight: 600,
              fontSize: "0.875rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "9999px",
              textDecoration: "none",
            }}
          >
            Reload the site
          </a>
          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                opacity: 0.5,
              }}
            >
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
