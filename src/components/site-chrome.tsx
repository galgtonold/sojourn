"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Hides the global header/footer on full-screen immersive routes (the journey
// map), where the page provides its own navigation.
const IMMERSIVE = /^\/trips\/[^/]+\/map\/?$/;

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const immersive = IMMERSIVE.test(pathname);

  return (
    <>
      {!immersive && header}
      <main>{children}</main>
      {!immersive && footer}
    </>
  );
}
