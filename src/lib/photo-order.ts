// The one home for photo ordering. Two distinct orders live here — the gallery
// order the reader/editor sees, and the capture-time order the AI narrative and
// the "sort by time" action use — so a tiebreaker change happens in one place.
// Pure (no I/O), so both are trivially testable.

export type OrderablePhoto = {
  id: string;
  taken_at?: string | null;
  created_at?: string | null;
  sort_order?: number | null;
};

const ms = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

// The author-facing gallery order: by `sort_order`, then upload time
// (`created_at`), then `id`. Dense unique sort_orders make ties rare, but the
// tiebreak keeps the order stable when they aren't.
export function orderByGallery<T extends OrderablePhoto>(photos: T[]): T[] {
  return photos.slice().sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0) ||
      cmpId(a, b),
  );
}

// Capture-time order. Two deliberate rules:
//   1. A photo with no (or unparseable) `taken_at` — e.g. a camera import that
//      lost its EXIF through the phone's photo picker — sorts LAST, not first.
//      (A naive `new Date(null)` would land it at 1970 → first, the bug this
//      replaces.)
//   2. Ties break by `created_at` (upload time), then `sort_order`, then `id`,
//      so the order is fully deterministic and never shuffles between loads.
export function orderByCaptureTime<T extends OrderablePhoto>(photos: T[]): T[] {
  return photos.slice().sort((a, b) => {
    const va = ms(a.taken_at) ?? Infinity;
    const vb = ms(b.taken_at) ?? Infinity;
    return (
      va - vb ||
      (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      cmpId(a, b)
    );
  });
}

const cmpId = (a: OrderablePhoto, b: OrderablePhoto): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

// Resolve a reorder request into the final id order + whether it's a manual
// arrangement. Pure, so the (fiddly) rules — honour a drag order but only for
// ids that belong to the post, append the rest by their current sort_order, or
// fall back to capture time — are tested without a database. The data-access
// command in db/photos.ts wraps this with the fetch + writes.
export function resolvePhotoOrder<T extends OrderablePhoto>(
  rows: T[],
  input: { order?: string[]; mode?: "time" },
): { orderedIds: string[]; manual: boolean } {
  if (input.order?.length) {
    const known = new Set(rows.map((r) => r.id));
    const given = input.order.filter((id) => known.has(id));
    const givenSet = new Set(given);
    const rest = rows
      .filter((r) => !givenSet.has(r.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((r) => r.id);
    return { orderedIds: [...given, ...rest], manual: true };
  }
  return { orderedIds: orderByCaptureTime(rows).map((r) => r.id), manual: false };
}
