// UI-chrome translations (post content stays in whatever language it's written).
// German is the default.
export type Locale = "de" | "en";
export const LOCALES: Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
};

const en = {
  "nav.stories": "Stories",
  "nav.trips": "Trips",
  "nav.map": "Map",
  "nav.search": "Search",
  "nav.admin": "Admin",

  "footer.tagline": "A travel journal. Built to wander, made to last.",

  "home.kicker": "field notes from the road",
  "home.heroLeadA": "Stories, maps & light from",
  "home.heroLeadB": "everywhere we wander",
  "home.readCta": "Read",
  "home.latest": "Latest entries",
  "home.latestSub": "The most recent dispatches from the trail.",
  "home.allEntries": "All entries",
  "home.browseAll": "Browse all {n} entries",
  "home.noMore": "No more entries yet — check back soon.",
  "home.mapTitle": "Every step, on the map",
  "home.mapBody": "Follow the routes, pins and detours across {n} entries and counting.",
  "home.exploreMap": "Explore the map",

  "common.back": "Back",
  "common.newer": "Newer",
  "common.older": "Older",
  "common.page": "Page {a} of {b}",

  "post.minRead": "min read",
  "post.unpublished": "Unpublished",
  "post.gallery": "Gallery",
  "post.onMap": "On the map",
  "post.elevation": "Elevation",
  "post.exploreJourney": "Explore the journey map",

  "comments.title": "Comments",
  "comments.beFirst": "Be the first to say something.",
  "comments.name": "Your name (saved for next time)",
  "comments.note": "Leave a note…",
  "comments.replyTo": "Reply to {name}…",
  "comments.post": "Post comment",
  "comments.posting": "Posting…",
  "comments.reply": "Reply",
  "comments.send": "Reply",
  "comments.cancel": "Cancel",
  "comments.loadEarlier": "Load earlier comments ({n} more)",
  "comments.error": "Couldn’t post that — please try again.",

  "subscribe.title": "Enjoyed the read?",
  "subscribe.body": "Get a notification when the next story goes live.",
  "subscribe.cta": "Notify me",
  "subscribe.working": "Enabling…",
  "subscribe.done": "You’re in — we’ll ping you when a new story drops. ✨",
  "subscribe.denied":
    "No worries — you can enable notifications anytime from your browser settings.",

  "poll.label": "Poll",
  "quiz.label": "Quiz",
  "quiz.right": "Nice — you got it! ",
  "quiz.wrong": "Not quite. ",
  "poll.thanks": "Thanks for voting! ",
  "interaction.responses": "{n} responses",
  "interaction.response": "{n} response",

  "search.title": "Search",
  "search.subtitle": "Find a place, a trip, or a moment.",
  "search.placeholder": "Patagonia, glaciers, Kyoto…",
  "search.results": "{n} results for “{q}”",
  "search.result": "{n} result for “{q}”",

  "trips.title": "Trips",
  "trips.subtitle":
    "Each journey, gathered. Routes, stories and galleries grouped by the road that connected them.",
  "trips.entries": "entries",
  "trips.trip": "Trip",
  "trips.exploreTitle": "Explore the journey map",
  "trips.exploreBody":
    "Walk the route step by step — every stop and photo on an interactive map.",
  "trips.photos": "{n} located photos",
  "trips.stops": "{n} stops",

  "archive.title": "All entries",
  "archive.subtitle": "{n} stories from the road.",
  "archive.empty": "Nothing here yet.",

  "map.title": "The whole map",
  "map.subtitle": "Every entry, pinned. Tap a marker to jump to the story.",
} as const;

type Dict = Record<keyof typeof en, string>;

