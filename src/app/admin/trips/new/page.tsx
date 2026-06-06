import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TripEditor } from "@/components/trip-editor";
import { getViewer } from "@/lib/auth";
import { T } from "@/components/i18n";

export const metadata = { title: "New trip" };
export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const viewer = await getViewer();
  if (!viewer.isOwner) redirect("/admin");
  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="mb-8 font-display text-4xl font-semibold">
        <T k="admin.trip.newTrip" />
      </h1>
      <TripEditor />
    </div>
  );
}
