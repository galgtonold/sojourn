// eval/harness/packet.ts
// Assembles a self-contained "judge packet" for one fixture: the GROUND TRUTH
// the generator was given (notes, answers, and — crucially — the vision
// model's per-photo descriptions, which are the only things actually known to
// be in each image) plus the GENERATED artifacts under evaluation. A judge
// subagent reads this packet against eval/JUDGING.md and never sees the source
// blog. See eval/JUDGING.md for the rubric and verdict schema.
import type { LoadedFixture } from "./fixture";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

function oneLine(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function buildPacket(fx: LoadedFixture, store: Store): string {
  const photos = [...(store.photos ?? [])].sort(
    (a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0),
  );
  const post = store.posts?.[0] ?? {};
  const track = (store.tracks ?? [])[0];
  const interactions = store.interactions ?? [];
  const L: string[] = [];

  L.push(`# Judge packet — ${fx.slug} (lang: ${fx.lang})`, "");

  L.push("## GROUND TRUTH — everything the generator was given", "");
  L.push(`Trip: ${fx.trip.title} · ${fx.trip.start_date}`, "");
  L.push("Author notes:", fx.notes?.trim() ? fx.notes.trim() : "(none)", "");
  L.push("Author answers to the AI's questions:");
  if (fx.answers.length) for (const a of fx.answers) L.push(`- Q: ${a.question}`, `  A: ${a.answer}`);
  else L.push("(none)");
  L.push("");
  L.push(
    "Photos in order. The description under each is the VISION model's read of",
    "the image — it is the only thing actually known to be visible. Anything the",
    "draft asserts about a place that is not here, in the notes/answers, or the",
    "place name is ungrounded.",
    "",
  );
  photos.forEach((p, i) => {
    const place = (p.place_name as string) || `${p.lat},${p.lng}`;
    L.push(`${i + 1}. ${place} — ${p.taken_at ?? "no time"} (${p.lat},${p.lng})`);
    L.push(`   ${oneLine(p.ai_description) || "(no description)"}`, "");
  });
  if (track) {
    const km = track.distance_m ? `, ${((track.distance_m as number) / 1000).toFixed(1)} km` : "";
    L.push(`GPS track: ${track.name ?? "track"}${km}.`, "");
  } else {
    L.push("GPS track: none.", "");
  }
  L.push(
    "(The day's weather is fetched live by the generator and is NOT included",
    "here — do not flag temperature/precipitation claims as fabrications.)",
    "",
  );

  L.push("## GENERATED DRAFT — under evaluation", "");
  L.push(`Title: ${post.title ?? ""}`, "");
  L.push(oneLine(post.body) ? String(post.body) : "(empty)", "");

  L.push("## GENERATED CAPTIONS", "");
  if (photos.length)
    photos.forEach((p) => L.push(`- ${(p.place_name as string) || p.id}: ${(p.caption as string) ?? "(none)"}`));
  else L.push("(none)");
  L.push("");

  L.push("## GENERATED INTERACTIONS", "");
  if (interactions.length)
    for (const it of interactions) {
      const opts = (it.options as string[]) ?? [];
      const ci = it.correct_index as number | null;
      const correct = ci != null && opts[ci] != null ? `  [correct: ${opts[ci]}]` : "  [no correct answer]";
      L.push(`- (${it.kind}) Q: ${oneLine(it.question)}`);
      L.push(`  options: ${opts.join(" / ")}${it.kind === "quiz" ? correct : ""}`);
    }
  else L.push("(none)");
  L.push("");

  L.push("## REFERENCE — coverage/arc sanity only, NOT a source of truth", "");
  L.push(fx.reference?.trim() ? fx.reference.trim() : "(none)");

  return L.join("\n");
}
