"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";

export function SignOutButton() {
  const router = useRouter();
  const t = useT();

  async function signOut() {
    const supabase = getBrowserSupabase();
    await supabase?.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/80 transition hover:border-white/25"
    >
      <LogOut className="size-4" /> {t("admin.signOut")}
    </button>
  );
}
