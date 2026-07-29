import { describe, it, expect } from "vitest";
import { simplifyLine, simplifyTrackGeoJson } from "@/lib/simplify-track";

// At the equator 1° of longitude ≈ 111_320 m, so metres convert cleanly.
const M = 1 / 111_320;
/** A point `x` metres east of 0,0 at `e` metres elevation. */
const p = (x: number, e?: number) => (e === undefined ? [x * M, 0] : [x * M, 0, e]);
/** Same, but nudged `y` metres north — used to bend the line off-axis. */
const off = (x: number, y: number, e?: number) =>
  e === undefined ? [x * M, y * M] : [x * M, y * M, e];

describe("simplifyLine — horizontal fidelity", () => {
  it("reduces a straight run to its endpoints", () => {
    const line = [p(0), p(10), p(20), p(30), p(40)];
    expect(simplifyLine(line)).toEqual([line[0], line[4]]);
  });

  it("keeps a point that strays further than the tolerance", () => {
    // 2 m off a straight line, tolerance 0.5 m → must survive.
    const line = [p(0), off(20, 2), p(40)];
    expect(simplifyLine(line, { horizontalM: 0.5 })).toHaveLength(3);
  });

  it("drops a wobble smaller than the tolerance", () => {
    // 0.2 m off — inside GPS noise, invisible at any zoom.
    const line = [p(0), off(20, 0.2), p(40)];
    expect(simplifyLine(line, { horizontalM: 0.5 })).toHaveLength(2);
  });

  it("never moves the line further than the tolerance allows", () => {
    // A gentle arc: every dropped point must still be within tolerance of the
    // kept line, which is the guarantee that keeps you on the same street.
    const line = Array.from({ length: 200 }, (_, i) => off(i * 5, Math.sin(i / 12) * 8));
    const out = simplifyLine(line, { horizontalM: 0.5 });
    expect(out.length).toBeLessThan(line.length);
    expect(maxDeviationM(line, out)).toBeLessThanOrEqual(0.5);
  });

  it("always keeps both endpoints", () => {
    const line = [p(0), p(10), p(20)];
    const out = simplifyLine(line);
    expect(out[0]).toEqual(line[0]);
    expect(out[out.length - 1]).toEqual(line[2]);
  });

  it("leaves lines too short to simplify alone", () => {
    expect(simplifyLine([])).toEqual([]);
    expect(simplifyLine([p(0)])).toEqual([p(0)]);
    expect(simplifyLine([p(0), p(9)])).toEqual([p(0), p(9)]);
  });
});

describe("simplifyLine — elevation fidelity", () => {
  // The reason this is not a plain 2D simplifier: the elevation chart is built
  // from these same coordinates. A climb up a straight road is horizontally
  // collinear, so a 2D simplifier would drop every point and flatten it.
  it("keeps a bend in the climb even though the path is dead straight", () => {
    const line = [p(0, 0), p(11, 0), p(22, 0), p(33, 5), p(44, 10)];
    const out = simplifyLine(line, { horizontalM: 0.5, verticalM: 1 });
    expect(out.length).toBeGreaterThan(2);
    expect(out).toContainEqual(p(22, 0));
  });

  it("still collapses a perfectly even climb, which two points describe exactly", () => {
    const line = [p(0, 0), p(11, 2.5), p(22, 5), p(33, 7.5), p(44, 10)];
    expect(simplifyLine(line, { horizontalM: 0.5, verticalM: 1 })).toHaveLength(2);
  });

  it("carries elevation through on the points it keeps", () => {
    const line = [p(0, 100), p(20, 100), p(40, 175)];
    const out = simplifyLine(line, { horizontalM: 0.5, verticalM: 1 });
    expect(out[0][2]).toBe(100);
    expect(out[out.length - 1][2]).toBe(175);
  });
});

