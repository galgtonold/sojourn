// Bundled demo content. Used whenever Supabase isn't configured so the app is
// immediately explorable. Once real data exists, these are never returned.
import type { PostWithRelations, Trip } from "@/lib/types";
import { emptyReactions } from "@/lib/types";

const img = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const demoTrips: Trip[] = [
  {
    id: "trip-patagonia",
    slug: "patagonia",
    title: "Into Patagonia",
    summary: "Three weeks chasing wind, granite, and impossible light.",
    cover_image: img("photo-1469474968028-56623f02e42e"),
    start_date: "2026-02-02",
    end_date: "2026-02-23",
  },
  {
    id: "trip-japan",
    slug: "japan",
    title: "Slow Japan",
    summary: "Trains, temples, and tiny mountain towns in late autumn.",
    cover_image: img("photo-1492571350019-22de08371fd3"),
    start_date: "2025-11-04",
    end_date: "2025-11-20",
  },
];

function tripBySlug(slug: string) {
  return demoTrips.find((t) => t.slug === slug) ?? null;
}

export const demoPosts: PostWithRelations[] = [
  {
    id: "post-fitzroy",
    slug: "dawn-on-fitz-roy",
    title: "Dawn on Fitz Roy",
    excerpt:
      "We left the refugio at 3 a.m. The granite turned to embers before the sun ever cleared the ridgeline.",
    body: `The trail to Laguna de los Tres climbs through lenga forest in the dark, head-torches bobbing like a slow procession of fireflies. For the last kilometre the path turns vertical, all loose moraine and frozen breath.

Then the wall of Fitz Roy ignites. First a thread of pink at the summit, then a flood of orange spilling down the spires faster than you can believe. Nobody speaks. Somebody, somewhere, is quietly crying.

We stayed until our fingers stopped working, then ran back down for coffee in El Chaltén.`,
    cover_image: img("photo-1518105779142-d975f22f1b0a"),
    trip_id: "trip-patagonia",
    location: "El Chaltén, Argentina",
    lat: -49.3315,
    lng: -72.8863,
    published: true,
    published_at: "2026-02-09T11:00:00Z",
    view_count: 412,
    created_at: "2026-02-09T11:00:00Z",
    updated_at: "2026-02-09T11:00:00Z",
    trip: tripBySlug("patagonia"),
    photos: [
      {
        id: "ph1",
        url: img("photo-1518105779142-d975f22f1b0a", 1200),
        caption: "First light on the spires",
        width: 1200,
        height: 800,
        blurhash: null,
        lat: -49.3,
        lng: -72.9,
        sort_order: 0,
      },
      {
        id: "ph2",
        url: img("photo-1465056836041-7f43ac27dcb5", 1200),
        caption: "The final scramble",
        width: 1200,
        height: 800,
        blurhash: null,
        lat: null,
        lng: null,
        sort_order: 1,
      },
    ],
    locations: [
      { id: "l1", name: "El Chaltén", lat: -49.3315, lng: -72.8863, day: 1, sort_order: 0 },
      { id: "l2", name: "Laguna de los Tres", lat: -49.2746, lng: -73.0386, day: 1, sort_order: 1 },
    ],
    reactions: { ...emptyReactions(), heart: 34, fire: 12, wow: 8, star: 5 },
    comment_count: 3,
  },
  {
    id: "post-kyoto",
    slug: "maple-season-in-kyoto",
    title: "Maple Season in Kyoto",
    excerpt:
      "Temples drowning in red, the smell of roasted chestnuts, and a kettle whistling in a 200-year-old tea house.",
    body: `Kyoto in late November is a city that has decided to show off. Every temple garden is staged like a painting, and half the city is pointing a phone at a maple tree.

We skipped the famous spots at midday and walked the Philosopher's Path at dawn instead. Just us, a street cat, and the canal carrying a slow flotilla of leaves.`,
    cover_image: img("photo-1493976040374-85c8e12f0c0e"),
    trip_id: "trip-japan",
    location: "Kyoto, Japan",
    lat: 35.0116,
    lng: 135.7681,
    published: true,
    published_at: "2025-11-15T09:00:00Z",
    view_count: 587,
    created_at: "2025-11-15T09:00:00Z",
    updated_at: "2025-11-15T09:00:00Z",
    trip: tripBySlug("japan"),
    photos: [
      {
        id: "ph3",
        url: img("photo-1493976040374-85c8e12f0c0e", 1200),
        caption: "Tofuku-ji at peak colour",
        width: 1200,
        height: 800,
        blurhash: null,
        lat: 34.9766,
        lng: 135.7741,
        sort_order: 0,
      },
    ],
    locations: [
      { id: "l3", name: "Tofuku-ji", lat: 34.9766, lng: 135.7741, day: 1, sort_order: 0 },
      { id: "l4", name: "Philosopher's Path", lat: 35.0271, lng: 135.7949, day: 2, sort_order: 1 },
    ],
    reactions: { ...emptyReactions(), heart: 52, fire: 7, wow: 19, star: 11 },
    comment_count: 5,
  },
  {
    id: "post-perito",
    slug: "blue-ice-perito-moreno",
    title: "Blue Ice at Perito Moreno",
    excerpt:
      "Standing on the boardwalk as a tower of ancient ice the size of a building calved into the lake.",
    body: `You hear it before you see it — a crack like a rifle shot rolling across the water. Then a slab of glacier the colour of deep ocean leans, hesitates, and collapses into Lago Argentino.

The glacier is one of the few on earth still advancing. It moves up to two metres a day, which is why it's always shedding ice into the lake. We stood for hours and could not leave.`,
    cover_image: img("photo-1485470733090-0aae1788d5af"),
    trip_id: "trip-patagonia",
    location: "Los Glaciares NP, Argentina",
    lat: -50.4967,
    lng: -73.1377,
    published: true,
    published_at: "2026-02-16T14:00:00Z",
    view_count: 298,
    created_at: "2026-02-16T14:00:00Z",
    updated_at: "2026-02-16T14:00:00Z",
    trip: tripBySlug("patagonia"),
    photos: [
      {
        id: "ph4",
        url: img("photo-1485470733090-0aae1788d5af", 1200),
        caption: "The south face",
        width: 1200,
        height: 800,
        blurhash: null,
        lat: -50.4967,
        lng: -73.1377,
        sort_order: 0,
      },
    ],
    locations: [
      { id: "l5", name: "Perito Moreno Glacier", lat: -50.4967, lng: -73.1377, day: 1, sort_order: 0 },
    ],
    reactions: { ...emptyReactions(), heart: 41, fire: 3, wow: 27, star: 9 },
    comment_count: 2,
  },
];

export const demoComments = [
  {
    id: "c1",
    post_id: "post-fitzroy",
    parent_id: null,
    author_name: "Mara",
    body: "This gave me chills. Adding it to the list immediately.",
    created_at: "2026-02-10T08:12:00Z",
  },
  {
    id: "c2",
    post_id: "post-fitzroy",
    parent_id: null,
    author_name: "Tom",
    body: "Did you need crampons for the final section in February?",
    created_at: "2026-02-11T16:40:00Z",
  },
];
