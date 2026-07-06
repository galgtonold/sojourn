import { describe, it, expect } from "vitest";
import { orderByCaptureTime } from "@/lib/photo-order";

const p = (
  id: string,
  taken_at: string | null,
  created_at = "2026-01-01T00:00:00Z",
) => ({ id, taken_at, created_at });

describe("orderByCaptureTime", () => {
  it("orders by capture time ascending", () => {
    const out = orderByCaptureTime([
      p("b", "2026-07-06T14:00:00Z"),
      p("a", "2026-07-06T09:00:00Z"),
      p("c", "2026-07-06T17:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("sends a photo with no capture time to the END, not the front", () => {
    const out = orderByCaptureTime([
      p("camera", null),
      p("morning", "2026-07-06T09:00:00Z"),
      p("noon", "2026-07-06T12:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["morning", "noon", "camera"]);
  });

  it("treats an unparseable capture time as missing (also last)", () => {
    const out = orderByCaptureTime([
      p("bad", "not-a-date"),
      p("good", "2026-07-06T09:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["good", "bad"]);
  });

  it("keeps multiple timestamp-less photos in a stable, deterministic order", () => {
    const first = orderByCaptureTime([
      p("z", null, "2026-07-06T18:10:00Z"),
      p("y", null, "2026-07-06T18:08:00Z"),
    ]);
    // Ties (both null capture) break by upload time (created_at) ascending.
    expect(first.map((x) => x.id)).toEqual(["y", "z"]);
  });

  it("breaks capture-time ties by upload time", () => {
    const out = orderByCaptureTime([
      p("later", "2026-07-06T12:00:00Z", "2026-07-06T18:05:00Z"),
      p("earlier", "2026-07-06T12:00:00Z", "2026-07-06T18:01:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["earlier", "later"]);
  });

  it("does not mutate the input array", () => {
    const input = [p("b", "2026-07-06T14:00:00Z"), p("a", "2026-07-06T09:00:00Z")];
    const before = input.map((x) => x.id);
    orderByCaptureTime(input);
    expect(input.map((x) => x.id)).toEqual(before);
  });
});
