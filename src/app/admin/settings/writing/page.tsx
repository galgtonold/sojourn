import { getServerSupabase } from "@/lib/supabase/server";
import { readAiSecrets } from "@/lib/ai-config";
import { readAiEnv, resolveAiConfig } from "@/lib/ai-config-fields";
import { WritingStyleForm } from "@/components/writing-style-form";
import { T } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.nav.writing") };
export const dynamic = "force-dynamic";

// The author's voice, on its own page.
//
// It sat beside the API keys for a day, because AI drafts are what read it.
// That dependency is real and it was still the wrong grouping: how you want to
// sound is a personal thing, and putting it next to secret tokens made it look
// like plumbing. The AI config is still read here — only to tell you when the
// guide has nothing to act on yet.
export default async function WritingSettingsPage() {
  const supabase = await getServerSupabase();
  const [aiDb, { data }] = await Promise.all([
    readAiSecrets(),
    supabase!.from("site_settings").select("writing_style").eq("id", 1).maybeSingle(),
  ]);
  const aiCfg = resolveAiConfig(aiDb, readAiEnv());

  return (
    <>
      <h2 className="font-display text-3xl font-semibold">
        <T k="admin.settings.styleHeading" />
      </h2>
      <p className="mt-2 max-w-2xl text-sand-100/60">
        <T k="admin.settings.styleIntro" />
      </p>
      <div className="mt-8">
        <WritingStyleForm
          initial={(data?.writing_style as string) ?? ""}
          aiConfigured={aiCfg.isAiConfigured}
        />
      </div>
    </>
  );
}
