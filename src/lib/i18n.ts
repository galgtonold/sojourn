// UI-chrome translations (post content stays in whatever language it's written).
// German is the default.
export type Locale = "de" | "en";
export const LOCALES: Locale[] = ["de", "en"];
export const LOCALE_COOKIE = "locale";

/**
 * The locale the server renders before a visitor has chosen one — which is also
 * the one search engines and link previews see. German unless the deployment
 * says otherwise: an English-speaking self-hoster (and the public demo) should
 * not have to open in a language they don't read and then find the switcher.
 */
export function pickDefaultLocale(value: string | undefined | null): Locale {
  return value === "en" || value === "de" ? value : "de";
}

export const DEFAULT_LOCALE: Locale = pickDefaultLocale(
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
);

/** A per-language string (editable branding copy keyed by locale). */
export type LangPair = Record<Locale, string>;

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

  "footer.tagline":
    "A travel journal. Built to wander, hopeless at staying put.",

  "home.kicker": "field notes, lightly exaggerated",
  "home.heroLeadA": "Photos, maps & dubious decisions from",
  "home.heroLeadB": "places no guidebook recommends",
  "home.readCta": "Read",
  "home.latest": "Latest stories",
  "home.latestSub": "The most recent dispatches from the trail.",
  "home.allEntries": "All stories",
  "home.allTrips": "All journeys",
  "home.tripsTitle": "Journeys",
  "home.tripsSub": "Every trip, gathered — routes, stories and galleries.",
  "home.browseAll": "Browse all {n, plural, one {# story} other {# stories}}",
  "home.noMore": "No more stories yet — check back soon.",
  "home.mapTitle": "Every step, on the map",
  "home.mapBody":
    "Follow the routes, pins and detours across {n, plural, one {# story} other {# stories}} and counting.",
  "home.exploreMap": "Explore the map",

  "common.back": "Back",
  "common.newer": "Newer",
  "common.older": "Older",
  "common.page": "Page {a} of {b}",

  "post.minRead": "min read",
  "post.unpublished": "Unpublished",
  "post.gallery": "Gallery",
  "post.onMap": "On the map",
  "post.navPrev": "Previous",
  "post.navNext": "Next",
  "post.elevation": "Elevation",
  "post.elevation.dayTotal": "Whole day · {n} routes",
  "post.share": "Share",
  "post.linkCopied": "Link copied",
  "post.exploreJourney": "Explore the journey map",

  "comments.title": "Comments",
  "comments.beFirst": "Be the first to say something.",
  "comments.name": "Your name (saved for next time)",
  "comments.note": "Leave a note…",
  "comments.replyTo": "Reply to {name}…",
  "comments.post": "Post comment",
  "comments.posting": "Posting…",
  "comments.reply": "Reply",
  "comments.like": "Like this comment",
  "comments.send": "Send",
  "comments.cancel": "Cancel",
  "comments.loadEarlier": "Load earlier comments ({n} more)",
  "comments.error": "Couldn’t post that — please try again.",
  "comments.anonymous": "Anonymous",

  "common.close": "Close",
  "common.dismiss": "Dismiss",
  "common.confirm": "Confirm",
  "common.ok": "OK",
  "common.cancel": "Cancel",
  "common.delete": "Delete",

  "journey.back": "Back to {label}",
  "journey.openPhoto": "Open photo",
  "journey.viewStory": "View story →",
  "journey.prev": "Prev",
  "journey.next": "Next",
  "journey.goToStop": "Go to stop {n}",
  "journey.scrub": "Scrub through the journey",
  "map.openStory": "Open story →",
  "map.route": "Route",

  "meta.tagline": "a travel journal",
  "meta.trips": "Trips",
  "meta.map": "Map",
  "meta.posts": "All stories",
  "meta.journeyMap": "Journey map",
  "meta.admin": "Admin",
  "meta.adminPosts": "Posts",
  "meta.newTrip": "New trip",
  "meta.editTrip": "Edit trip",
  "meta.newPost": "New post",
  "meta.editPost": "Edit post",
  "meta.preview": "Preview",
  "meta.aiUsage": "AI usage",
  "meta.members": "Collaborators",
  "meta.comments": "Comments",
  "meta.interactions": "Polls & Quizzes",

  "notFound.title": "Off the map",
  "notFound.body": "This trail doesn’t lead anywhere — yet.",
  "notFound.back": "Back to the journal",
  "error.title": "That didn’t load",
  "error.body":
    "Something went wrong fetching this page. It’s usually temporary — try again.",
  "error.retry": "Try again",

  "preview.draft": "Draft preview",
  "preview.notPublished": "not published",
  "preview.backToEditor": "Back to editor",

  "common.previous": "Previous",
  "common.next": "Next",

  "post.routeFallback": "Route",
  "post.elevationAria": "Elevation profile",

  "admin.gallery.delete": "Delete photo",
  "admin.gallery.deleteConfirm": "Delete this photo? This can’t be undone.",
  "admin.gallery.geotagged": "Geotagged from EXIF — shows on the map",
  "admin.gallery.geo.button": "Locate photos from track",
  "admin.gallery.geo.busy": "Locating…",
  "admin.gallery.geo.done":
    "Placed {n, plural, one {# photo} other {# photos}} of {total} from the track.",
  "admin.gallery.geo.noTimes":
    "No timestamped track found. Upload a GPX recorded with times (re-upload older tracks).",
  "admin.gallery.geo.err": "Couldn’t locate photos from the track.",
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
    "Notifications are blocked for this site. To turn them on, open your browser's site settings (the lock icon in the address bar) → Notifications → Allow.",

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
  "admin.litter.pending":
    "{n, plural, one {# inline poll/quiz block} other {# inline poll/quiz blocks}} will be created on save.",
  "admin.litter.brokenPhoto": "Reference [photo:{ref}] doesn’t match any photo.",
  "admin.litter.brokenAsk": "Reference [ask:{ref}] doesn’t match any poll/quiz.",
  "admin.litter.badBlock": "Incomplete {kind} block: {problems}.",

  "search.title": "Search",
  "search.subtitle": "Find a place, a trip, or a moment.",
  "search.placeholder": "Patagonia, glaciers, Kyoto…",
  "search.results":
    "{n, plural, one {# result} other {# results}} for “{q}”",
  "search.stories": "Stories",
  "search.photos": "Photos",
  "search.searching": "Searching…",
  "search.noResults": "Nothing found for “{q}”.",
  "search.error": "Search is unavailable right now.",
  "search.retry": "Try again",

  "trips.title": "Trips",
  "trips.subtitle":
    "Each journey, gathered. Routes, stories and galleries grouped by the road that connected them.",
  "trips.entries": "stories",
  "trips.trip": "Trip",
  "trips.exploreTitle": "Explore the journey map",
  "trips.exploreBody":
    "Walk the route step by step — every stop and photo on an interactive map.",
  "trips.photos":
    "{n, plural, one {# located photo} other {# located photos}}",
  "trips.stops": "{n, plural, one {# stop} other {# stops}}",
  "trips.empty": "No stories in this trip yet — once one is published it shows up here.",

  "archive.title": "All stories",
  "archive.subtitle":
    "{n, plural, one {# story} other {# stories}} from the road.",
  "archive.empty": "Nothing here yet.",

  "map.title": "The whole map",
  "map.subtitle": "Every route and photo on one map. Tap a photo to view it — or open its story.",

  "photos.title": "Photo map",
  "photos.subtitle":
    "Every geotagged photo, where it was taken. Zoom in to explore; tap a pin to open the story.",
  "photos.count":
    "{n, plural, one {# photo} other {# photos}} on the map.",
  "photos.empty": "No geotagged photos yet.",
  "photos.inView": "{n} in view",
  "photos.noneInView": "No photos in view — zoom out or pan to find more.",

  // Admin
  "admin.dashboard": "Dashboard",
  "admin.dashboardLink": "Dashboard",
  "admin.signedInAs": "Signed in as {email}",
  "admin.password": "Password",
  "admin.signOut": "Sign out",
  "admin.nav.stories": "Stories",
  "admin.nav.comments": "Comments",
  "admin.nav.interactions": "Interactions",
  "admin.interactions.title": "Polls & Quizzes",
  "admin.interactions.subtitle": "How readers voted, across every article.",
  "admin.interactions.summary":
    "{polls} polls · {quizzes} quizzes · {votes} votes",
  "admin.interactions.votes": "{n, plural, one {# vote} other {# votes}}",
  "admin.interactions.noVotes": "No votes yet",
  "admin.interactions.correct": "Correct",
  "admin.interactions.correctRate": "{pct}% answered correctly",
  "admin.interactions.sortRecent": "Newest",
  "admin.interactions.sortVotes": "Most votes",
  "admin.interactions.allArticles": "All articles",
  "admin.interactions.empty": "No polls or quizzes yet.",
  "admin.nav.viewSite": "View site",
  "admin.statPosts": "Posts",
  "admin.statComments": "Comments",
  "admin.newPost": "New post",
  "admin.postsHeading": "Posts",
  "admin.published": "Published",
  "admin.draft": "Draft",
  "admin.edit": "Edit",
  "admin.preview": "Preview",
  "admin.translation.onPublish": "Translated automatically when published",
  "admin.translation.pending": "Translating…",
  "admin.translation.ready": "Translated",
  "admin.translation.error": "Translation failed",
  "admin.translation.none": "Not translated yet",
  "admin.translation.retranslate": "Re-translate",
  "admin.noPosts": "No posts yet.",
  "admin.posts.title": "Posts",
  "admin.posts.subtitle":
    "{n, plural, one {# entry} other {# entries}} — search, filter, edit or delete.",
  "admin.posts.search": "Search posts…",
  "admin.posts.filter.all": "All",
  "admin.posts.filter.published": "Published",
  "admin.posts.filter.draft": "Drafts",
  "admin.posts.allTrips": "All trips",
  "admin.posts.noMatch": "No posts match.",
  "admin.posts.deleteTitle": "Delete post?",
  "admin.posts.deleteConfirm":
    "“{title}” will be permanently deleted with its photos, routes and comments. This can't be undone.",
  "admin.nav.membersSub": "Invite & manage editors",
  "admin.nav.usageSub": "AI spend & tokens",
  "admin.nav.settingsSub": "Branding & writing style",
  "admin.settings.title": "Settings",
  "admin.settings.link": "Settings",
  "admin.settings.styleHeading": "Blog writing style",
  "admin.settings.styleIntro":
    "This guidance steers every AI draft — tone, voice, and vocabulary across the whole blog. It's internal and never shown to readers.",
  "admin.settings.stylePlaceholder":
    "e.g. Warm first-person plural, short sentences, concrete sensory detail, dry humour, no marketing-speak …",
  "admin.settings.propose": "Propose from my posts",
  "admin.settings.saved": "Saved",
  "admin.settings.analyticsHeading": "Analytics",
  "admin.settings.analyticsIntro":
    "Off by default. Sojourn sends nothing anywhere unless you turn it on here — error reporting is separate and stays in the deployment's environment.",
  "admin.settings.analyticsOff": "Off",
  "admin.settings.analyticsVercel": "Vercel Analytics",
  "admin.settings.analyticsVercelNote":
    "This loads Vercel's script. For numbers to actually appear you also need Web Analytics enabled on the project in your Vercel dashboard.",
  "admin.settings.analyticsFromEnv":
    "Currently inherited from NEXT_PUBLIC_ANALYTICS. Choosing here overrides it — including choosing Off.",
  "admin.settings.analyticsError": "Couldn't save that. Try again.",
  "admin.settings.brandHeading": "Branding",
  "admin.settings.brandIntro":
    "The name and tagline shown across the site — in the header, footer, the home hero and page titles. Leave blank to use the defaults.",
  "admin.settings.brandName": "Site name",
  "admin.settings.brandTagline": "Tagline",
  "admin.settings.brandKicker": "Hero intro line",
  "admin.settings.brandHeadline": "Home headline",
  "admin.settings.brandHeadlineHint":
    "Two parts: the lead, then the highlighted clause shown in the accent colour. A period is added automatically.",
  "admin.settings.brandHeadlineAccent": "Highlighted clause",
  "admin.settings.brandPreview": "Preview",
  "admin.settings.brandLangNote": "Edit per language",
  "admin.settings.aiHeading": "AI providers",
  "admin.settings.aiIntro":
    "Keys set here override the deployment's environment variables. Clear a field to fall back to the environment.",
  "admin.settings.aiGroup.deepseek": "Drafting (DeepSeek)",
  "admin.settings.aiGroup.embedding": "Embeddings (semantic search)",
  "admin.settings.aiGroup.vision": "Vision (photo descriptions)",
  "admin.settings.aiField.deepseekApiKey": "API key",
  "admin.settings.aiField.deepseekBaseUrl": "Base URL",
  "admin.settings.aiField.deepseekModelFast": "Fast model",
  "admin.settings.aiField.deepseekModelReasoner": "Reasoning model",
  "admin.settings.aiField.embeddingApiKey": "API key",
  "admin.settings.aiField.embeddingBaseUrl": "Base URL",
  "admin.settings.aiField.embeddingModel": "Model",
  "admin.settings.aiField.visionApiKey": "API key",
  "admin.settings.aiField.visionBaseUrl": "Base URL",
  "admin.settings.aiField.visionModel": "Model",
  "admin.settings.aiSource.db": "Set here",
  "admin.settings.aiSource.env": "From environment",
  "admin.settings.aiSource.inherited": "Inherited",
  "admin.settings.aiSource.unset": "Not set",
  "admin.settings.aiClear": "Clear",
  "admin.settings.aiSecretSet":
    "A key is stored ({masked}). Type a new one to replace it.",
  "admin.settings.aiTest": "Test connection",
  "admin.settings.aiTestUnsaved": "Save your changes to test this connection.",
  "admin.settings.aiTestOk": "Works — {detail}",
  "admin.settings.aiTestFail": "Connection failed — {detail}",
  "admin.settings.aiTestRejected": "Rejected — {detail}",
  "admin.settings.aiTestNoKey": "Not configured",
  "admin.settings.aiOff": "AI is off. Add a drafting key to turn the AI features on.",
  "admin.recentComments": "Recent comments",
  "admin.moderateAll": "Moderate all →",
  "admin.noComments": "No comments yet.",

  "admin.login.title": "Admin",
  "admin.login.emailPlaceholder": "you@example.com",
  "admin.login.subtitle": "Sign in to manage entries, photos and comments.",
  "admin.login.password": "Password",
  "admin.login.signIn": "Sign in",
  "admin.login.signingIn": "Signing in…",

  "demo.login.or": "or",
  "demo.login.enter": "Explore the demo",
  "demo.login.entering": "Opening the demo…",
  "demo.login.hint": "Read-only. No account needed.",
  "demo.login.failed": "The demo is having a moment. Try again shortly.",
  "demo.banner.label": "Demo",
  "demo.banner.text": "Read-only — nothing you change is saved.",
  "demo.banner.cta": "Get Sojourn",
  "demo.comments.off":
    "New comments are switched off in the demo — the ones above are part of it. On your own Sojourn, anyone can reply here.",
  "demo.blocked":
    "This is a read-only demo, so that didn't save. Everything else works — have a look around.",

  "admin.setup.title": "Welcome to Sojourn",
  "admin.setup.subtitle":
    "Create the owner account to finish setting up this site.",
  "admin.setup.emailPlaceholder": "you@example.com",
  "admin.setup.password": "Password (min 8 characters)",
  "admin.setup.passwordRepeat": "Repeat password",
  "admin.setup.create": "Create owner account",
  "admin.setup.creating": "Creating…",
  "admin.setup.mismatch": "The passwords don't match.",
  "admin.setup.errorOwnerExists":
    "This site is already set up — head to the sign-in page.",
  "admin.setup.goToLogin": "Go to sign-in",
  "admin.setup.errorEmailTaken": "An account with this email already exists.",
  "admin.setup.errorRateLimited":
    "Too many attempts — wait a moment and try again.",
  "admin.setup.errorGeneric": "Setup failed. Check the server logs and try again.",
  "admin.setup.notReadyTitle": "Almost there",
  "admin.setup.notReadyBody":
    "First-run setup needs the server-side service role key (SUPABASE_SERVICE_ROLE_KEY) and the database migrations from supabase/migrations. Add them and reload — or create the owner manually in the Supabase dashboard (Auth → Users), as described in the README.",

  "admin.setup.siteName": "What is this site called?",
  "admin.setup.expiredTitle": "Setup window closed",
  "admin.setup.expiredBody":
    "This install only accepts its first account for a limited time after setup, so an unfinished deploy can't sit here waiting to be claimed by someone else. That time has passed. Restart or redeploy the site to get another window — or, if that's awkward, run this in your database and reload:",
  "admin.setup.errorExpired":
    "The setup window closed while you were filling this in. Reload the page for instructions.",

  "admin.onboarding.title": "Finish setting up",
  "admin.onboarding.progress": "{done} of {total}",
  "admin.onboarding.optional": "Optional",
  "admin.onboarding.name": "Name your site",
  "admin.onboarding.nameHint": "It still goes by the default title.",
  "admin.onboarding.tagline": "Write a tagline",
  "admin.onboarding.taglineHint":
    "The line under the title — it shows in the footer and in search results.",
  "admin.onboarding.trip": "Add your first journey",
  "admin.onboarding.tripHint": "Entries live inside a journey.",
  "admin.onboarding.post": "Publish your first entry",
  "admin.onboarding.postHint": "Drafts stay private until you publish them.",
  "admin.onboarding.ai": "Turn on AI drafting",
  "admin.onboarding.aiHint":
    "Add a provider key to draft, caption and translate.",

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
  "admin.account.errGeneric": "Something went wrong. Please try again.",
  "admin.err.storageUnavailable": "Storage isn’t available.",
  "admin.err.uploadFailed": "Upload failed. Please try again.",
  "admin.err.gpx": "Couldn’t read that GPX file.",
  "admin.err.save": "Couldn’t save. Please try again.",
  "admin.err.ai": "The AI request failed. Please try again.",
  "admin.err.aiRefresh":
    "Couldn’t refresh — reload the page to see the latest state.",
  "admin.err.videoFormat": "That video format isn’t supported — please use MP4.",
  "admin.err.videoTooLarge": "Video is larger than 50 MB.",

  "admin.cmod.title": "Comments",
  "admin.cmod.subtitle":
    "Grouped by post and threaded. Hide spam or off-topic notes (they stay in the database) or delete them for good.",
  "admin.cmod.recent200": " Showing the 200 most recent.",
  "admin.cmod.none": "No comments yet.",
  "admin.cmod.reply": "reply",
  "admin.cmod.hidden": "hidden",
  "admin.cmod.hide": "Hide",
  "admin.cmod.unhide": "Unhide",
  "admin.cmod.delete": "Delete",
  "admin.cmod.comments": "{n} comments",
  "admin.cmod.comment": "{n} comment",
  "admin.cmod.deleteConfirm": "Delete this comment (and its replies) permanently?",
  "admin.cmod.actionFailed":
    "That didn't go through — you may not have access, or the connection dropped. Please try again.",

  "admin.editor.newPost": "New post",
  "admin.editor.editPost": "Edit post",
  "admin.newPost.noTrip":
    "You're not part of a trip yet, so there's nowhere to file a post. Ask the owner to add you to a trip first.",
  "admin.newPost.failed":
    "Couldn't start a new draft. Please try again in a moment.",
  "admin.editor.title": "Title",
  "admin.editor.location": "Location (e.g. Kyoto, Japan)",
  "admin.editor.date": "Date of this entry",
  "admin.editor.coverUrl": "…or paste an image URL",
  "admin.editor.coverAlt": "Cover alt text (describe the image for screen readers)",
  "admin.editor.lat": "Latitude",
  "admin.editor.lng": "Longitude",
  "admin.editor.pickLocation":
    "Tap the map to set the location, or enter coordinates below.",
  "admin.editor.mapError": "Map couldn’t load — enter coordinates below instead.",
  "admin.editor.excerpt": "Excerpt",
  "admin.editor.body": "Write your story…",
  "admin.editor.helpLabel": "Formatting",
  "admin.editor.help.intro":
    "Prose is plain Markdown. Photos and polls go in via the insert bar above — no need to type anything.",
  "admin.editor.help.heading": "Heading",
  "admin.editor.help.bold": "Bold",
  "admin.editor.help.italic": "Italic",
  "admin.editor.help.quote": "Quote",
  "admin.editor.help.list": "List item",
  "admin.editor.help.link": "Link",
  "admin.editor.help.colType": "You type",
  "admin.editor.help.colResult": "Result",
  "admin.editor.insertBar": "Insert — drop a photo, poll or quiz at the cursor.",
  "admin.editor.insertPhoto": "Insert this photo at the cursor",
  "admin.editor.insertInteraction": "Insert this poll or quiz at the cursor",
  "admin.editor.stage.trip": "Trip",
  "admin.editor.stage.photos": "Photos",
  "admin.editor.stage.track": "GPS track",
  "admin.editor.stage.polls": "Polls & quizzes",
  "admin.editor.stage.ai": "AI assist",
  "admin.editor.stage.article": "Article",
  "admin.editor.stage.details": "Details",
  "admin.editor.group.setup": "Setup",
  "admin.editor.group.compose": "Compose",
  "admin.editor.group.finish": "Finish",
  "admin.editor.status.photo": "{n} photo",
  "admin.editor.status.photos": "{n} photos",
  "admin.editor.status.track": "{n} km",
  "admin.editor.status.trackNone": "none",
  "admin.editor.status.polls": "{n} defined",
  "admin.editor.status.draft": "Draft · {n} min",
  "admin.editor.status.empty": "Empty",
  "admin.editor.status.published": "Published",
  "admin.editor.status.unpublished": "Not published",
  "admin.editor.bar.save": "Save",
  "admin.editor.bar.saving": "Saving…",
  "admin.editor.bar.saved": "Saved",
  "admin.editor.bar.publish": "Publish",
  "admin.editor.bar.unpublish": "Unpublish",
  "admin.editor.cover.title": "Cover",
  "admin.editor.cover.pick": "Pick one of your photos",
  "admin.editor.cover.advanced": "URL & alt text",
  "admin.editor.cover.none": "No cover yet",
  "admin.editor.details.place": "Place",
  "admin.editor.details.pin": "Map pin",
  "admin.editor.details.summary": "Summary",
  "admin.editor.details.summaryHint":
    "Shown on cards and in link previews — one or two sentences that make someone open it.",
  "admin.editor.date.none": "Pick a date",
  "admin.editor.date.today": "Today",
  "admin.editor.date.clear": "Clear",
  "admin.editor.date.prevMonth": "Previous month",
  "admin.editor.date.nextMonth": "Next month",
  "admin.editor.removeObject": "Remove from the article",
  "admin.editor.save": "Save",
  "admin.editor.saving": "Saving…",
  "admin.editor.delete": "Delete",
  "admin.editor.deleteConfirm": "Delete this post permanently?",
  "admin.editor.saveFailed": "Save failed",
  "admin.editor.publishNeedsFields": "Add a title and pick a trip to publish.",
  "admin.editor.trip": "Trip",
  "admin.editor.tripNone": "— No trip —",
  "admin.editor.selectTrip": "Select a trip…",
  "admin.editor.tripContextHint":
    "Pick the trip first — its context feeds the AI generation below.",
  "admin.editor.tripRequiredNoTrips":
    "Every article needs a trip so it stays discoverable — create one first.",

  "admin.trip.heading": "Trips",
  "admin.trip.newTrip": "New trip",
  "admin.trip.editTrip": "Edit trip",
  "admin.trip.none": "No trips yet.",
  "admin.trip.title": "Trip title",
  "admin.trip.cover": "Cover image",
  "admin.trip.summary": "Summary",
  "admin.trip.aiContext": "Internal AI context",
  "admin.trip.aiContextHint":
    "Not shown to readers — used to ground AI-generated posts (who's travelling, goals, style, recurring details).",
  "admin.trip.aiContextPlaceholder":
    "Participants, motivation, travel style, recurring themes…",
  "admin.trip.aiRefineTitle": "Refine with AI",
  "admin.trip.aiAsk": "Ask me questions",
  "admin.trip.aiThinking": "Thinking…",
  "admin.trip.aiGenerate": "Generate context",
  "admin.trip.aiWriting": "Writing…",
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
  "admin.members.resetLink": "Login link",

  "admin.welcome.title": "Welcome aboard",
  "admin.welcome.subtitle": "Set a password to finish setting up your {site} account.",
  "admin.welcome.body": "Choose a password to finish setting up your account.",
  "admin.welcome.save": "Set password",
  "admin.welcome.done": "All set — taking you in…",
  "admin.welcome.invalid":
    "This link is invalid or has expired. Ask for a new invite.",

  "admin.ai.title": "AI draft",
  "admin.ai.subtitle": "From your photos, routes and notes — in your voice.",
  "admin.ai.notes": "Notes — bullet points, route, highlights, who you were with…",
  "admin.ai.dictate.start": "Dictate notes",
  "admin.ai.dictate.stop": "Stop dictation",
  "admin.ai.dictate.hearing": "Listening",
  "admin.ai.dictate.denied": "Microphone access denied — you can still type or use your keyboard's mic.",
  "admin.ai.suggestQuestions": "Suggest questions",
  "admin.ai.askMore": "Ask more questions",
  "admin.ai.addToContext": "Add to context",
  "admin.ai.stop": "Stop",
  "admin.ai.answersHint":
    "Answer a few questions, then add them to your context or generate:",
  "admin.ai.questions.gaps": "Fill the gaps",
  "admin.ai.questions.sparks": "For inspiration",
  "admin.ai.generate": "Generate draft",
  "admin.ai.skip": "Skip & generate",
  "admin.ai.generating": "Writing…",
  "admin.ai.done": "Draft created — review and tweak it below.",
  "admin.ai.overwriteConfirm": "Replace the existing text with the AI draft?",
  "admin.ai.step.questions": "Preparing questions",
  "admin.ai.step.enrich": "Analysing photos",
  "admin.ai.step.outline": "Outlining",
  "admin.ai.step.section": "Writing section {a}/{b}",
  "admin.ai.step.homogenize": "Polishing into one article",
  "admin.ai.step.captionDraft": "Drafting captions",
  "admin.ai.step.brief": "Recalling earlier days",
  "admin.ai.step.captions": "Polishing captions",
  "admin.ai.step.save": "Saving",
  "admin.ai.captionsOverwrite.title": "Existing captions",
  "admin.ai.captionsOverwrite.body":
    "Some photos already have captions. Rewrite them all in the article’s voice, or keep them and only caption the photos that don’t have one yet?",
  "admin.ai.captionsOverwrite.all": "Rewrite all",
  "admin.ai.captionsOverwrite.onlyEmpty": "Only empty",
  "admin.ai.workflowHint":
    "Add your photos and GPX tracks first — the AI weaves them straight into the story. No photos yet? You can still draft from notes and attach them later.",
  "admin.ai.err.parse": "The AI returned malformed output. Please try again.",
  "admin.ai.err.network": "Network hiccup reaching the AI. Please try again.",
  "admin.ai.err.rate":
    "The AI is busy right now (rate limit). Wait a moment and retry.",
  "admin.ai.err.generic": "That step didn’t work. Please try again.",
  "admin.ai.err.noSections":
    "The AI couldn’t write any sections. Try again, or add a few notes first.",
  "admin.ai.warn.captions":
    "Draft saved, but the captions couldn’t be generated — regenerate the draft, or add them in the gallery.",
  "admin.ai.warn.homogenize":
    "Draft saved, but the final polish was skipped — please check the transitions between sections.",
  "admin.ai.warn.partial":
    "Draft saved, but section(s) {list} failed — regenerate, or write those in by hand.",
  "admin.ai.warn.photos":
    "{n, plural, one {# section} other {# sections}} referenced photos that don’t exist — they’re flagged in the editor below; remove or replace them.",

  "admin.proofread.button": "Proofread",
  "admin.proofread.title": "Proofreading",
  "admin.proofread.loading": "Checking your text…",
  "admin.proofread.error": "Couldn’t run the proofread. Try again.",
  "admin.proofread.none": "No issues found. 🎉",
  "admin.proofread.allDone": "All suggestions reviewed.",
  "admin.proofread.progress": "Issue {n} of {total}",
  "admin.proofread.field.title": "Title",
  "admin.proofread.field.excerpt": "Summary",
  "admin.proofread.field.body": "Body",
  "admin.proofread.type.spelling": "Spelling",
  "admin.proofread.type.grammar": "Grammar",
  "admin.proofread.type.punctuation": "Punctuation",
  "admin.proofread.type.capitalization": "Capitalization",
  "admin.proofread.type.wordchoice": "Word choice",
  "admin.proofread.apply": "Apply",
  "admin.proofread.applyAll": "Apply all",
  "admin.proofread.skip": "Skip",
  "admin.proofread.prev": "Previous",
  "admin.proofread.next": "Next",
  "admin.proofread.done": "Done",
  "admin.proofread.stale": "You already changed this — skipped.",
  "admin.proofread.summary":
    "{applied, plural, one {# applied} other {# applied}} · {skipped} skipped",
  "admin.proofread.nudgeTitle": "Proofread before publishing?",
  "admin.proofread.nudgeBody":
    "You haven’t proofread this version. Catch typos before it goes live?",
  "admin.proofread.proofreadFirst": "Proofread first",
  "admin.proofread.publishAnyway": "Publish anyway",

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
  "admin.gallery.photos": "{n, plural, one {# photo} other {# photos}}",
  "admin.gallery.caption": "Caption…",
  "admin.gallery.alt": "Alt text…",
  "admin.gallery.copyTag": "Copy inline tag",
  "admin.gallery.copied": "Copied!",
  "admin.gallery.add": "Add photos",
  "admin.gallery.camera": "Camera",
  "admin.gallery.located": "Located",
  "admin.gallery.saved": "Saved ✓",
  "admin.gallery.addMedia": "Add photo or video",
  "admin.gallery.reorder": "Reorder",
  "admin.gallery.reorderHint": "Drag photos into the order you want.",
  "admin.gallery.reorderDone": "Done",
  "admin.gallery.sortByTime": "Sort by capture time",
  "admin.gallery.sortedByTime": "Sorted by capture time.",
  "admin.gallery.uploadFailed": "Couldn’t upload: {list}",
  "gallery.playVideo": "Play video",

  "admin.location.title": "Set location",
  "admin.location.photoTitle": "Photo location",
  "admin.location.none": "No location set",
  "admin.location.set": "Set",
  "admin.location.change": "Change",
  "admin.location.save": "Save location",
  "admin.location.clear": "Clear",

  "admin.routes.title": "Routes",
  "admin.routes.subtitle":
    "Upload GPX tracks to draw the journey on the map. Saved automatically.",
  "admin.routes.upload": "Upload GPX",
  "admin.routes.reading": "Reading…",
  "admin.routes.track": "Track",
  "admin.routes.part": "Part {n}",
  "admin.routes.uploadFailed": "Couldn’t import: {list}",
  "admin.routes.rename": "Rename track",
  "admin.routes.namePlaceholder": "Track name",
  "admin.routes.save": "Save name",
  "admin.routes.split.title": "Split this track?",
  "admin.routes.split.body":
    "This file has {n} segments (likely transport pauses between them). Import them separately, or merge into one track?",
  "admin.routes.split.split": "Split into {n}",
  "admin.routes.split.keepOne": "Keep as one",

  "admin.ask.title": "Polls & quizzes",
  "admin.ask.subtitle":
    "Define a poll or quiz here, then insert it from the bar above the article. Saved automatically.",
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
  "push.permissionHint":
    "Still waiting? Chrome may be hiding the prompt behind the bell icon in your address bar — click it to allow.",
  "push.viewer": "Notifications",
  "push.on": "Notifications on",
  "push.blocked": "Blocked in browser",
  "push.blockedHelp":
    "Re-enable in your browser: the lock icon in the address bar → Site settings → Notifications → Allow, then reload.",
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
    "Ein Reisetagebuch. Fürs Umherziehen gemacht, beim Stillsitzen chancenlos.",

  "home.kicker": "Notizen von unterwegs, leicht übertrieben",
  "home.heroLeadA": "Fotos, Karten & dubiose Entscheidungen von",
  "home.heroLeadB": "Orten, die kein Reiseführer empfiehlt",
  "home.readCta": "Zur Geschichte",
  "home.latest": "Neueste Geschichten",
  "home.latestSub": "Die jüngsten Eindrücke von unterwegs.",
  "home.allEntries": "Alle Geschichten",
  "home.allTrips": "Alle Reisen",
  "home.tripsTitle": "Reisen",
  "home.tripsSub": "Jede Reise, gesammelt — Routen, Geschichten und Galerien.",
  "home.browseAll":
    "Alle {n, plural, one {# Geschichte} other {# Geschichten}} ansehen",
  "home.noMore": "Noch keine weiteren Geschichten — schau bald wieder vorbei.",
  "home.mapTitle": "Jeder Schritt, auf der Karte",
  "home.mapBody":
    "Folge den Routen, Pins und Abstechern über {n, plural, one {# Geschichte} other {# Geschichten}} und mehr.",
  "home.exploreMap": "Karte erkunden",

  "common.back": "Zurück",
  "common.newer": "Neuer",
  "common.older": "Älter",
  "common.page": "Seite {a} von {b}",

  "post.minRead": "Min. Lesezeit",
  "post.unpublished": "Unveröffentlicht",
  "post.gallery": "Galerie",
  "post.onMap": "Auf der Karte",
  "post.navPrev": "Vorheriger",
  "post.navNext": "Nächster",
  "post.elevation": "Höhenprofil",
  "post.elevation.dayTotal": "Ganzer Tag · {n} Routen",
  "post.share": "Teilen",
  "post.linkCopied": "Link kopiert",
  "post.exploreJourney": "Reisekarte erkunden",

  "comments.title": "Kommentare",
  "comments.beFirst": "Sei der Erste.",
  "comments.name": "Dein Name (wird gespeichert)",
  "comments.note": "Hinterlasse eine Notiz…",
  "comments.replyTo": "Antwort an {name}…",
  "comments.post": "Kommentieren",
  "comments.posting": "Senden…",
  "comments.reply": "Antworten",
  "comments.like": "Diesen Kommentar liken",
  "comments.send": "Senden",
  "comments.cancel": "Abbrechen",
  "comments.loadEarlier": "Frühere Kommentare laden ({n} weitere)",
  "comments.error": "Konnte nicht gesendet werden — bitte erneut versuchen.",
  "comments.anonymous": "Anonym",

  "common.close": "Schließen",
  "common.dismiss": "Ausblenden",
  "common.confirm": "Bestätigen",
  "common.ok": "OK",
  "common.cancel": "Abbrechen",
  "common.delete": "Löschen",

  "journey.back": "Zurück zu {label}",
  "journey.openPhoto": "Foto öffnen",
  "journey.viewStory": "Beitrag ansehen →",
  "journey.prev": "Zurück",
  "journey.next": "Weiter",
  "journey.goToStop": "Zu Station {n}",
  "journey.scrub": "Durch die Reise navigieren",
  "map.openStory": "Beitrag öffnen →",
  "map.route": "Route",

  "meta.tagline": "ein Reisetagebuch",
  "meta.trips": "Reisen",
  "meta.map": "Karte",
  "meta.posts": "Alle Geschichten",
  "meta.journeyMap": "Reisekarte",
  "meta.admin": "Admin",
  "meta.adminPosts": "Beiträge",
  "meta.newTrip": "Neue Reise",
  "meta.editTrip": "Reise bearbeiten",
  "meta.newPost": "Neuer Beitrag",
  "meta.editPost": "Beitrag bearbeiten",
  "meta.preview": "Vorschau",
  "meta.aiUsage": "KI-Nutzung",
  "meta.members": "Mitwirkende",
  "meta.comments": "Kommentare",
  "meta.interactions": "Umfragen & Quiz",

  "notFound.title": "Abseits der Karte",
  "notFound.body": "Dieser Pfad führt (noch) nirgendwohin.",
  "notFound.back": "Zurück zum Journal",
  "error.title": "Das hat nicht geladen",
  "error.body":
    "Beim Laden dieser Seite ist etwas schiefgegangen. Meist ist das vorübergehend — versuch es noch einmal.",
  "error.retry": "Nochmal versuchen",

  "preview.draft": "Entwurfsvorschau",
  "preview.notPublished": "nicht veröffentlicht",
  "preview.backToEditor": "Zurück zum Editor",

  "common.previous": "Zurück",
  "common.next": "Weiter",

  "post.routeFallback": "Route",
  "post.elevationAria": "Höhenprofil",

  "admin.gallery.delete": "Foto löschen",
  "admin.gallery.deleteConfirm": "Dieses Foto löschen? Das kann nicht rückgängig gemacht werden.",
  "admin.gallery.geotagged": "Geotag aus EXIF — erscheint auf der Karte",
  "admin.gallery.geo.button": "Fotos per Track verorten",
  "admin.gallery.geo.busy": "Wird verortet…",
  "admin.gallery.geo.done":
    "{n, plural, one {# Foto} other {# Fotos}} von {total} per Track verortet.",
  "admin.gallery.geo.noTimes":
    "Kein Track mit Zeitstempeln gefunden. Lade eine GPX mit Zeiten hoch (ältere Tracks neu hochladen).",
  "admin.gallery.geo.err": "Fotos konnten nicht per Track verortet werden.",
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
    "Benachrichtigungen sind für diese Seite blockiert. Zum Aktivieren: Website-Einstellungen im Browser öffnen (Schloss-Symbol in der Adressleiste) → Benachrichtigungen → Zulassen.",

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
    "{n, plural, one {# Inline-Umfrage/-Quiz-Block wird} other {# Inline-Umfrage/-Quiz-Blöcke werden}} beim Speichern erstellt.",
  "admin.litter.brokenPhoto": "Verweis [photo:{ref}] passt zu keinem Foto.",
  "admin.litter.brokenAsk": "Verweis [ask:{ref}] passt zu keiner Umfrage/Quiz.",
  "admin.litter.badBlock": "Unvollständiger {kind}-Block: {problems}.",

  "search.title": "Suche",
  "search.subtitle": "Finde einen Ort, eine Reise oder einen Moment.",
  "search.placeholder": "Patagonien, Gletscher, Kyoto…",
  "search.results":
    "{n, plural, one {# Treffer} other {# Treffer}} für „{q}“",
  "search.stories": "Geschichten",
  "search.photos": "Fotos",
  "search.searching": "Suche läuft…",
  "search.noResults": "Nichts gefunden für „{q}“.",
  "search.error": "Die Suche ist gerade nicht verfügbar.",
  "search.retry": "Erneut versuchen",

  "trips.title": "Reisen",
  "trips.subtitle":
    "Jede Reise, gesammelt. Routen, Geschichten und Galerien — geordnet nach dem Weg, der sie verband.",
  "trips.entries": "Geschichten",
  "trips.trip": "Reise",
  "trips.exploreTitle": "Reisekarte erkunden",
  "trips.exploreBody":
    "Geh die Route Schritt für Schritt ab — jeder Halt und jedes Foto auf einer interaktiven Karte.",
  "trips.photos":
    "{n, plural, one {# verortetes Foto} other {# verortete Fotos}}",
  "trips.stops": "{n, plural, one {# Station} other {# Stationen}}",
  "trips.empty": "Noch keine Geschichten in dieser Reise — sobald eine veröffentlicht ist, erscheint sie hier.",

  "archive.title": "Alle Geschichten",
  "archive.subtitle":
    "{n, plural, one {# Geschichte} other {# Geschichten}} von unterwegs.",
  "archive.empty": "Hier ist noch nichts.",

  "map.title": "Die ganze Karte",
  "map.subtitle":
    "Alle Routen und Fotos auf einer Karte. Tippe ein Foto an, um es anzusehen — oder öffne seine Geschichte.",

  "photos.title": "Fotokarte",
  "photos.subtitle":
    "Jedes Foto mit Standort, dort wo es entstand. Zoome hinein; tippe einen Pin an, um die Geschichte zu öffnen.",
  "photos.count":
    "{n, plural, one {# Foto} other {# Fotos}} auf der Karte.",
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
  "admin.nav.stories": "Geschichten",
  "admin.nav.comments": "Kommentare",
  "admin.nav.interactions": "Interaktionen",
  "admin.interactions.title": "Umfragen & Quiz",
  "admin.interactions.subtitle":
    "Wie Leser abgestimmt haben – über alle Beiträge hinweg.",
  "admin.interactions.summary":
    "{polls} Umfragen · {quizzes} Quizze · {votes} Stimmen",
  "admin.interactions.votes": "{n, plural, one {# Stimme} other {# Stimmen}}",
  "admin.interactions.noVotes": "Noch keine Stimmen",
  "admin.interactions.correct": "Richtig",
  "admin.interactions.correctRate": "{pct}% richtig beantwortet",
  "admin.interactions.sortRecent": "Neueste",
  "admin.interactions.sortVotes": "Meiste Stimmen",
  "admin.interactions.allArticles": "Alle Beiträge",
  "admin.interactions.empty": "Noch keine Umfragen oder Quizze.",
  "admin.nav.viewSite": "Zur Seite",
  "admin.statPosts": "Beiträge",
  "admin.statComments": "Kommentare",
  "admin.newPost": "Neuer Beitrag",
  "admin.postsHeading": "Beiträge",
  "admin.published": "Veröffentlicht",
  "admin.draft": "Entwurf",
  "admin.edit": "Bearbeiten",
  "admin.preview": "Vorschau",
  "admin.translation.onPublish": "Wird beim Veröffentlichen automatisch übersetzt",
  "admin.translation.pending": "Übersetze…",
  "admin.translation.ready": "Übersetzt",
  "admin.translation.error": "Übersetzung fehlgeschlagen",
  "admin.translation.none": "Noch nicht übersetzt",
  "admin.translation.retranslate": "Neu übersetzen",
  "admin.noPosts": "Noch keine Beiträge.",
  "admin.posts.title": "Beiträge",
  "admin.posts.subtitle":
    "{n, plural, one {# Eintrag} other {# Einträge}} — suchen, filtern, bearbeiten oder löschen.",
  "admin.posts.search": "Beiträge suchen…",
  "admin.posts.filter.all": "Alle",
  "admin.posts.filter.published": "Veröffentlicht",
  "admin.posts.filter.draft": "Entwürfe",
  "admin.posts.allTrips": "Alle Reisen",
  "admin.posts.noMatch": "Keine passenden Beiträge.",
  "admin.posts.deleteTitle": "Beitrag löschen?",
  "admin.posts.deleteConfirm":
    "„{title}“ wird mit allen Fotos, Routen und Kommentaren endgültig gelöscht. Das lässt sich nicht rückgängig machen.",
  "admin.nav.membersSub": "Mitwirkende einladen & verwalten",
  "admin.nav.usageSub": "KI-Kosten & Tokens",
  "admin.nav.settingsSub": "Branding & Schreibstil",
  "admin.settings.title": "Einstellungen",
  "admin.settings.link": "Einstellungen",
  "admin.settings.styleHeading": "Schreibstil des Blogs",
  "admin.settings.styleIntro":
    "Diese Vorgabe leitet jeden KI-Entwurf — Ton, Stimme und Wortschatz im ganzen Blog. Sie ist intern und wird Lesern nie gezeigt.",
  "admin.settings.stylePlaceholder":
    "z. B. Warme Wir-Perspektive, kurze Sätze, konkrete Sinneseindrücke, trockener Humor, kein Werbe-Sprech …",
  "admin.settings.propose": "Aus meinen Beiträgen vorschlagen",
  "admin.settings.saved": "Gespeichert",
  "admin.settings.analyticsHeading": "Statistik",
  "admin.settings.analyticsIntro":
    "Standardmäßig aus. Sojourn sendet nichts nach außen, solange du das hier nicht einschaltest — Fehlerberichte sind davon getrennt und bleiben in der Umgebung des Deployments.",
  "admin.settings.analyticsOff": "Aus",
  "admin.settings.analyticsVercel": "Vercel Analytics",
  "admin.settings.analyticsVercelNote":
    "Das lädt Vercels Skript. Damit tatsächlich Zahlen erscheinen, muss Web Analytics zusätzlich im Vercel-Dashboard für das Projekt aktiviert sein.",
  "admin.settings.analyticsFromEnv":
    "Kommt derzeit aus NEXT_PUBLIC_ANALYTICS. Eine Auswahl hier überschreibt das — auch „Aus“.",
  "admin.settings.analyticsError": "Konnte nicht gespeichert werden. Versuch es nochmal.",
  "admin.settings.brandHeading": "Branding",
  "admin.settings.brandIntro":
    "Name und Untertitel, die überall auf der Seite erscheinen — in Kopf- und Fußzeile, im Start-Hero und in den Seitentiteln. Leer lassen für die Voreinstellungen.",
  "admin.settings.brandName": "Name der Seite",
  "admin.settings.brandTagline": "Untertitel",
  "admin.settings.brandKicker": "Hero-Einleitung",
  "admin.settings.brandHeadline": "Start-Überschrift",
  "admin.settings.brandHeadlineHint":
    "Zwei Teile: der Anfang und der hervorgehobene Teil in der Akzentfarbe. Ein Punkt wird automatisch ergänzt.",
  "admin.settings.brandHeadlineAccent": "Hervorgehobener Teil",
  "admin.settings.brandPreview": "Vorschau",
  "admin.settings.brandLangNote": "Pro Sprache bearbeiten",
  "admin.settings.aiHeading": "KI-Anbieter",
  "admin.settings.aiIntro":
    "Hier gesetzte Schlüssel überschreiben die Umgebungsvariablen des Deployments. Feld zurücksetzen, um wieder die Umgebung zu verwenden.",
  "admin.settings.aiGroup.deepseek": "Textentwürfe (DeepSeek)",
  "admin.settings.aiGroup.embedding": "Embeddings (semantische Suche)",
  "admin.settings.aiGroup.vision": "Vision (Fotobeschreibungen)",
  "admin.settings.aiField.deepseekApiKey": "API-Schlüssel",
  "admin.settings.aiField.deepseekBaseUrl": "Basis-URL",
  "admin.settings.aiField.deepseekModelFast": "Schnelles Modell",
  "admin.settings.aiField.deepseekModelReasoner": "Reasoning-Modell",
  "admin.settings.aiField.embeddingApiKey": "API-Schlüssel",
  "admin.settings.aiField.embeddingBaseUrl": "Basis-URL",
  "admin.settings.aiField.embeddingModel": "Modell",
  "admin.settings.aiField.visionApiKey": "API-Schlüssel",
  "admin.settings.aiField.visionBaseUrl": "Basis-URL",
  "admin.settings.aiField.visionModel": "Modell",
  "admin.settings.aiSource.db": "Hier gesetzt",
  "admin.settings.aiSource.env": "Aus der Umgebung",
  "admin.settings.aiSource.inherited": "Übernommen",
  "admin.settings.aiSource.unset": "Nicht gesetzt",
  "admin.settings.aiClear": "Zurücksetzen",
  "admin.settings.aiSecretSet":
    "Ein Schlüssel ist gespeichert ({masked}). Neuen eingeben, um ihn zu ersetzen.",
  "admin.settings.aiTest": "Verbindung testen",
  "admin.settings.aiTestUnsaved":
    "Speichere deine Änderungen, um diese Verbindung zu testen.",
  "admin.settings.aiTestOk": "Funktioniert — {detail}",
  "admin.settings.aiTestFail": "Verbindung fehlgeschlagen — {detail}",
  "admin.settings.aiTestRejected": "Abgelehnt — {detail}",
  "admin.settings.aiTestNoKey": "Nicht konfiguriert",
  "admin.settings.aiOff":
    "KI ist aus. Füge einen Schlüssel für Textentwürfe hinzu, um die KI-Funktionen zu aktivieren.",
  "admin.recentComments": "Neueste Kommentare",
  "admin.moderateAll": "Alle moderieren →",
  "admin.noComments": "Noch keine Kommentare.",

  "admin.login.title": "Admin",
  "admin.login.emailPlaceholder": "you@example.com",
  "admin.login.subtitle":
    "Melde dich an, um Beiträge, Fotos und Kommentare zu verwalten.",
  "admin.login.password": "Passwort",
  "admin.login.signIn": "Anmelden",
  "admin.login.signingIn": "Anmelden…",

  "demo.login.or": "oder",
  "demo.login.enter": "Demo ansehen",
  "demo.login.entering": "Demo wird geöffnet…",
  "demo.login.hint": "Nur zum Lesen. Kein Konto nötig.",
  "demo.login.failed": "Die Demo streikt gerade. Versuch es gleich noch einmal.",
  "demo.banner.label": "Demo",
  "demo.banner.text": "Nur zum Lesen — Änderungen werden nicht gespeichert.",
  "demo.banner.cta": "Sojourn holen",
  "demo.comments.off":
    "Neue Kommentare sind in der Demo abgeschaltet — die oben gehören dazu. Auf deinem eigenen Sojourn kann hier jede:r antworten.",
  "demo.blocked":
    "Das hier ist eine Demo zum Lesen, gespeichert wurde also nichts. Alles andere funktioniert — schau dich ruhig um.",

  "admin.setup.title": "Willkommen bei Sojourn",
  "admin.setup.subtitle":
    "Lege das Inhaber-Konto an, um die Einrichtung dieser Site abzuschließen.",
  "admin.setup.emailPlaceholder": "you@example.com",
  "admin.setup.password": "Passwort (mind. 8 Zeichen)",
  "admin.setup.passwordRepeat": "Passwort wiederholen",
  "admin.setup.create": "Inhaber-Konto anlegen",
  "admin.setup.creating": "Wird angelegt…",
  "admin.setup.mismatch": "Die Passwörter stimmen nicht überein.",
  "admin.setup.errorOwnerExists":
    "Diese Site ist bereits eingerichtet — weiter zur Anmeldung.",
  "admin.setup.goToLogin": "Zur Anmeldung",
  "admin.setup.errorEmailTaken":
    "Ein Konto mit dieser E-Mail existiert bereits.",
  "admin.setup.errorRateLimited":
    "Zu viele Versuche — bitte kurz warten und dann erneut versuchen.",
  "admin.setup.errorGeneric":
    "Einrichtung fehlgeschlagen. Prüfe die Server-Logs und versuche es erneut.",
  "admin.setup.notReadyTitle": "Fast geschafft",
  "admin.setup.notReadyBody":
    "Die Ersteinrichtung braucht serverseitig den Service-Role-Key (SUPABASE_SERVICE_ROLE_KEY) und die Datenbank-Migrationen aus supabase/migrations. Beides ergänzen und neu laden — oder das Inhaber-Konto manuell im Supabase-Dashboard anlegen (Auth → Users), wie im README beschrieben.",

  "admin.setup.siteName": "Wie heißt diese Site?",
  "admin.setup.expiredTitle": "Einrichtungsfenster geschlossen",
  "admin.setup.expiredBody":
    "Diese Installation nimmt das erste Konto nur begrenzte Zeit nach der Einrichtung an — damit ein unfertiges Deployment nicht darauf wartet, dass jemand anderes es übernimmt. Diese Zeit ist abgelaufen. Starte die Seite neu oder deploye sie erneut, dann öffnet sich das Fenster wieder — oder führe, falls das unpraktisch ist, das hier in deiner Datenbank aus und lade neu:",
  "admin.setup.errorExpired":
    "Das Einrichtungsfenster ist zwischenzeitlich abgelaufen. Lade die Seite neu, dort steht, wie es weitergeht.",

  "admin.onboarding.title": "Einrichtung abschließen",
  "admin.onboarding.progress": "{done} von {total}",
  "admin.onboarding.optional": "Optional",
  "admin.onboarding.name": "Site benennen",
  "admin.onboarding.nameHint": "Sie trägt noch den Standardtitel.",
  "admin.onboarding.tagline": "Untertitel schreiben",
  "admin.onboarding.taglineHint":
    "Die Zeile unter dem Titel — sie steht im Footer und in Suchergebnissen.",
  "admin.onboarding.trip": "Erste Reise anlegen",
  "admin.onboarding.tripHint": "Beiträge gehören immer zu einer Reise.",
  "admin.onboarding.post": "Ersten Beitrag veröffentlichen",
  "admin.onboarding.postHint":
    "Entwürfe bleiben privat, bis du sie veröffentlichst.",
  "admin.onboarding.ai": "KI-Entwürfe aktivieren",
  "admin.onboarding.aiHint":
    "Mit einem Provider-Schlüssel entwirft, betextet und übersetzt die KI.",

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
  "admin.account.errGeneric": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  "admin.err.storageUnavailable": "Speicher ist nicht verfügbar.",
  "admin.err.uploadFailed": "Upload fehlgeschlagen. Bitte erneut versuchen.",
  "admin.err.gpx": "GPX-Datei konnte nicht gelesen werden.",
  "admin.err.save": "Speichern fehlgeschlagen. Bitte erneut versuchen.",
  "admin.err.ai": "Die KI-Anfrage ist fehlgeschlagen. Bitte erneut versuchen.",
  "admin.err.aiRefresh":
    "Aktualisierung fehlgeschlagen — lade die Seite neu, um den aktuellen Stand zu sehen.",
  "admin.err.videoFormat": "Dieses Videoformat wird nicht unterstützt — bitte MP4 verwenden.",
  "admin.err.videoTooLarge": "Video ist größer als 50 MB.",

  "admin.cmod.title": "Kommentare",
  "admin.cmod.subtitle":
    "Nach Beitrag gruppiert und verschachtelt. Verstecke Spam oder Themenfremdes (bleibt in der Datenbank) oder lösche es endgültig.",
  "admin.cmod.recent200": " Es werden die 200 neuesten angezeigt.",
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
  "admin.cmod.actionFailed":
    "Das hat nicht geklappt — vielleicht fehlt dir der Zugriff oder die Verbindung brach ab. Bitte versuch es erneut.",

  "admin.editor.newPost": "Neuer Beitrag",
  "admin.editor.editPost": "Beitrag bearbeiten",
  "admin.newPost.noTrip":
    "Du gehörst noch zu keiner Reise, also gibt es keinen Ort für den Beitrag. Bitte den Owner, dich zuerst einer Reise hinzuzufügen.",
  "admin.newPost.failed":
    "Der Entwurf konnte nicht angelegt werden. Bitte versuch es gleich noch einmal.",
  "admin.editor.title": "Titel",
  "admin.editor.location": "Ort (z. B. Kyoto, Japan)",
  "admin.editor.date": "Datum dieses Eintrags",
  "admin.editor.coverUrl": "…oder Bild-URL einfügen",
  "admin.editor.coverAlt":
    "Alt-Text des Titelbilds (Bild für Screenreader beschreiben)",
  "admin.editor.lat": "Breitengrad",
  "admin.editor.lng": "Längengrad",
  "admin.editor.pickLocation":
    "Tippe auf die Karte, um den Ort zu setzen, oder gib unten Koordinaten ein.",
  "admin.editor.mapError":
    "Karte konnte nicht geladen werden — gib stattdessen unten Koordinaten ein.",
  "admin.editor.excerpt": "Kurzbeschreibung",
  "admin.editor.body": "Schreib deine Geschichte…",
  "admin.editor.helpLabel": "Formatierung",
  "admin.editor.help.intro":
    "Fließtext ist einfaches Markdown. Fotos und Umfragen fügst du über die Leiste oben ein — du musst nichts tippen.",
  "admin.editor.help.heading": "Überschrift",
  "admin.editor.help.bold": "Fett",
  "admin.editor.help.italic": "Kursiv",
  "admin.editor.help.quote": "Zitat",
  "admin.editor.help.list": "Listenpunkt",
  "admin.editor.help.link": "Link",
  "admin.editor.help.colType": "Du tippst",
  "admin.editor.help.colResult": "Ergebnis",
  "admin.editor.insertBar": "Einfügen — Foto, Umfrage oder Quiz an der Cursorposition.",
  "admin.editor.insertPhoto": "Dieses Foto an der Cursorposition einfügen",
  "admin.editor.insertInteraction": "Diese Umfrage oder dieses Quiz an der Cursorposition einfügen",
  "admin.editor.stage.trip": "Reise",
  "admin.editor.stage.photos": "Fotos",
  "admin.editor.stage.track": "GPS-Track",
  "admin.editor.stage.polls": "Umfragen & Quizze",
  "admin.editor.stage.ai": "KI-Assistent",
  "admin.editor.stage.article": "Artikel",
  "admin.editor.stage.details": "Details",
  "admin.editor.group.setup": "Vorbereitung",
  "admin.editor.group.compose": "Schreiben",
  "admin.editor.group.finish": "Abschluss",
  "admin.editor.status.photo": "{n} Foto",
  "admin.editor.status.photos": "{n} Fotos",
  "admin.editor.status.track": "{n} km",
  "admin.editor.status.trackNone": "keiner",
  "admin.editor.status.polls": "{n} angelegt",
  "admin.editor.status.draft": "Entwurf · {n} Min.",
  "admin.editor.status.empty": "Leer",
  "admin.editor.status.published": "Veröffentlicht",
  "admin.editor.status.unpublished": "Nicht veröffentlicht",
  "admin.editor.bar.save": "Speichern",
  "admin.editor.bar.saving": "Speichern…",
  "admin.editor.bar.saved": "Gespeichert",
  "admin.editor.bar.publish": "Veröffentlichen",
  "admin.editor.bar.unpublish": "Zurückziehen",
  "admin.editor.cover.title": "Titelbild",
  "admin.editor.cover.pick": "Eines deiner Fotos wählen",
  "admin.editor.cover.advanced": "URL & Alt-Text",
  "admin.editor.cover.none": "Noch kein Titelbild",
  "admin.editor.details.place": "Ort",
  "admin.editor.details.pin": "Kartenpunkt",
  "admin.editor.details.summary": "Kurzbeschreibung",
  "admin.editor.details.summaryHint":
    "Erscheint auf Karten und in Link-Vorschauen — ein, zwei Sätze, die zum Öffnen einladen.",
  "admin.editor.date.none": "Datum wählen",
  "admin.editor.date.today": "Heute",
  "admin.editor.date.clear": "Löschen",
  "admin.editor.date.prevMonth": "Voriger Monat",
  "admin.editor.date.nextMonth": "Nächster Monat",
  "admin.editor.removeObject": "Aus dem Artikel entfernen",
  "admin.editor.save": "Speichern",
  "admin.editor.saving": "Speichern…",
  "admin.editor.delete": "Löschen",
  "admin.editor.deleteConfirm": "Diesen Beitrag endgültig löschen?",
  "admin.editor.saveFailed": "Speichern fehlgeschlagen",
  "admin.editor.publishNeedsFields": "Zum Veröffentlichen brauchst du Titel und Reise.",
  "admin.editor.trip": "Reise",
  "admin.editor.tripNone": "— Keine Reise —",
  "admin.editor.selectTrip": "Reise wählen…",
  "admin.editor.tripContextHint":
    "Wähle zuerst die Reise — ihr Kontext fließt in die KI-Generierung unten ein.",
  "admin.editor.tripRequiredNoTrips":
    "Jeder Beitrag braucht eine Reise, damit er auffindbar bleibt — leg zuerst eine an.",

  "admin.trip.heading": "Reisen",
  "admin.trip.newTrip": "Neue Reise",
  "admin.trip.editTrip": "Reise bearbeiten",
  "admin.trip.none": "Noch keine Reisen.",
  "admin.trip.title": "Titel der Reise",
  "admin.trip.cover": "Titelbild",
  "admin.trip.summary": "Zusammenfassung",
  "admin.trip.aiContext": "Interner KI-Kontext",
  "admin.trip.aiContextHint":
    "Nicht öffentlich — Grundlage für KI-generierte Beiträge (wer mitreist, Ziele, Stil, wiederkehrende Details).",
  "admin.trip.aiContextPlaceholder":
    "Teilnehmer, Motivation, Reisestil, wiederkehrende Themen…",
  "admin.trip.aiRefineTitle": "Mit KI verfeinern",
  "admin.trip.aiAsk": "Stell mir Fragen",
  "admin.trip.aiThinking": "Denke nach…",
  "admin.trip.aiGenerate": "Kontext generieren",
  "admin.trip.aiWriting": "Schreibe…",
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
  "admin.members.resetLink": "Login-Link",

  "admin.welcome.title": "Willkommen an Bord",
  "admin.welcome.subtitle": "Lege ein Passwort fest, um dein {site}-Konto einzurichten.",
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
  "admin.ai.dictate.start": "Notizen diktieren",
  "admin.ai.dictate.stop": "Diktat stoppen",
  "admin.ai.dictate.hearing": "Höre zu",
  "admin.ai.dictate.denied": "Mikrofonzugriff verweigert — du kannst weiter tippen oder das Mikro deiner Tastatur nutzen.",
  "admin.ai.suggestQuestions": "Fragen vorschlagen",
  "admin.ai.askMore": "Weitere Fragen",
  "admin.ai.addToContext": "Zum Kontext hinzufügen",
  "admin.ai.stop": "Stopp",
  "admin.ai.answersHint":
    "Beantworte ein paar Fragen, dann in den Kontext übernehmen oder erstellen:",
  "admin.ai.questions.gaps": "Lücken füllen",
  "admin.ai.questions.sparks": "Zum Weiterdenken",
  "admin.ai.generate": "Entwurf erstellen",
  "admin.ai.skip": "Überspringen & erstellen",
  "admin.ai.generating": "Schreibe…",
  "admin.ai.done": "Entwurf erstellt — unten prüfen und anpassen.",
  "admin.ai.overwriteConfirm":
    "Vorhandenen Text durch den KI-Entwurf ersetzen?",
  "admin.ai.step.questions": "Fragen vorbereiten",
  "admin.ai.step.enrich": "Fotos analysieren",
  "admin.ai.step.outline": "Gliederung erstellen",
  "admin.ai.step.section": "Abschnitt {a}/{b} schreiben",
  "admin.ai.step.homogenize": "Zu einem Artikel verschmelzen",
  "admin.ai.step.captionDraft": "Bildunterschriften entwerfen",
  "admin.ai.step.brief": "Frühere Reisetage einlesen",
  "admin.ai.step.captions": "Bildunterschriften verfeinern",
  "admin.ai.step.save": "Speichern",
  "admin.ai.captionsOverwrite.title": "Vorhandene Bildunterschriften",
  "admin.ai.captionsOverwrite.body":
    "Einige Fotos haben schon Bildunterschriften. Alle im Ton des Artikels neu schreiben – oder behalten und nur die Fotos ohne Unterschrift beschriften?",
  "admin.ai.captionsOverwrite.all": "Alle neu schreiben",
  "admin.ai.captionsOverwrite.onlyEmpty": "Nur leere",
  "admin.ai.workflowHint":
    "Lade zuerst deine Fotos und GPX-Tracks hoch — die KI baut sie direkt in die Geschichte ein. Noch keine Fotos? Du kannst auch aus Notizen schreiben und sie später ergänzen.",
  "admin.ai.err.parse":
    "Die KI hat fehlerhafte Ausgabe geliefert. Bitte versuch es erneut.",
  "admin.ai.err.network":
    "Verbindungsproblem zur KI. Bitte versuch es erneut.",
  "admin.ai.err.rate":
    "Die KI ist gerade ausgelastet (Rate-Limit). Kurz warten und erneut versuchen.",
  "admin.ai.err.generic": "Dieser Schritt hat nicht geklappt. Bitte versuch es erneut.",
  "admin.ai.err.noSections":
    "Die KI konnte keine Abschnitte schreiben. Erneut versuchen oder zuerst ein paar Notizen ergänzen.",
  "admin.ai.warn.captions":
    "Entwurf gespeichert, aber die Bildunterschriften konnten nicht erstellt werden — Entwurf neu generieren oder in der Galerie ergänzen.",
  "admin.ai.warn.homogenize":
    "Entwurf gespeichert, aber der Feinschliff wurde übersprungen — bitte die Übergänge zwischen den Abschnitten prüfen.",
  "admin.ai.warn.partial":
    "Entwurf gespeichert, aber Abschnitt(e) {list} sind fehlgeschlagen — neu generieren oder von Hand ergänzen.",
  "admin.ai.warn.photos":
    "{n, plural, one {# Abschnitt verweist} other {# Abschnitte verweisen}} auf nicht vorhandene Fotos — im Editor unten markiert; bitte entfernen oder ersetzen.",

  "admin.proofread.button": "Korrektur lesen",
  "admin.proofread.title": "Korrektur",
  "admin.proofread.loading": "Text wird geprüft…",
  "admin.proofread.error": "Die Korrektur ist fehlgeschlagen. Bitte erneut versuchen.",
  "admin.proofread.none": "Keine Fehler gefunden. 🎉",
  "admin.proofread.allDone": "Alle Vorschläge bearbeitet.",
  "admin.proofread.progress": "Fehler {n} von {total}",
  "admin.proofread.field.title": "Titel",
  "admin.proofread.field.excerpt": "Zusammenfassung",
  "admin.proofread.field.body": "Text",
  "admin.proofread.type.spelling": "Rechtschreibung",
  "admin.proofread.type.grammar": "Grammatik",
  "admin.proofread.type.punctuation": "Zeichensetzung",
  "admin.proofread.type.capitalization": "Groß-/Kleinschreibung",
  "admin.proofread.type.wordchoice": "Wortwahl",
  "admin.proofread.apply": "Übernehmen",
  "admin.proofread.applyAll": "Alle übernehmen",
  "admin.proofread.skip": "Überspringen",
  "admin.proofread.prev": "Zurück",
  "admin.proofread.next": "Weiter",
  "admin.proofread.done": "Fertig",
  "admin.proofread.stale": "Bereits geändert — übersprungen.",
  "admin.proofread.summary":
    "{applied, plural, one {# übernommen} other {# übernommen}} · {skipped} übersprungen",
  "admin.proofread.nudgeTitle": "Vor dem Veröffentlichen Korrektur lesen?",
  "admin.proofread.nudgeBody":
    "Diese Version wurde noch nicht geprüft. Tippfehler vor der Veröffentlichung finden?",
  "admin.proofread.proofreadFirst": "Erst Korrektur",
  "admin.proofread.publishAnyway": "Trotzdem veröffentlichen",

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
  "admin.gallery.photos": "{n, plural, one {# Foto} other {# Fotos}}",
  "admin.gallery.caption": "Bildunterschrift…",
  "admin.gallery.alt": "Alt-Text…",
  "admin.gallery.copyTag": "Inline-Tag kopieren",
  "admin.gallery.copied": "Kopiert!",
  "admin.gallery.add": "Fotos hinzufügen",
  "admin.gallery.camera": "Kamera",
  "admin.gallery.located": "Verortet",
  "admin.gallery.saved": "Gespeichert ✓",
  "admin.gallery.addMedia": "Foto oder Video hinzufügen",
  "admin.gallery.reorder": "Sortieren",
  "admin.gallery.reorderHint": "Zieh die Fotos in die gewünschte Reihenfolge.",
  "admin.gallery.reorderDone": "Fertig",
  "admin.gallery.sortByTime": "Nach Aufnahmezeit sortieren",
  "admin.gallery.sortedByTime": "Nach Aufnahmezeit sortiert.",
  "admin.gallery.uploadFailed": "Nicht hochgeladen: {list}",
  "gallery.playVideo": "Video abspielen",

  "admin.location.title": "Standort wählen",
  "admin.location.photoTitle": "Foto-Standort",
  "admin.location.none": "Kein Standort gesetzt",
  "admin.location.set": "Setzen",
  "admin.location.change": "Ändern",
  "admin.location.save": "Standort speichern",
  "admin.location.clear": "Entfernen",

  "admin.routes.title": "Routen",
  "admin.routes.subtitle":
    "Lade GPX-Tracks hoch, um die Reise auf der Karte zu zeichnen. Automatisch gespeichert.",
  "admin.routes.upload": "GPX hochladen",
  "admin.routes.reading": "Wird gelesen…",
  "admin.routes.track": "Track",
  "admin.routes.part": "Teil {n}",
  "admin.routes.uploadFailed": "Nicht importiert: {list}",
  "admin.routes.rename": "Track umbenennen",
  "admin.routes.namePlaceholder": "Track-Name",
  "admin.routes.save": "Name speichern",
  "admin.routes.split.title": "Track aufteilen?",
  "admin.routes.split.body":
    "Diese Datei enthält {n} Abschnitte (wahrscheinlich mit Transport-Pausen dazwischen). Getrennt importieren oder zu einem Track zusammenfassen?",
  "admin.routes.split.split": "In {n} Tracks aufteilen",
  "admin.routes.split.keepOne": "Als einen Track",

  "admin.ask.title": "Umfragen & Quizze",
  "admin.ask.subtitle":
    "Lege hier eine Umfrage oder ein Quiz an und füge sie über die Leiste über dem Artikel ein. Automatisch gespeichert.",
  "admin.ask.copyTag": "Tag kopieren",
  "admin.ask.copied": "Kopiert!",
  "admin.ask.edit": "Bearbeiten",
  "admin.ask.save": "Änderungen speichern",
  "admin.ask.cancel": "Abbrechen",
  "admin.ask.editing": "Wird bearbeitet",
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
  "push.permissionHint":
    "Immer noch nichts? Chrome zeigt die Anfrage manchmal nur als Glocken-Symbol in der Adressleiste an — klicke darauf, um zuzulassen.",
  "push.viewer": "Benachrichtigungen",
  "push.on": "Benachrichtigungen an",
  "push.blocked": "Im Browser blockiert",
  "push.blockedHelp":
    "Im Browser wieder aktivieren: Schloss-Symbol in der Adressleiste → Website-Einstellungen → Benachrichtigungen → Zulassen, dann neu laden.",
  "push.unsupported": "Push wird hier nicht unterstützt.",
  "push.setKeys": "Setze VAPID-Schlüssel, um Push-Benachrichtigungen zu aktivieren.",
};

