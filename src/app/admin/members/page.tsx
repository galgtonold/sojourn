import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/auth";
import { MembersManager } from "@/components/members-manager";
import { T } from "@/components/i18n";

export const metadata = { title: "Collaborators" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  if (!isSupabaseConfigured) redirect("/admin");
  const viewer = await getViewer();
  if (!viewer.isOwner) redirect("/admin");

  const supabase = await getServerSupabase();
  const [{ data: profiles }, { data: grants }, { data: trips }] =
    await Promise.all([
      supabase!.from("profiles").select("id, email, role"),
      supabase!.from("trip_members").select("trip_id, user_id"),
      supabase!
        .from("trips")
        .select("id, title")
        .order("start_date", { ascending: false }),
    ]);

  const members = (profiles ?? [])
    .filter((p) => p.role !== "owner")
    .map((p) => ({
      id: p.id as string,
      email: p.email as string | null,
      tripIds: (grants ?? [])
        .filter((g) => g.user_id === p.id)
        .map((g) => g.trip_id as string),
    }));

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="font-display text-4xl font-semibold">
        <T k="admin.members.heading" />
      </h1>
      <p className="mb-8 mt-2 text-sm text-sand-100/50">
        <T k="admin.members.subtitle" />
      </p>
      <MembersManager members={members} trips={trips ?? []} />
    </div>
  );
}