describe("simplifyLine — a rest stop", () => {
  it("thins a slowly drifting pause without erasing it", () => {
    // 300 fixes logged while stationary. A parked receiver wanders slowly, so
    // consecutive fixes sit centimetres apart even as the cluster drifts a
    // metre or two — that redundancy is what collapses.
    const rest = Array.from({ length: 300 }, (_, i) =>
      off(100 + Math.sin(i / 40) * 1.2, Math.cos(i / 40) * 1.2, 50),
    );
    const line = [p(0, 50), ...rest, p(400, 50)];
    const out = simplifyLine(line, { horizontalM: 0.5, verticalM: 1 });
    expect(out.length).toBeLessThan(line.length / 4);
    expect(maxDeviationM(line, out)).toBeLessThanOrEqual(0.5);
  });

  it("keeps jitter that genuinely exceeds the tolerance", () => {
    // Honest about the trade: sub-metre fidelity means noise larger than a
    // metre is signal as far as this is concerned, and survives.
    const jitter = Array.from({ length: 60 }, (_, i) =>
      off(100 + Math.sin(i * 2) * 3, Math.cos(i * 2) * 3, 50),
    );
    const out = simplifyLine([p(0, 50), ...jitter, p(400, 50)], {
      horizontalM: 0.5,
      verticalM: 1,
    });
    expect(out.length).toBeGreaterThan(10);
  });
});

describe("simplifyTrackGeoJson", () => {
  const fc = (coordinates: number[][]) => ({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "day 1" }, geometry: { type: "LineString", coordinates } },
    ],
  });

  it("simplifies each LineString and keeps the envelope intact", () => {
    const out = simplifyTrackGeoJson(fc([p(0), p(10), p(20), p(30)])) as ReturnType<typeof fc>;
    expect(out.type).toBe("FeatureCollection");
    expect(out.features[0].properties).toEqual({ name: "day 1" });
    expect(out.features[0].geometry.coordinates).toHaveLength(2);
  });

  it("rounds to ~11 cm, so precision adds nothing the guarantee can't absorb", () => {
    const out = simplifyTrackGeoJson(
      fc([[11.7756495123, 57.5774614456, 9.44], [11.9, 57.7, 12.0]]),
      { decimals: 6 },
    ) as ReturnType<typeof fc>;
    expect(out.features[0].geometry.coordinates[0]).toEqual([11.77565, 57.577461, 9.4]);
  });

  it("drops elevation when asked, and stops guarding the profile", () => {
    // A climb on a dead-straight road: kept when elevation ships, collapsed
    // when it doesn't, because there is no longer a chart to distort.
    const climb = [p(0, 0), p(11, 0), p(22, 0), p(33, 5), p(44, 10)];
    const kept = simplifyTrackGeoJson(fc(climb), { horizontalM: 1 }) as ReturnType<typeof fc>;
    expect(kept.features[0].geometry.coordinates.length).toBeGreaterThan(2);

    const flat = simplifyTrackGeoJson(fc(climb), {
      horizontalM: 1,
      dropElevation: true,
    }) as ReturnType<typeof fc>;
    expect(flat.features[0].geometry.coordinates).toHaveLength(2);
    expect(flat.features[0].geometry.coordinates.every((c) => c.length === 2)).toBe(true);
  });

  it("strips GPX metadata when asked", () => {
    const out = simplifyTrackGeoJson(fc([p(0), p(10), p(20)]), {
      stripProperties: true,
    }) as ReturnType<typeof fc>;
    expect(out.features[0].properties).toEqual({});
  });

  it("passes through anything that isn't a line", () => {
    const point = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [1.5, 2.5] } }],
    };
    expect(simplifyTrackGeoJson(point)).toEqual(point);
  });

  it("survives junk instead of throwing", () => {
    expect(simplifyTrackGeoJson(null)).toBeNull();
    expect(simplifyTrackGeoJson(undefined)).toBeUndefined();
    expect(simplifyTrackGeoJson({ type: "FeatureCollection" })).toEqual({
      type: "FeatureCollection",
    });
  });
});

/** Greatest distance (m) from any original point to the simplified polyline. */
function maxDeviationM(original: number[][], simplified: number[][]): number {
  const toM = (c: number[]) => [
    c[0] * 111_320 * Math.cos((c[1] * Math.PI) / 180),
    c[1] * 111_320,
  ];
  const pts = simplified.map(toM);
  let worst = 0;
  for (const c of original.map(toM)) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      best = Math.min(best, distToSegment(c, pts[i], pts[i + 1]));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

function distToSegment(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
