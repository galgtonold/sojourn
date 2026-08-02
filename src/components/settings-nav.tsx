"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { T } from "@/components/i18n";
import { SETTINGS_AREAS, activeSettingsArea } from "@/lib/settings-areas";

/** Tabs across the settings areas. Order and routes come from the registry, so
 *  adding an area is one entry there rather than an edit here and a guess at
 *  wherever the onboarding checklist happens to link. */
export function SettingsNav() {
  const pathname = usePathname() ?? "";
  const active = activeSettingsArea(pathname);

  return (
    /* Pills, matching the admin bar directly above it. The first version used
       underlined tabs — a second navigation idiom one level down from the
       first, in the same interface. */
    <nav className="mt-6 flex flex-wrap gap-0.5 text-sm">
      {SETTINGS_AREAS.map((area) => (
        <Link
          key={area.id}
          href={area.href}
          aria-current={area.id === active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 transition",
            area.id === active
              ? "bg-white/10 text-sand-50"
              : "text-sand-100/70 hover:bg-white/5 hover:text-sand-50",
          )}
        >
          <T k={area.label} />
        </Link>
      ))}
    </nav>
  );
}
