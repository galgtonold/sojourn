// The pure shape logic behind comment moderation: the delete cascade, the
// group-by-post arrangement, and the per-level child filter/sort. Lifted out of
// comment-moderation.tsx (a client component, excluded from coverage) because
// these three are the fiddly, regression-prone bits — the reparenting of an
// orphaned reply and the depth-flipped sort especially — and they're pure, so
// they test without a DOM. The component keeps the fetch + optimistic setState.
//
// Each function is generic over a minimal structural row so the lib never
// depends on the component's full ModerationRow.

type TreeRow = { id: string; parent_id: string | null };

// Every id in the subtree rooted at `rootId` (the root itself + all
// descendants), for the optimistic local removal that mirrors the DB's
// cascade delete. A single pass builds parent→children adjacency, then a DFS
// walks it — no fixpoint scan, and cycles (which shouldn't exist) can't loop.
export function collectSubtree<T extends TreeRow>(
  rows: T[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parent_id === null) continue;
    const siblings = childrenByParent.get(r.parent_id);
    if (siblings) siblings.push(r.id);
    else childrenByParent.set(r.parent_id, [r.id]);
  }
  const subtree = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of childrenByParent.get(id) ?? []) {
      if (!subtree.has(child)) {
        subtree.add(child);
        stack.push(child);
      }
    }
  }
  return subtree;
}

type PostRow = { post_slug: string; post_title: string; created_at: string };
type PostGroup<T> = { title: string; slug: string; rows: T[] };

const latest = (createdAts: string[]): string =>
  createdAts.reduce((m, c) => (c > m ? c : m), "");

// Group comments by their post, most-recently-active post first. Rows keep
// their incoming order within a group (the tree, not this, decides display
// order).
export function groupByPost<T extends PostRow>(rows: T[]): PostGroup<T>[] {
  const byPost = new Map<string, PostGroup<T>>();
  for (const r of rows) {
    const g = byPost.get(r.post_slug) ?? {
      title: r.post_title,
      slug: r.post_slug,
      rows: [],
    };
    g.rows.push(r);
    byPost.set(r.post_slug, g);
  }
  return [...byPost.values()].sort((a, b) =>
    latest(b.rows.map((r) => r.created_at)).localeCompare(
      latest(a.rows.map((r) => r.created_at)),
    ),
  );
}

type ThreadRow = { id: string; parent_id: string | null; created_at: string };

// The direct children of `parentId` within `rows`, sorted for display. Two
// rules that are easy to break by hand:
//   1. A reply whose parent isn't in this set (e.g. the parent was filtered
//      out) is re-homed as a top-level comment, so it never vanishes.
//   2. Top-level threads sort newest-first; replies sort oldest-first, reading
//      like a conversation.
export function childrenOf<T extends ThreadRow>(
  rows: T[],
  parentId: string | null,
  depth: number,
): T[] {
  const ids = new Set(rows.map((r) => r.id));
  return rows
    .filter((r) => {
      const effective = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null;
      return effective === parentId;
    })
    .sort((a, b) =>
      depth === 0
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at),
    );
}
