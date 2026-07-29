// The demo's content, in reading order (newest journey last — the seed script
// dates them so the site orders them itself).
//
// Everything here is invented: the journals, the travellers, the commenters.
// What is NOT invented is the geography — every waypoint is a real place, and
// the fetch step snaps the legs to the real road and path network so the maps
// show a route you could actually follow. A demo whose lines cut across fjords
// would undersell the one feature it exists to show.

import { lofoten } from "./lofoten.mjs";
import { carreteraAustral } from "./carretera-austral.mjs";
import { hokkaido } from "./hokkaido.mjs";
import { rotaVicentina } from "./rota-vicentina.mjs";

export const journeys = [lofoten, carreteraAustral, hokkaido, rotaVicentina];

/** The demo site's own identity — set on site_settings by the seed script. */
export const branding = {
  name: "Fernweh",
  tagline: {
    en: "A travel journal, kept badly and often",
    de: "Ein Reisetagebuch, schlecht und oft geführt",
  },
  heroLead: {
    en: "Somewhere, ahead of the weather",
    de: "Irgendwo, dem Wetter voraus",
  },
  heroAccent: {
    en: "Four journeys, eighteen entries, one very tired pair of boots.",
    de: "Vier Reisen, achtzehn Einträge, ein sehr müdes Paar Stiefel.",
  },
  kicker: {
    en: "Demo",
    de: "Demo",
  },
};

/** Every photo the demo needs, flattened, with a stable key per image. */
export function allPhotoRequests() {
  const out = [];
  for (const journey of journeys) {
    for (const post of journey.posts) {
      post.photos.forEach((photo, i) => {
        out.push({ key: `${post.slug}-${i + 1}`, ...photo });
      });
    }
  }
  return out;
}

/** Every leg that needs routing, with a stable key per track. */
export function allRouteRequests() {
  const out = [];
  for (const journey of journeys) {
    for (const post of journey.posts) {
      if (post.route) out.push({ key: post.slug, ...post.route });
    }
  }
  return out;
}
