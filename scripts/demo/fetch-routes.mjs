// Turns the demo's waypoints into real routes, once, and writes routes.json.
//
//   node scripts/demo/fetch-routes.mjs
//
// Two public services do the work, both free and keyless:
//
//   routing.openstreetmap.de  the OSRM instances behind openstreetmap.org, with
//                             a foot profile — which matters, because routing a
//                             clifftop trail on the car profile puts it on the
//                             inland road and the demo's whole claim is that its
//                             maps are real.
//   api.open-meteo.com        elevation from a 90 m DEM, so the elevation charts
//                             show the actual profile of the actual pass.
//
// The result is committed, so seeding a demo never depends on either service
// being up — and re-running this is a deliberate act, not a side effect of
// deploying. Both are volunteer-funded: this makes about 40 requests, once, at
// one per second.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { allRouteRequests } from "./journeys/index.mjs";

const OSRM = {
  car: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
  bike: "https://routing.openstreetmap.de/routed-bike/route/v1/bike",
};
const UA = "sojourn-demo-seed/1.0 (https://github.com/galgtonold/sojourn)";
const OUT = new URL("./routes.json", import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Both services are free and rate-limited, and the elevation one enforces a
 * burst limit that a straight run through 18 routes trips immediately. Back off
 * and wait rather than hammering: this is somebody's donated capacity.
 */
async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status === 503) {
    if (attempt >= 5) throw new Error(`${res.status} after 5 retries — ${url}`);
    const wait = 15_000 * 2 ** attempt;
    process.stdout.write(`    rate-limited, waiting ${wait / 1000}s…\n`);
    await sleep(wait);
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// ---- geometry helpers --------------------------------------------------------

const R = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;

/** Metres between two [lng, lat] pairs (haversine — exact enough at this scale). */
function distance(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Perpendicular distance in metres from p to the segment a→b. */
function crossTrack(p, a, b) {
  // Local equirectangular projection: over a few hundred metres the error is
  // far below the tolerance we're thinning at.
  const lat0 = toRad((a[1] + b[1]) / 2);
  const x = (q) => toRad(q[0]) * Math.cos(lat0) * R;
  const y = (q) => toRad(q[1]) * R;
  const [px, py] = [x(p), y(p)];
  const [ax, ay] = [x(a), y(a)];
  const [bx, by] = [x(b), y(b)];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Douglas–Peucker, iterative. OSRM's full overview returns a fix every few
 * metres; at 2 m the drawn line still sits on the correct side of the road at
 * every zoom the site offers, and the committed fixture stays a sane size.
 */
function thin(points, toleranceM = 2) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let worst = 0;
    let at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = crossTrack(points[i], points[lo], points[hi]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > toleranceM && at > 0) {
      keep[at] = true;
      stack.push([lo, at], [at, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---- elevation ---------------------------------------------------------------

/**
 * Real elevation for the line, sampled and interpolated. Asking for every fix
 * would be thousands of lookups per route for a chart a few hundred pixels
 * wide; sampling every Nth point and interpolating between them is the same
 * curve at a fortieth of the traffic.
 */
async function addElevation(coords) {
  const MAX_SAMPLES = 160; // 2 requests at Open-Meteo's 100-per-call limit
  const step = Math.max(1, Math.ceil(coords.length / MAX_SAMPLES));
  const idx = [];
  for (let i = 0; i < coords.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== coords.length - 1) idx.push(coords.length - 1);

  const elev = [];
  for (let i = 0; i < idx.length; i += 100) {
    const batch = idx.slice(i, i + 100);
    const lat = batch.map((j) => coords[j][1].toFixed(5)).join(",");
    const lng = batch.map((j) => coords[j][0].toFixed(5)).join(",");
    const data = await getJson(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
    );
    elev.push(...data.elevation);
    await sleep(6000);
  }

  // Linear interpolation between samples, so every fix carries a height.
  const out = [];
  for (let s = 0; s < idx.length - 1; s++) {
    const [from, to] = [idx[s], idx[s + 1]];
    const [eFrom, eTo] = [elev[s], elev[s + 1]];
    for (let i = from; i < to; i++) {
      const t = (i - from) / (to - from);
      out.push([...coords[i], +(eFrom + (eTo - eFrom) * t).toFixed(1)]);
    }
  }
  const last = coords.length - 1;
  out.push([...coords[last], +elev[elev.length - 1].toFixed(1)]);
  return out;
}

// ---- main --------------------------------------------------------------------

async function main() {
  const requests = allRouteRequests();

  // Resume: a leg already in routes.json is not re-fetched. The elevation
  // service rate-limits hard enough that a full run can take a couple of
  // sittings, and losing 15 completed routes to the 16th failing would be silly.
  const routes = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const todo = requests.filter((r) => !routes[r.key]);
  console.log(
    `  ${requests.length} legs, ${Object.keys(routes).length} already done, ` +
      `${todo.length} to fetch\n`,
  );

  const problems = [];
  const save = () => writeFileSync(OUT, JSON.stringify(routes, null, 1));

  for (const req of todo) {
    const base = OSRM[req.profile];
    if (!base) throw new Error(`unknown profile "${req.profile}" on ${req.key}`);
    const coords = req.waypoints.map((w) => `${w[0]},${w[1]}`).join(";");
    const url = `${base}/${coords}?overview=full&geometries=geojson`;

    let line;
    let distanceM;
    try {
      const data = await getJson(url);
      if (data.code !== "Ok" || !data.routes?.length) {
        throw new Error(`router said ${data.code}: ${data.message ?? ""}`);
      }
      line = data.routes[0].geometry.coordinates;
      distanceM = data.routes[0].distance;
    } catch (e) {
      // Say so rather than quietly drawing a straight line — a leg that didn't
      // route is a map that lies, and the point of this file is that it doesn't.
      problems.push(`${req.key}: ${e.message}`);
      console.log(`  ✗ ${req.key} — ${e.message}`);
      await sleep(1000);
      continue;
    }

    const thinned = thin(line, 2);
    await sleep(1000);
    const withElevation = await addElevation(thinned);

    routes[req.key] = {
      profile: req.profile,
      distance_m: Math.round(distanceM),
      coordinates: withElevation.map(([lng, lat, ele]) => [
        +lng.toFixed(6),
        +lat.toFixed(6),
        ele,
      ]),
    };

    save(); // after every leg, so an interrupted run resumes where it stopped
    const km = (distanceM / 1000).toFixed(1);
    console.log(
      `  ✓ ${req.key.padEnd(34)} ${km.padStart(7)} km  ` +
        `${line.length} → ${thinned.length} points`,
    );
  }

  mkdirSync(new URL("./", OUT), { recursive: true });
  save();
  const bytes = JSON.stringify(routes).length;
  console.log(`\n  wrote routes.json — ${(bytes / 1024).toFixed(0)} KB`);

  if (problems.length) {
    console.log(`\n  ${problems.length} leg(s) did not route:`);
    for (const p of problems) console.log(`    ${p}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("\nfetch-routes failed:", e.message ?? e);
  process.exit(1);
});
