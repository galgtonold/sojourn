/**
 * Run an async function over a list, several at a time.
 *
 * The export used to fetch photographs one after another, so a journal with two
 * hundred pictures paid two hundred round trips end to end and the owner sat
 * watching a spinner. They are independent requests; the only reason to do them
 * in sequence was that it was easier to write.
 *
 * Bounded rather than `Promise.all` over everything: storage is one small
 * container on the same 2 GB box as Postgres, and each result is held in memory
 * until the archive is packed. Unbounded parallelism trades a slow export for
 * an export that gets the box killed.
 *
 * Results come back in input order regardless of completion order, which
 * matters because the archive's entries — and so its manifest — should not
 * depend on which download happened to finish first.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const width = Math.max(1, Math.min(Math.floor(limit), items.length));
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  // The first rejection wins and the rest are left to settle. Callers here
  // convert failures into recorded entries rather than throwing, so this is a
  // backstop for genuine bugs rather than the normal path.
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
