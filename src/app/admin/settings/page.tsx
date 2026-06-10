import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { isAiConfigured, isSupabaseConfigured } from "@/lib/env";
import { WritingStyleForm } from "@/components/writing-style-form";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.title") };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured) redirect("/admin");
  const viewer = await getViewer();
  if (!viewer.isOwner) redirect("/admin");

  const supabase = await getServerSupabase();
  const { data } = await supabase!
    .from("site_settings")
    .select("writing_style")
    .eq("id", 1)
    .maybeSingle();

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
        <T k="admin.settings.styleHeading" />
      </h1>
      <p className="mt-2 max-w-2xl text-sand-100/60">
        <T k="admin.settings.styleIntro" />
      </p>
      <div className="mt-8">
        <WritingStyleForm
          initial={(data?.writing_style as string) ?? ""}
          aiConfigured={isAiConfigured}
        />
      </div>
    </div>
  );
}
