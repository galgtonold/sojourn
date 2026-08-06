import { describe, it, expect } from "vitest";
import { metadata } from "@/app/not-found";

// Next.js serves `notFound()` from
// a statically-prerendered dynamic route (an unknown or deleted /posts|/trips
// slug) with a 200 status, and `dynamicParams` must stay true so newly-published
// slugs render on demand. We can't return a real 404 status without regressing
// on-demand publishing, so the not-found render must always be `noindex` to keep
// deleted/missing pages out of search indexes. This guards that mitigation.
describe("not-found metadata (BUG-001 mitigation)", () => {
  it("declares robots noindex", () => {
    const robots = metadata.robots as
      | { index?: boolean; follow?: boolean }
      | undefined;
    expect(robots).toBeTruthy();
    expect(robots?.index).toBe(false);
  });
});
