// eval/harness/fake-backend.ts
// EVAL_FAKE=1: intercept fetch and return canned OpenAI-shaped responses, so
// `npm run eval` runs end-to-end with zero API cost (smoke test of the wiring).
function chat(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }),
    { status: 200, headers: { "content-type": "application/json" } });
}
export function installFakeBackend(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.includes("/embeddings")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (url.includes("open-meteo.com")) return new Response(JSON.stringify({ daily: {} }), { status: 200 });
    if (url.includes("komoot") || url.includes("nominatim")) return new Response(JSON.stringify({}), { status: 200 });
    if (url.includes("/chat/completions")) {
      // vision path → /api/admin/ai/enrich-post: prompt contains an image_url content part
      if (body.includes('"image_url"')) return chat("Eine Testbeschreibung des Fotos.");
      // outline path → /api/admin/ai/outline: user prompt uniquely contains "Gliederungsplan"
      if (body.includes("Gliederungsplan")) return chat(JSON.stringify({ title: "Morgenspaziergang", excerpt: "Ein kurzer Spaziergang.", location: "Grindelwald", lat: 46.62, lng: 8.04, cover_photo_id: null, date: "2024-07-12", sections: [{ heading: "Aufbruch", beat: "Start des Spaziergangs.", photo_ids: [], interaction: null }] }));
      // questions path → /api/admin/ai/questions: model response schema contains {"questions":
      if (body.includes('{"questions":')) return chat(JSON.stringify({ questions: ["Wer war dabei?", "Was war der Höhepunkt?"] }));
      // captions path → /api/admin/ai/captions: model response schema contains "items":
      if (body.includes('"items":') || body.includes('"items" :')) return chat(JSON.stringify({ items: [] }));
      // Fall-through: section/homogenize paths → /api/admin/ai/section and /api/admin/ai/homogenize.
      // Both return markdown prose. Do NOT add a throw here — this fall-through is intentional and required.
      return chat("## Aufbruch\n\nEin kurzer Absatz über den Spaziergang.");
    }
    return original(input as string, init);
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}