export const dictionaries: Record<Locale, Dict> = { de, en };
export type DictKey = keyof typeof en;

// Split `one {…} other {…}` (a plural block's body) into its named forms,
// respecting nested braces so a form can itself contain `{…}`.
function parsePluralForms(body: string): Record<string, string> {
  const forms: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const m = /(=\d+|\w+)\s*\{/.exec(body.slice(i));
    if (!m) break;
    const start = i + m.index + m[0].length;
    let depth = 1;
    let j = start;
    for (; j < body.length && depth > 0; j++) {
      if (body[j] === "{") depth++;
      else if (body[j] === "}") depth--;
    }
    forms[m[1]] = body.slice(start, j - 1);
    i = j;
  }
  return forms;
}

// Resolve ICU-style `{name, plural, one {# thing} other {# things}}` blocks so a
// single string can carry its own locale-correct plural (and German verb /
// adjective agreement) — `Intl.PluralRules` picks the form and `#` becomes the
// count. Strings without a plural block are returned untouched.
function selectPlurals(
  locale: Locale,
  s: string,
  vars?: Record<string, string | number>,
): string {
  if (!s.includes(", plural,")) return s;
  const pr = new Intl.PluralRules(locale);
  let out = "";
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    if (open === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, open);
    const head = /^\{\s*(\w+)\s*,\s*plural\s*,/.exec(s.slice(open));
    if (!head) {
      out += "{";
      i = open + 1;
      continue;
    }
    let depth = 0;
    let j = open;
    for (; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}" && --depth === 0) break;
    }
    if (depth !== 0) {
      out += s.slice(open); // unbalanced — leave the remainder verbatim
      break;
    }
    const n = Number(vars?.[head[1]] ?? 0);
    const forms = parsePluralForms(s.slice(open + head[0].length, j));
    const chosen = forms[`=${n}`] ?? forms[pr.select(n)] ?? forms.other ?? "";
    out += chosen.replace(/#/g, String(n));
    i = j + 1;
  }
  return out;
}

export function translate(
  locale: Locale,
  key: DictKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = (dictionaries[locale] ?? de)[key] ?? en[key] ?? key;
  s = selectPlurals(locale, s, vars);
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
