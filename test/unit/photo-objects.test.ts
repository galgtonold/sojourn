import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

// Deleting the row is not deleting the photograph.
//
// `photos.post_id` cascades, so removing an entry removed its photo ROWS and
// nothing else. The bucket's read policy is `using (bucket_id = 'photos')` with
// no row to consult, so every file kept serving at the URL already baked into
// the page HTML that caches and feed readers saw. On a travel journal a delete
// is often *because* the picture should go.
//
// The single-photo button did try, from the browser, and discarded the result —
// and 0043 had narrowed the bucket's delete policy to is_owner(), so for every
// collaborator it removed the row, left the file, and reported success.

const removed = vi.hoisted(() => ({ batches: [] as string[][], fail: false }));
const admin = vi.hoisted(() => ({ client: null as unknown }));
const logged = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@/lib/log", () => ({
  logError: (scope: string) => logged.calls.push(scope),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => {
    if (!admin.client) return null;
    return Object.assign(admin.client as object, {
      storage: {
        from: () => ({
          remove: (keys: string[]) => {
            removed.batches.push(keys);
            return Promise.resolve({
              error: removed.fail ? { message: "denied" } : null,
            });
          },
        }),
      },
    });
  },
}));

import { removePhotoObjects, photoPathsForPost } from "@/lib/photo-objects";

beforeEach(() => {
  removed.batches = [];
  removed.fail = false;
  logged.calls = [];
  admin.client = makeFakeSupabase({
    photos: [
      { id: "p1", post_id: "post-1", storage_path: "post-1/a.jpg" },
      { id: "p2", post_id: "post-1", storage_path: "post-1/b.jpg" },
      { id: "p3", post_id: "post-1", storage_path: null },
      { id: "p4", post_id: "post-2", storage_path: "post-2/c.jpg" },
    ],
  });
});

describe("collecting a post's objects", () => {
  it("returns only this post's stored paths", async () => {
    const paths = await photoPathsForPost("post-1");
    expect(paths.sort()).toEqual(["post-1/a.jpg", "post-1/b.jpg"]);
  });

  it("skips rows with no stored object", async () => {
    // A photo added by URL rather than upload has no file to remove.
    const paths = await photoPathsForPost("post-1");
    expect(paths).not.toContain(null);
    expect(paths).toHaveLength(2);
  });

  it("is empty without a service-role key rather than throwing", async () => {
    admin.client = null;
    expect(await photoPathsForPost("post-1")).toEqual([]);
  });
});

describe("removing the objects", () => {
  it("removes every path in one call", async () => {
    await removePhotoObjects(["a.jpg", "b.jpg"]);
    expect(removed.batches).toEqual([["a.jpg", "b.jpg"]]);
  });

  it("ignores blanks and de-duplicates", async () => {
    await removePhotoObjects(["a.jpg", null, "a.jpg", undefined, ""]);
    expect(removed.batches).toEqual([["a.jpg"]]);
  });

  it("does not call the bucket when there is nothing to remove", async () => {
    const r = await removePhotoObjects([null, undefined]);
    expect(removed.batches).toEqual([]);
    expect(r).toEqual({ removed: 0, failed: false });
  });

  it("reports and logs a refusal instead of losing it", async () => {
    // The old code discarded this, which is why nobody knew every member's
    // deletions were orphaning files.
    removed.fail = true;
    const r = await removePhotoObjects(["a.jpg"]);
    expect(r.failed).toBe(true);
    expect(logged.calls).toContain("storage.remove");
  });

  it("says so when there is no service-role key to remove them with", async () => {
    admin.client = null;
    const r = await removePhotoObjects(["a.jpg"]);
    expect(r.failed).toBe(true);
    expect(logged.calls).toContain("storage.orphaned");
  });
});
