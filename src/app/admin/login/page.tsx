import { redirect } from "next/navigation";
import { getSetupState } from "@/lib/setup";
import LoginForm from "@/components/login-form";

// The setup check must run per request (it reads the live profiles table), and
// this page must never be baked at build time against whichever database the
// build happened to see.
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // A fresh install has nobody to sign in — send the deployer to first-run
  // setup instead. "unknown" (no service role / migrations missing) falls
  // through to the normal form so a manually-created admin can still sign in.
  if ((await getSetupState()) === "needs-setup") redirect("/admin/setup");
  return <LoginForm />;
}
