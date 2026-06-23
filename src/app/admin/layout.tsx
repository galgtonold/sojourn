import { getViewer } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";

// Wraps every /admin/* page with the persistent admin nav. The nav itself hides
// on the auth flows and the post preview; owner-only sections are gated by role.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  return (
    <>
      <AdminNav isOwner={viewer.isOwner} />
      {children}
    </>
  );
}
