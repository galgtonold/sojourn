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
  "nav.photos": "Photos",
  "nav.search": "Search",
  "nav.admin": "Admin",
  "nav.menu": "Menu",

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
  "comments.anonymous": "Anonymous",

  "common.close": "Close",
  "common.dismiss": "Dismiss",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.delete": "Delete",

  "journey.back": "Back to {label}",
  "journey.openPhoto": "Open photo",
  "journey.viewStory": "View story →",
  "journey.prev": "Prev",
  "journey.next": "Next",
  "journey.goToStop": "Go to stop {n}",
  "map.openStory": "Open story →",

  "meta.tagline": "a travel journal",
  "meta.trips": "Trips",
  "meta.map": "Map",
  "meta.posts": "All entries",
  "meta.journeyMap": "Journey map",
  "meta.admin": "Admin",
  "meta.newTrip": "New trip",
  "meta.editTrip": "Edit trip",
  "meta.newPost": "New post",
  "meta.editPost": "Edit post",
  "meta.preview": "Preview",
  "meta.aiUsage": "AI usage",
  "meta.members": "Collaborators",
  "meta.comments": "Comments",

  "notFound.title": "Off the map",
  "notFound.body": "This trail doesn’t lead anywhere — yet.",
  "notFound.back": "Back to the journal",

  "preview.draft": "Draft preview",
  "preview.notPublished": "not published",
  "preview.backToEditor": "Back to editor",

  "footer.demo":
    "Demo mode — showing bundled sample content. Configure Supabase to go live.",

  "common.previous": "Previous",
  "common.next": "Next",

  "post.routeFallback": "Route",
  "post.elevationAria": "Elevation profile",

  "admin.gallery.delete": "Delete photo",
  "admin.gallery.geotagged": "Geotagged from EXIF — shows on the map",
  "admin.routes.delete": "Delete track",
  "admin.upload.remove": "Remove image",
  "admin.upload.coverAlt": "Cover preview",
  "admin.ask.delete": "Delete",
  "admin.ask.removeOption": "Remove option",
  "admin.ask.markCorrect": "Mark as correct answer",

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

  "litter.pendingPoll": "Poll — created when you save",
  "litter.pendingQuiz": "Quiz — created when you save",
  "litter.noQuestion": "(no question yet)",
  "litter.willNotSave": "Incomplete — fix this block or it won’t be created.",
  "litter.brokenPhoto": "Missing photo: {ref}",
  "litter.brokenAsk": "Missing poll/quiz: {ref}",
  "admin.litter.hint":
    "Add a poll/quiz inline with :::poll or :::quiz … ::: (mark a quiz’s correct option with «=»). It becomes a real interaction on save.",
  "admin.litter.pending": "{n} inline poll/quiz block(s) will be created on save.",
  "admin.litter.brokenPhoto": "Reference [photo:{ref}] doesn’t match any photo.",
  "admin.litter.brokenAsk": "Reference [ask:{ref}] doesn’t match any poll/quiz.",
  "admin.litter.badBlock": "Incomplete {kind} block: {problems}.",

  "search.title": "Search",
  "search.subtitle": "Find a place, a trip, or a moment.",
  "search.placeholder": "Patagonia, glaciers, Kyoto…",
  "search.results": "{n} results for “{q}”",
  "search.result": "{n} result for “{q}”",
  "search.stories": "Stories",
  "search.photos": "Photos",
  "search.noResults": "Nothing found for “{q}”.",

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

  "photos.title": "Photo map",
  "photos.subtitle":
    "Every geotagged photo, where it was taken. Zoom in to explore; tap a pin to open the story.",
  "photos.count": "{n} photos on the map.",
  "photos.empty": "No geotagged photos yet.",
  "photos.inView": "{n} in view",
  "photos.noneInView": "No photos in view — zoom out or pan to find more.",

  // Admin
  "admin.dashboard": "Dashboard",
  "admin.dashboardLink": "Dashboard",
  "admin.signedInAs": "Signed in as {email}",
  "admin.password": "Password",
  "admin.signOut": "Sign out",
  "admin.demoNotice":
    "Demo mode — connect Supabase and create an admin user to manage real content.",
  "admin.statPosts": "Posts",
  "admin.statComments": "Comments",
  "admin.newPost": "New post",
  "admin.postsHeading": "Posts",
  "admin.published": "Published",
  "admin.draft": "Draft",
  "admin.edit": "Edit",
  "admin.preview": "Preview",
  "admin.noPosts": "No posts yet.",
  "admin.recentComments": "Recent comments",
  "admin.moderateAll": "Moderate all →",
  "admin.noComments": "No comments yet.",

  "admin.login.title": "Admin",
  "admin.login.emailPlaceholder": "you@example.com",
  "admin.login.subtitle": "Sign in to manage entries, photos and comments.",
  "admin.login.demo":
    "Demo mode: set Supabase env vars and create an admin user to enable login.",
  "admin.login.password": "Password",
  "admin.login.signIn": "Sign in",
  "admin.login.signingIn": "Signing in…",

  "admin.account.title": "Change password",
  "admin.account.current": "Current password",
  "admin.account.new": "New password (min 8 characters)",
  "admin.account.confirm": "Confirm new password",
  "admin.account.update": "Update password",
  "admin.account.updating": "Updating…",
  "admin.account.done": "Password updated. Use it next time you sign in.",
  "admin.account.errMin": "New password must be at least 8 characters.",
  "admin.account.errMatch": "New passwords don’t match.",
  "admin.account.errCurrent": "Current password is incorrect.",
  "admin.account.errGeneric": "Not available in demo mode.",

  "admin.cmod.title": "Comments",
  "admin.cmod.subtitle":
    "Grouped by post and threaded. Hide spam or off-topic notes (they stay in the database) or delete them for good.",
  "admin.cmod.recent200": " Showing the 200 most recent.",
  "admin.cmod.connect": "Connect Supabase to moderate comments.",
  "admin.cmod.none": "No comments yet.",
  "admin.cmod.reply": "reply",
  "admin.cmod.hidden": "hidden",
  "admin.cmod.hide": "Hide",
  "admin.cmod.unhide": "Unhide",
  "admin.cmod.delete": "Delete",
  "admin.cmod.comments": "{n} comments",
  "admin.cmod.comment": "{n} comment",
  "admin.cmod.deleteConfirm": "Delete this comment (and its replies) permanently?",

  "admin.editor.newPost": "New post",
  "admin.editor.editPost": "Edit post",
  "admin.editor.title": "Title",
  "admin.editor.location": "Location (e.g. Kyoto, Japan)",
  "admin.editor.coverUrl": "…or paste an image URL",
  "admin.editor.coverAlt": "Cover alt text (describe the image for screen readers)",
  "admin.editor.lat": "Latitude",
  "admin.editor.lng": "Longitude",
  "admin.editor.excerpt": "Excerpt",
  "admin.editor.body":
    "Body — Markdown supported (## headings, **bold**, > quotes, - lists, [links](url)). Place a gallery photo with [photo:ID] or a poll/quiz with [ask:ID] on its own line.",
  "admin.editor.hint":
    "Markdown supported. Weave in a gallery photo with [photo:ID] or a poll/quiz with [ask:ID] on its own line — grab tags with “Copy …” in the sections below.",
  "admin.editor.save": "Save",
  "admin.editor.saving": "Saving…",
  "admin.editor.delete": "Delete",
  "admin.editor.deleteConfirm": "Delete this post permanently?",
  "admin.editor.saveFailed": "Save failed",
  "admin.editor.trip": "Trip",
  "admin.editor.tripNone": "— No trip —",

  "admin.trip.heading": "Trips",
  "admin.trip.newTrip": "New trip",
  "admin.trip.editTrip": "Edit trip",
  "admin.trip.none": "No trips yet.",
  "admin.trip.title": "Trip title",
  "admin.trip.cover": "Cover image",
  "admin.trip.summary": "Summary",
  "admin.trip.start": "Start date",
  "admin.trip.end": "End date",
  "admin.trip.deleteConfirm": "Delete this trip? Its posts stay, just unlinked.",

  "admin.members.heading": "Collaborators",
  "admin.members.subtitle":
    "Invite people and give them access to specific trips.",
  "admin.members.link": "Collaborators",
  "admin.members.email": "Email address",
  "admin.members.invite": "Invite",
  "admin.members.inviting": "Inviting…",
  "admin.members.none": "No collaborators yet.",
  "admin.members.noTrips": "Create a trip first to grant access.",
  "admin.members.edit": "Edit access",
  "admin.members.save": "Save access",
  "admin.members.remove": "Remove",
  "admin.members.removeConfirm":
    "Remove this collaborator? They lose all access.",
  "admin.members.sent": "Invite email sent.",
  "admin.members.granted": "Access updated.",
  "admin.members.linkFallback": "Couldn’t send the invite email automatically.",
  "admin.members.linkShare": "Share this set-up link with them:",
  "admin.members.copy": "Copy",
  "admin.members.copied": "Copied!",
  "admin.members.noAccess": "No trips yet",

  "admin.welcome.title": "Set your password",
  "admin.welcome.body": "Choose a password to finish setting up your account.",
  "admin.welcome.save": "Set password",
  "admin.welcome.done": "All set — taking you in…",
  "admin.welcome.invalid":
    "This link is invalid or has expired. Ask for a new invite.",

  "admin.ai.title": "AI draft",
  "admin.ai.subtitle": "From your photos, routes and notes — in your voice.",
  "admin.ai.notes": "Notes — bullet points, route, highlights, who you were with…",
  "admin.ai.suggestQuestions": "Suggest questions",
  "admin.ai.answersHint":
    "Answer a few questions for a richer draft (optional):",
  "admin.ai.generate": "Generate draft",
  "admin.ai.skip": "Generate draft",
  "admin.ai.generating": "Writing…",
  "admin.ai.done": "Draft created — review and tweak it below.",
  "admin.ai.overwriteConfirm": "Replace the existing text with the AI draft?",
  "admin.ai.step.enrich": "Analysing photos",
  "admin.ai.step.outline": "Outlining",
  "admin.ai.step.section": "Writing section {a}/{b}",
  "admin.ai.step.captions": "Captions",
  "admin.ai.step.save": "Saving",
  "admin.ai.autocaption": "Auto-caption photos",
  "admin.ai.autocaptionDone": "Captioned {n} photos.",

  "admin.usage.link": "AI usage",
  "admin.usage.title": "AI usage & cost",
  "admin.usage.subtitle":
    "Estimated DeepSeek spend. Token counts are exact; cost uses your configured rates.",
  "admin.usage.month": "This month",
  "admin.usage.total": "All-time",
  "admin.usage.calls": "Calls",
  "admin.usage.cacheRate": "Cache hit rate",
  "admin.usage.byOp": "By operation",
  "admin.usage.recent": "Recent calls",
  "admin.usage.none": "No AI usage yet.",

  "admin.upload.cover": "Cover image",
  "admin.upload.drop": "Drop an image or click to upload",
  "admin.upload.uploading": "Uploading…",
  "admin.upload.replace": "Replace",

  "admin.gallery.title": "Gallery",
  "admin.gallery.subtitle":
    "Saved automatically — uploads, captions and deletions apply instantly (no need to press Save).",
  "admin.gallery.photos": "{n} photos",
  "admin.gallery.caption": "Caption…",
  "admin.gallery.alt": "Alt text…",
  "admin.gallery.copyTag": "Copy inline tag",
  "admin.gallery.copied": "Copied!",
  "admin.gallery.add": "Add photos",
  "admin.gallery.camera": "Camera",
  "admin.gallery.located": "Located",
  "admin.gallery.saved": "Saved ✓",

  "admin.routes.title": "Routes",
  "admin.routes.subtitle":
    "Upload GPX tracks to draw the journey on the map. Saved automatically.",
  "admin.routes.upload": "Upload GPX",
  "admin.routes.reading": "Reading…",
  "admin.routes.track": "Track",

  "admin.ask.title": "Polls & quizzes",
  "admin.ask.subtitle":
    "Create a block, then drop its [ask:ID] tag into the body. Saved automatically.",
  "admin.ask.copyTag": "Copy tag",
  "admin.ask.copied": "Copied!",
  "admin.ask.edit": "Edit",
  "admin.ask.save": "Save changes",
  "admin.ask.cancel": "Cancel",
  "admin.ask.editing": "Editing",
  "admin.ask.question": "Question",
  "admin.ask.option": "Option {n}",
  "admin.ask.addOption": "Add option",
  "admin.ask.explanation": "Explanation shown after answering (optional)",
  "admin.ask.addPoll": "Add poll",
  "admin.ask.addQuiz": "Add quiz",
  "admin.ask.adding": "Adding…",
  "admin.ask.errQuestion": "Add a question.",
  "admin.ask.errOptions": "Add at least two options.",
  "admin.ask.errCorrect": "Pick which option is correct.",

  "push.enable": "Enable notifications",
  "push.enabling": "Enabling…",
  "push.on": "Notifications on",
  "push.blocked": "Blocked in browser",
  "push.unsupported": "Push not supported here.",
  "push.setKeys": "Set VAPID keys to enable push notifications.",
} as const;

