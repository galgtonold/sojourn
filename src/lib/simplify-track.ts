// Douglas–Peucker for GPX tracks, aware of elevation.
//
// A recorded ride carries far more detail than a map can draw: tens of
// thousands of fixes, most of them describing a straight road, and hundreds
// more piled up wherever the rider stopped. Shipping all of them costs the
// reader a lot and shows them nothing.
//
// The simplification is bounded rather than lossy-by-feel: no point is ever
// moved further than `horizontalM` from the line it was on, so at any zoom the
// route still runs down the same side of the same street.
//
// It is NOT a plain 2D simplifier, because these coordinates also feed the
// elevation chart (buildElevationSeries reads coords[i][2]). A climb up a
// straight road is horizontally collinear, so a 2D pass would drop every point
// of it and flatten the profile. Points are therefore kept when EITHER their
// horizontal or their vertical error exceeds tolerance.

export type SimplifyOptions = {
  /** Max distance (m) the drawn line may sit from the recorded one. */
  horizontalM?: number;
  /** Max error (m) allowed in the elevation profile. Ignored when elevation is dropped. */
  verticalM?: number;
  /** Decimal places kept on lon/lat. 6 ≈ 11 cm. */
  decimals?: number;
  /**
   * Drop the third value. For a surface that draws lines and no chart it is
   * dead weight — and once it isn't shipped there is nothing to protect, so
   * the vertical criterion stops holding points back too.
   */
  dropElevation?: boolean;
  /** Drop per-feature GPX metadata (names, timestamps) nothing renders. */
  stripProperties?: boolean;
};

const DEFAULTS = {
  horizontalM: 1,
  verticalM: 1,
  decimals: 6,
  dropElevation: false,
  stripProperties: false,
} as const;

const M_PER_DEG = 111_320;

/** Local equirectangular projection to metres, scaled at `lat0`. */
function project(c: number[], lat0: number): [number, number] {
  return [
    c[0] * M_PER_DEG * Math.cos((lat0 * Math.PI) / 180),
    c[1] * M_PER_DEG,
  ];
}

/**
 * Error of point `i` against the chord a→b, normalised so that 1 means "exactly
 * at tolerance". Horizontal and vertical are compared on the same scale, and
 * the larger wins — a point is redundant only if BOTH are within budget.
 */
function normalisedError(
  a: number[],
  b: number[],
  c: number[],
  hTol: number,
  vTol: number,
): number {
  const lat0 = a[1];
  const [ax, ay] = project(a, lat0);
  const [bx, by] = project(b, lat0);
  const [cx, cy] = project(c, lat0);

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : ((cx - ax) * dx + (cy - ay) * dy) / len2;
  const clamped = Math.max(0, Math.min(1, t));
  const horizontal = Math.hypot(cx - (ax + clamped * dx), cy - (ay + clamped * dy));

  let vertical = 0;
  const [ea, eb, ec] = [a[2], b[2], c[2]];
  if (Number.isFinite(ea) && Number.isFinite(eb) && Number.isFinite(ec)) {
    // Elevation the chord implies at this point, against what was recorded.
    vertical = Math.abs(ec - (ea + clamped * (eb - ea)));
  }

  return Math.max(horizontal / hTol, vertical / vTol);
}

/** Douglas–Peucker over an open polyline. Endpoints are always kept. */
export function simplifyLine(
  coords: number[][],
  options: SimplifyOptions = {},
): number[][] {
  const { horizontalM, dropElevation } = { ...DEFAULTS, ...options };
  // No point spending points to protect a profile nobody will see.
  const verticalM = dropElevation
    ? Number.POSITIVE_INFINITY
    : { ...DEFAULTS, ...options }.verticalM;
  if (coords.length < 3) return coords;

  const keep = new Array<boolean>(coords.length).fill(false);
  keep[0] = true;
  keep[coords.length - 1] = true;

  // Explicit stack: a long track can recurse thousands deep and blow the real one.
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = 0;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const e = normalisedError(
        coords[first],
        coords[last],
        coords[i],
        horizontalM,
        verticalM,
      );
      if (e > worst) {
        worst = e;
        worstIndex = i;
      }
    }
    if (worst > 1 && worstIndex > 0) {
      keep[worstIndex] = true;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  return coords.filter((_, i) => keep[i]);
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function roundCoord(c: number[], decimals: number, dropElevation: boolean): number[] {
  const out = [round(c[0], decimals), round(c[1], decimals)];
  // Elevation to 10 cm — finer than any GPS or barometer reports.
  if (!dropElevation && c.length > 2 && Number.isFinite(c[2])) {
    out.push(round(c[2], 1));
  }
  return out;
}

/**
 * Simplify every LineString in a track's GeoJSON, leaving the document's shape
 * (and anything that isn't a line) exactly as it was. Malformed input is
 * returned untouched rather than throwing — a broken track should cost a map
 * layer, never the page.
 */
export function simplifyTrackGeoJson<T>(
  geojson: T,
  options: SimplifyOptions = {},
): T {
  const { decimals, dropElevation, stripProperties } = { ...DEFAULTS, ...options };
  const doc = geojson as unknown as {
    features?: { geometry?: { type?: string; coordinates?: unknown } }[];
  } | null;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.features)) {
    return geojson;
  }

  return {
    ...doc,
    features: doc.features.map((f) => {
      const g = f?.geometry;
      if (g?.type !== "LineString" || !Array.isArray(g.coordinates)) return f;
      const coords = (g.coordinates as number[][]).filter(
        (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
      );
      return {
        ...f,
        ...(stripProperties ? { properties: {} } : null),
        geometry: {
          ...g,
          coordinates: simplifyLine(coords, options).map((c) =>
            roundCoord(c, decimals, dropElevation),
          ),
        },
      };
    }),
  } as unknown as T;
}
