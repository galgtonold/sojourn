import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { SettingsNav } from "@/components/settings-nav";
import { T, DocumentTitle } from "@/components/i18n";

// The chrome every settings area shares: the owner gate, the way back, and the
// tabs. Gating here rather than in each page means a new area cannot forget it.
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer.isOwner) redirect("/admin");

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <DocumentTitle k="admin.settings.title" />
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>

      <h1 className="font-display text-4xl font-semibold">
        <T k="admin.settings.title" />
      </h1>
      <SettingsNav />
      <div className="mt-10">{children}</div>
    </div>
  );
}
