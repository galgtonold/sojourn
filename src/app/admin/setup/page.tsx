import { redirect } from "next/navigation";
import { getSetupState, getClaimWindow } from "@/lib/setup";
import SetupForm, { type SetupMode } from "@/components/setup-form";

// First-run setup: claim the owner account on a fresh install. Once an owner
// exists this page is a tombstone (permanent redirect to login); the atomic
// guard and the window check both live in /api/setup, not here — this only
// decides what to show.
export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  const state = await getSetupState();
  if (state === "configured") redirect("/admin/login");

  let mode: SetupMode = "claim";
  if (state === "unknown") {
    mode = "not-ready";
  } else if ((await getClaimWindow()) === "expired") {
    mode = "expired";
  }
  return <SetupForm mode={mode} />;
}