type Dict = Record<keyof typeof en, string>;

const de: Dict = {
  "nav.stories": "Geschichten",
  "nav.trips": "Reisen",
  "nav.map": "Karte",
  "nav.photos": "Fotos",
  "nav.search": "Suche",
  "nav.admin": "Admin",
  "nav.menu": "Menü",

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
  "comments.anonymous": "Anonym",

  "common.close": "Schließen",
  "common.dismiss": "Ausblenden",
  "common.confirm": "Bestätigen",
  "common.cancel": "Abbrechen",
  "common.delete": "Löschen",

  "journey.back": "Zurück zu {label}",
  "journey.openPhoto": "Foto öffnen",
  "journey.viewStory": "Beitrag ansehen →",
  "journey.prev": "Zurück",
  "journey.next": "Weiter",
  "journey.goToStop": "Zu Station {n}",
  "map.openStory": "Beitrag öffnen →",

  "meta.tagline": "ein Reisetagebuch",
  "meta.trips": "Reisen",
  "meta.map": "Karte",
  "meta.posts": "Alle Beiträge",
  "meta.journeyMap": "Reisekarte",
  "meta.admin": "Admin",
  "meta.newTrip": "Neue Reise",
  "meta.editTrip": "Reise bearbeiten",
  "meta.newPost": "Neuer Beitrag",
  "meta.editPost": "Beitrag bearbeiten",
  "meta.preview": "Vorschau",
  "meta.aiUsage": "KI-Nutzung",
  "meta.members": "Mitwirkende",
  "meta.comments": "Kommentare",

  "notFound.title": "Abseits der Karte",
  "notFound.body": "Dieser Pfad führt (noch) nirgendwohin.",
  "notFound.back": "Zurück zum Journal",

  "preview.draft": "Entwurfsvorschau",
  "preview.notPublished": "nicht veröffentlicht",
  "preview.backToEditor": "Zurück zum Editor",

  "footer.demo":
    "Demo-Modus — gebündelte Beispielinhalte. Richte Supabase ein, um live zu gehen.",

  "common.previous": "Zurück",
  "common.next": "Weiter",

  "post.routeFallback": "Route",
  "post.elevationAria": "Höhenprofil",

  "admin.gallery.delete": "Foto löschen",
  "admin.gallery.geotagged": "Geotag aus EXIF — erscheint auf der Karte",
  "admin.routes.delete": "Track löschen",
  "admin.upload.remove": "Bild entfernen",
  "admin.upload.coverAlt": "Cover-Vorschau",
  "admin.ask.delete": "Löschen",
  "admin.ask.removeOption": "Option entfernen",
  "admin.ask.markCorrect": "Als richtige Antwort markieren",

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

  "litter.pendingPoll": "Umfrage — wird beim Speichern erstellt",
  "litter.pendingQuiz": "Quiz — wird beim Speichern erstellt",
  "litter.noQuestion": "(noch keine Frage)",
  "litter.willNotSave":
    "Unvollständig — korrigiere diesen Block, sonst wird er nicht erstellt.",
  "litter.brokenPhoto": "Fehlendes Foto: {ref}",
  "litter.brokenAsk": "Fehlende Umfrage/Quiz: {ref}",
  "admin.litter.hint":
    "Umfrage/Quiz direkt im Text mit :::poll oder :::quiz … ::: einfügen (richtige Quiz-Option mit «=» markieren). Wird beim Speichern zu einer echten Interaktion.",
  "admin.litter.pending":
    "{n} Inline-Umfrage/-Quiz-Block/-Blöcke werden beim Speichern erstellt.",
  "admin.litter.brokenPhoto": "Verweis [photo:{ref}] passt zu keinem Foto.",
  "admin.litter.brokenAsk": "Verweis [ask:{ref}] passt zu keiner Umfrage/Quiz.",
  "admin.litter.badBlock": "Unvollständiger {kind}-Block: {problems}.",

  "search.title": "Suche",
  "search.subtitle": "Finde einen Ort, eine Reise oder einen Moment.",
  "search.placeholder": "Patagonien, Gletscher, Kyoto…",
  "search.results": "{n} Treffer für „{q}“",
  "search.result": "{n} Treffer für „{q}“",
  "search.stories": "Geschichten",
  "search.photos": "Fotos",
  "search.noResults": "Nichts gefunden für „{q}“.",

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

  "photos.title": "Fotokarte",
  "photos.subtitle":
    "Jedes Foto mit Standort, dort wo es entstand. Zoome hinein; tippe einen Pin an, um die Geschichte zu öffnen.",
  "photos.count": "{n} Fotos auf der Karte.",
  "photos.empty": "Noch keine Fotos mit Standort.",
  "photos.inView": "{n} im Blick",
  "photos.noneInView":
    "Keine Fotos im Blick — zoome heraus oder verschiebe die Karte.",

  // Admin
  "admin.dashboard": "Übersicht",
  "admin.dashboardLink": "Übersicht",
  "admin.signedInAs": "Angemeldet als {email}",
  "admin.password": "Passwort",
  "admin.signOut": "Abmelden",
  "admin.demoNotice":
    "Demo-Modus — verbinde Supabase und lege einen Admin-Benutzer an, um echte Inhalte zu verwalten.",
  "admin.statPosts": "Beiträge",
  "admin.statComments": "Kommentare",
  "admin.newPost": "Neuer Beitrag",
  "admin.postsHeading": "Beiträge",
  "admin.published": "Veröffentlicht",
  "admin.draft": "Entwurf",
  "admin.edit": "Bearbeiten",
  "admin.preview": "Vorschau",
  "admin.noPosts": "Noch keine Beiträge.",
  "admin.recentComments": "Neueste Kommentare",
  "admin.moderateAll": "Alle moderieren →",
  "admin.noComments": "Noch keine Kommentare.",

  "admin.login.title": "Admin",
  "admin.login.emailPlaceholder": "you@example.com",
  "admin.login.subtitle":
    "Melde dich an, um Beiträge, Fotos und Kommentare zu verwalten.",
  "admin.login.demo":
    "Demo-Modus: Setze die Supabase-Variablen und lege einen Admin-Benutzer an, um die Anmeldung zu aktivieren.",
  "admin.login.password": "Passwort",
  "admin.login.signIn": "Anmelden",
  "admin.login.signingIn": "Anmelden…",

  "admin.account.title": "Passwort ändern",
  "admin.account.current": "Aktuelles Passwort",
  "admin.account.new": "Neues Passwort (mind. 8 Zeichen)",
  "admin.account.confirm": "Neues Passwort bestätigen",
  "admin.account.update": "Passwort aktualisieren",
  "admin.account.updating": "Aktualisieren…",
  "admin.account.done":
    "Passwort aktualisiert. Verwende es bei der nächsten Anmeldung.",
  "admin.account.errMin": "Neues Passwort muss mindestens 8 Zeichen haben.",
  "admin.account.errMatch": "Neue Passwörter stimmen nicht überein.",
  "admin.account.errCurrent": "Aktuelles Passwort ist falsch.",
  "admin.account.errGeneric": "Im Demo-Modus nicht verfügbar.",

  "admin.cmod.title": "Kommentare",
  "admin.cmod.subtitle":
    "Nach Beitrag gruppiert und verschachtelt. Verstecke Spam oder Themenfremdes (bleibt in der Datenbank) oder lösche es endgültig.",
  "admin.cmod.recent200": " Es werden die 200 neuesten angezeigt.",
  "admin.cmod.connect": "Verbinde Supabase, um Kommentare zu moderieren.",
  "admin.cmod.none": "Noch keine Kommentare.",
  "admin.cmod.reply": "Antwort",
  "admin.cmod.hidden": "versteckt",
  "admin.cmod.hide": "Verstecken",
  "admin.cmod.unhide": "Einblenden",
  "admin.cmod.delete": "Löschen",
  "admin.cmod.comments": "{n} Kommentare",
  "admin.cmod.comment": "{n} Kommentar",
  "admin.cmod.deleteConfirm":
    "Diesen Kommentar (und seine Antworten) endgültig löschen?",

  "admin.editor.newPost": "Neuer Beitrag",
  "admin.editor.editPost": "Beitrag bearbeiten",
  "admin.editor.title": "Titel",
  "admin.editor.location": "Ort (z. B. Kyoto, Japan)",
  "admin.editor.coverUrl": "…oder Bild-URL einfügen",
  "admin.editor.coverAlt":
    "Alt-Text des Titelbilds (Bild für Screenreader beschreiben)",
  "admin.editor.lat": "Breitengrad",
  "admin.editor.lng": "Längengrad",
  "admin.editor.excerpt": "Kurzbeschreibung",
  "admin.editor.body":
    "Text — Markdown möglich (## Überschriften, **fett**, > Zitate, - Listen, [Links](url)). Setze ein Galeriefoto mit [photo:ID] oder eine Umfrage/ein Quiz mit [ask:ID] in eine eigene Zeile.",
  "admin.editor.hint":
    "Markdown möglich. Binde ein Galeriefoto mit [photo:ID] oder eine Umfrage/ein Quiz mit [ask:ID] in eine eigene Zeile ein — Tags holst du dir über „Kopieren …“ in den Abschnitten unten.",
  "admin.editor.save": "Speichern",
  "admin.editor.saving": "Speichern…",
  "admin.editor.delete": "Löschen",
  "admin.editor.deleteConfirm": "Diesen Beitrag endgültig löschen?",
  "admin.editor.saveFailed": "Speichern fehlgeschlagen",
  "admin.editor.trip": "Reise",
  "admin.editor.tripNone": "— Keine Reise —",

  "admin.trip.heading": "Reisen",
  "admin.trip.newTrip": "Neue Reise",
  "admin.trip.editTrip": "Reise bearbeiten",
  "admin.trip.none": "Noch keine Reisen.",
  "admin.trip.title": "Titel der Reise",
  "admin.trip.cover": "Titelbild",
  "admin.trip.summary": "Zusammenfassung",
  "admin.trip.start": "Startdatum",
  "admin.trip.end": "Enddatum",
  "admin.trip.deleteConfirm":
    "Diese Reise löschen? Die Beiträge bleiben erhalten, nur die Verknüpfung wird entfernt.",

  "admin.members.heading": "Mitwirkende",
  "admin.members.subtitle":
    "Lade Personen ein und gib ihnen Zugriff auf bestimmte Reisen.",
  "admin.members.link": "Mitwirkende",
  "admin.members.email": "E-Mail-Adresse",
  "admin.members.invite": "Einladen",
  "admin.members.inviting": "Einladen…",
  "admin.members.none": "Noch keine Mitwirkenden.",
  "admin.members.noTrips": "Erstelle zuerst eine Reise, um Zugriff zu gewähren.",
  "admin.members.edit": "Zugriff bearbeiten",
  "admin.members.save": "Zugriff speichern",
  "admin.members.remove": "Entfernen",
  "admin.members.removeConfirm":
    "Diese Person entfernen? Sie verliert jeglichen Zugriff.",
  "admin.members.sent": "Einladungs-E-Mail gesendet.",
  "admin.members.granted": "Zugriff aktualisiert.",
  "admin.members.linkFallback":
    "Die Einladungs-E-Mail konnte nicht automatisch gesendet werden.",
  "admin.members.linkShare": "Teile diesen Einrichtungs-Link mit der Person:",
  "admin.members.copy": "Kopieren",
  "admin.members.copied": "Kopiert!",
  "admin.members.noAccess": "Noch keine Reisen",

  "admin.welcome.title": "Passwort festlegen",
  "admin.welcome.body":
    "Wähle ein Passwort, um die Einrichtung deines Kontos abzuschließen.",
  "admin.welcome.save": "Passwort festlegen",
  "admin.welcome.done": "Fertig — du wirst weitergeleitet…",
  "admin.welcome.invalid":
    "Dieser Link ist ungültig oder abgelaufen. Bitte um eine neue Einladung.",

  "admin.ai.title": "KI-Entwurf",
  "admin.ai.subtitle": "Aus deinen Fotos, Routen und Notizen — in deinem Stil.",
  "admin.ai.notes":
    "Notizen — Stichpunkte, Route, Höhepunkte, Begleitung …",
  "admin.ai.suggestQuestions": "Fragen vorschlagen",
  "admin.ai.answersHint":
    "Beantworte ein paar Fragen für einen besseren Entwurf (optional):",
  "admin.ai.generate": "Entwurf erstellen",
  "admin.ai.skip": "Entwurf erstellen",
  "admin.ai.generating": "Schreibe…",
  "admin.ai.done": "Entwurf erstellt — unten prüfen und anpassen.",
  "admin.ai.overwriteConfirm":
    "Vorhandenen Text durch den KI-Entwurf ersetzen?",
  "admin.ai.step.enrich": "Fotos analysieren",
  "admin.ai.step.outline": "Gliederung erstellen",
  "admin.ai.step.section": "Abschnitt {a}/{b} schreiben",
  "admin.ai.step.captions": "Bildunterschriften",
  "admin.ai.step.save": "Speichern",
  "admin.ai.autocaption": "Fotos automatisch beschriften",
  "admin.ai.autocaptionDone": "{n} Fotos beschriftet.",

  "admin.usage.link": "KI-Kosten",
  "admin.usage.title": "KI-Nutzung & Kosten",
  "admin.usage.subtitle":
    "Geschätzte DeepSeek-Kosten. Token-Zahlen sind exakt; die Kosten basieren auf deinen Tarifen.",
  "admin.usage.month": "Diesen Monat",
  "admin.usage.total": "Gesamt",
  "admin.usage.calls": "Aufrufe",
  "admin.usage.cacheRate": "Cache-Trefferquote",
  "admin.usage.byOp": "Nach Vorgang",
  "admin.usage.recent": "Letzte Aufrufe",
  "admin.usage.none": "Noch keine KI-Nutzung.",

  "admin.upload.cover": "Titelbild",
  "admin.upload.drop": "Bild hierher ziehen oder zum Hochladen klicken",
  "admin.upload.uploading": "Wird hochgeladen…",
  "admin.upload.replace": "Ersetzen",

  "admin.gallery.title": "Galerie",
  "admin.gallery.subtitle":
    "Automatisch gespeichert — Uploads, Bildunterschriften und Löschungen wirken sofort (kein Speichern nötig).",
  "admin.gallery.photos": "{n} Fotos",
  "admin.gallery.caption": "Bildunterschrift…",
  "admin.gallery.alt": "Alt-Text…",
  "admin.gallery.copyTag": "Inline-Tag kopieren",
  "admin.gallery.copied": "Kopiert!",
  "admin.gallery.add": "Fotos hinzufügen",
  "admin.gallery.camera": "Kamera",
  "admin.gallery.located": "Verortet",
  "admin.gallery.saved": "Gespeichert ✓",

  "admin.routes.title": "Routen",
  "admin.routes.subtitle":
    "Lade GPX-Tracks hoch, um die Reise auf der Karte zu zeichnen. Automatisch gespeichert.",
  "admin.routes.upload": "GPX hochladen",
  "admin.routes.reading": "Wird gelesen…",
  "admin.routes.track": "Track",

  "admin.ask.title": "Umfragen & Quizze",
  "admin.ask.subtitle":
    "Erstelle einen Block und setze dann sein [ask:ID]-Tag in den Text. Automatisch gespeichert.",
  "admin.ask.copyTag": "Tag kopieren",
  "admin.ask.copied": "Kopiert!",
  "admin.ask.edit": "Bearbeiten",
  "admin.ask.save": "Änderungen speichern",
  "admin.ask.cancel": "Abbrechen",
  "admin.ask.editing": "Bearbeiten",
  "admin.ask.question": "Frage",
  "admin.ask.option": "Option {n}",
  "admin.ask.addOption": "Option hinzufügen",
  "admin.ask.explanation": "Erklärung nach der Antwort (optional)",
  "admin.ask.addPoll": "Umfrage hinzufügen",
  "admin.ask.addQuiz": "Quiz hinzufügen",
  "admin.ask.adding": "Hinzufügen…",
  "admin.ask.errQuestion": "Gib eine Frage ein.",
  "admin.ask.errOptions": "Gib mindestens zwei Optionen an.",
  "admin.ask.errCorrect": "Wähle, welche Option richtig ist.",

  "push.enable": "Benachrichtigungen aktivieren",
  "push.enabling": "Aktivieren…",
  "push.on": "Benachrichtigungen an",
  "push.blocked": "Im Browser blockiert",
  "push.unsupported": "Push wird hier nicht unterstützt.",
  "push.setKeys": "Setze VAPID-Schlüssel, um Push-Benachrichtigungen zu aktivieren.",
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

/** The default-locale string for a key — for static `metadata` (SSR/SEO). The
 *  visible tab title is then localized on the client by <DocumentTitle>. */
export function defaultTitle(key: DictKey): string {
  return translate(DEFAULT_LOCALE, key);
}
