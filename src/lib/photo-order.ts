// Chronological gallery ordering shared by the reorder route and any client
// that needs the same order. Kept pure (no I/O) so it's trivially testable.

export type OrderablePhoto = {
  id: string;
  taken_at?: string | null;
  created_at?: string | null;
  sort_order?: number | null;
};

// Order photos by capture time ascending. Two deliberate rules:
//   1. A photo with no (or unparseable) `taken_at` — e.g. a camera import that
//      lost its EXIF through the phone's photo picker — sorts LAST, not first.
//      (A naive `new Date(null)` would land it at 1970 → first, which is the
//      bug this replaces.)
//   2. Ties break by `created_at` (upload time), then `id`, so the order is
//      fully deterministic and never shuffles between loads.
export function orderByCaptureTime<T extends OrderablePhoto>(photos: T[]): T[] {
  return photos.slice().sort((a, b) => {
    const va = captureValue(a.taken_at);
    const vb = captureValue(b.taken_at);
    if (va !== vb) return va - vb;
    const ca = a.created_at ? Date.parse(a.created_at) : 0;
    const cb = b.created_at ? Date.parse(b.created_at) : 0;
    if (ca !== cb) return (Number.isNaN(ca) ? 0 : ca) - (Number.isNaN(cb) ? 0 : cb);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// Parsed capture time in ms, or +Infinity for missing/unparseable — so those
// photos always sort to the end.
function captureValue(takenAt: string | null | undefined): number {
  if (!takenAt) return Infinity;
  const t = Date.parse(takenAt);
  return Number.isNaN(t) ? Infinity : t;
}
