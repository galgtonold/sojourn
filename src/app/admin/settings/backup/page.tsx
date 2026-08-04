import { getAdminSupabase } from "@/lib/supabase/admin";
import { BackupPanel } from "@/components/backup-panel";
import { T } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.nav.backup") };
// Whether this site is empty decides what the page offers, and it changes the
// moment the owner writes anything.
export const dynamic = "force-dynamic";

/**
 * Take a copy of everything, or rebuild a new site from one.
 *
 * There is deliberately no "restore over the top". Merging two journals means
 * guessing what happens to two posts with the same slug; overwriting means a
 * button that destroys someone's writing, reachable over HTTP. Importing only
 * into an empty site makes the dangerous case unreachable instead of guarded —
 * and still covers both occasions anyone actually needs it: moving hosts, and
 * rebuilding after a loss.
 */
export default async function BackupSettingsPage() {
  const admin = getAdminSupabase();
  // Two queries rather than one count: `limit(1)` is plain PostgREST and asks
  // exactly the question — is there anything here at all.
  const [posts, trips] = admin
    ? await Promise.all([
        admin.from("posts").select("id").limit(1),
        admin.from("trips").select("id").limit(1),
      ])
    : [{ data: [] }, { data: [] }];
  const isEmpty =
    (posts.data?.length ?? 0) === 0 && (trips.data?.length ?? 0) === 0;

  return (
    <div>
      <h1 className="sr-only">
        <T k="admin.settings.backup.title" />
      </h1>
      <p className="mb-8 text-sm text-sand-100/70">
        <T k="admin.settings.backup.lead" />
      </p>
      <BackupPanel isEmpty={isEmpty} />
    </div>
  );
}
