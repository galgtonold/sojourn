import { NextResponse } from "next/server";
import { getMapPosts } from "@/lib/content";
import { trackFeatureCollection } from "@/lib/map-tracks";
import { DETAIL_TOLERANCE_M, OVERVIEW_TOLERANCE_M } from "@/lib/map-lod";

// Both levels of detail for /map's routes (see @/lib/map-lod).
//
//   (default)  the coarse tier — everything a world view can resolve
//   ?detail=1  metre-accurate, fetched once the reader zooms in far enough
//              that the difference could show
//
// Neither rides inside the page any more. The routes used to be serialized into
// /map's HTML, which meant every visit re-downloaded the entire archive's
// geometry before the page could render, and none of it could be cached
// separately from the markup. Measured against a five-years-of-travel fixture
// that was ~2 MB of HTML even after coarsening — and it grows with every
// journey, forever. As its own response it is fetched once, cached, and shared
// between visits.
//
// Published content only, same as the page — this is the public read path with
// RLS underneath, and it exposes no field the page didn't already.
export const revalidate = 3600;

export async function GET(req: Request) {
  const detail = new URL(req.url).searchParams.get("detail") === "1";
  const posts = await getMapPosts(
    detail ? DETAIL_TOLERANCE_M : OVERVIEW_TOLERANCE_M,
  );
  const data = trackFeatureCollection(
    posts.flatMap((p) => p.tracks),
    "",
  );

  return NextResponse.json(data, {
    headers: {
      // Long-lived and revalidated in the background: routes only change when
      // the author edits a journey, and a stale line for a few minutes is a
      // far better trade than re-sending megabytes of geometry on every zoom.
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
