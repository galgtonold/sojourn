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
    <nav className="mt-8 flex flex-wrap gap-1 border-b border-white/10 pb-px">
      {SETTINGS_AREAS.map((area) => (
        <Link
          key={area.id}
          href={area.href}
          aria-current={area.id === active ? "page" : undefined}
          className={cn(
            "rounded-t-lg px-4 py-2.5 text-sm transition",
            area.id === active
              ? "border-b-2 border-ember-400 font-medium text-sand-50"
              : "border-b-2 border-transparent text-sand-100/60 hover:text-sand-50",
          )}
        >
          <T k={area.label} />
        </Link>
      ))}
    </nav>
  );
}