const de: Dict = {
  "nav.stories": "Geschichten",
  "nav.trips": "Reisen",
  "nav.map": "Karte",
  "nav.search": "Suche",
  "nav.admin": "Admin",

  "footer.tagline":
    "Ein Reisetagebuch. Zum Umherziehen gebaut, zum Bleiben gemacht.",

  "home.kicker": "Notizen von unterwegs",
  "home.heroLeadA": "Geschichten, Karten & Licht von",
  "home.heroLeadB": "überall, wohin wir ziehen",
  "home.readCta": "Lesen",
  "home.latest": "Neueste Beiträge",
  "home.latestSub": "Die jüngsten Eindrücke von unterwegs.",
  "home.allEntries": "Alle Beiträge",
  "home.browseAll": "Alle {n} Beiträge ansehen",
  "home.noMore": "Noch keine weiteren Beiträge — schau bald wieder vorbei.",
  "home.mapTitle": "Jeder Schritt, auf der Karte",
  "home.mapBody":
    "Folge den Routen, Pins und Abstechern über {n} Beiträge und mehr.",
  "home.exploreMap": "Karte erkunden",

  "common.back": "Zurück",
  "common.newer": "Neuer",
  "common.older": "Älter",
  "common.page": "Seite {a} von {b}",

  "post.minRead": "Min. Lesezeit",
  "post.unpublished": "Unveröffentlicht",
  "post.gallery": "Galerie",
  "post.onMap": "Auf der Karte",
  "post.elevation": "Höhenprofil",
  "post.exploreJourney": "Reisekarte erkunden",

  "comments.title": "Kommentare",
  "comments.beFirst": "Sei der oder die Erste.",
  "comments.name": "Dein Name (wird gespeichert)",
  "comments.note": "Hinterlasse eine Notiz…",
  "comments.replyTo": "Antwort an {name}…",
  "comments.post": "Kommentieren",
  "comments.posting": "Senden…",
  "comments.reply": "Antworten",
  "comments.send": "Antworten",
  "comments.cancel": "Abbrechen",
  "comments.loadEarlier": "Frühere Kommentare laden ({n} weitere)",
  "comments.error": "Konnte nicht gesendet werden — bitte erneut versuchen.",

  "subscribe.title": "Hat dir der Beitrag gefallen?",
  "subscribe.body":
    "Lass dich benachrichtigen, wenn die nächste Geschichte erscheint.",
  "subscribe.cta": "Benachrichtige mich",
  "subscribe.working": "Aktivieren…",
  "subscribe.done":
    "Du bist dabei — wir melden uns bei der nächsten Geschichte. ✨",
  "subscribe.denied":
    "Kein Problem — du kannst Benachrichtigungen jederzeit in den Browser-Einstellungen aktivieren.",

  "poll.label": "Umfrage",
  "quiz.label": "Quiz",
  "quiz.right": "Stimmt — richtig! ",
  "quiz.wrong": "Nicht ganz. ",
  "poll.thanks": "Danke fürs Abstimmen! ",
  "interaction.responses": "{n} Antworten",
  "interaction.response": "{n} Antwort",

  "search.title": "Suche",
  "search.subtitle": "Finde einen Ort, eine Reise oder einen Moment.",
  "search.placeholder": "Patagonien, Gletscher, Kyoto…",
  "search.results": "{n} Treffer für „{q}“",
  "search.result": "{n} Treffer für „{q}“",

  "trips.title": "Reisen",
  "trips.subtitle":
    "Jede Reise, gesammelt. Routen, Geschichten und Galerien — geordnet nach dem Weg, der sie verband.",
  "trips.entries": "Beiträge",
  "trips.trip": "Reise",
  "trips.exploreTitle": "Reisekarte erkunden",
  "trips.exploreBody":
    "Geh die Route Schritt für Schritt ab — jeder Halt und jedes Foto auf einer interaktiven Karte.",
  "trips.photos": "{n} verortete Fotos",
  "trips.stops": "{n} Stationen",

  "archive.title": "Alle Beiträge",
  "archive.subtitle": "{n} Geschichten von unterwegs.",
  "archive.empty": "Hier ist noch nichts.",

  "map.title": "Die ganze Karte",
  "map.subtitle":
    "Jeder Beitrag, markiert. Tippe einen Marker an, um zur Geschichte zu springen.",
};

export const dictionaries: Record<Locale, Dict> = { de, en };
export type DictKey = keyof typeof en;

export function translate(
  locale: Locale,
  key: DictKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = (dictionaries[locale] ?? de)[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "en" || value === "de" ? value : DEFAULT_LOCALE;
}
