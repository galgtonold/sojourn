import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadInteractionAnalytics } from "@/lib/db/interactions-admin";
import { InteractionsAnalytics } from "@/components/interactions-analytics";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.interactions") };
export const dynamic = "force-dynamic";

export default async function InteractionsAdminPage() {
  const items = await loadInteractionAnalytics();

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.interactions" />
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="mb-2 font-display text-4xl font-semibold">
        <T k="admin.interactions.title" />
      </h1>
      <p className="mb-8 text-sm text-sand-100/50">
        <T k="admin.interactions.subtitle" />
      </p>

      <InteractionsAnalytics items={items} />
    </div>
  );
}
