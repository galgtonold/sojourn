import { redirect } from "next/navigation";
import { getSetupState } from "@/lib/setup";
import SetupForm from "@/components/setup-form";

// First-run setup: claim the owner account on a fresh install. Once an owner
// exists this page is a tombstone (permanent redirect to login); the atomic
// guard lives in /api/setup, not here — this check is only UX.
export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  const state = await getSetupState();
  if (state === "configured") redirect("/admin/login");
  return <SetupForm notReady={state === "unknown"} />;
}
