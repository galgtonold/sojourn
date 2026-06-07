// A scripted stand-in for deepseekChat(opts). It branches on opts.meta.operation
// and the message contents so we can drive the real route handlers deterministically.
// The "section" responder deliberately returns a broken section on the first
// attempt (bad photo tag, and no poll when one was requested) and a clean one
// once the route's repair loop sends its "Fix only these issues" follow-up — so
// the repair loop is exercised for real.
import type { ChatMessage } from "@/lib/ai/deepseek";

export type ChatOpts = {
  model: string;
  messages: ChatMessage[];
  json?: boolean;
  meta?: { operation?: string };
};

const BAD_PHOTO = "00000000-0000-0000-0000-000000000000";

function textOf(content: ChatMessage["content"]): string {
  return typeof content === "string"
    ? content
    : content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
}

export function makeFakeDeepseek(opts: { photoIds: string[] }) {
  const calls: { operation: string; model: string }[] = [];

  async function chat(o: ChatOpts): Promise<string> {
    const operation = o.meta?.operation ?? "unknown";
    calls.push({ operation, model: o.model });
    const sys = textOf(o.messages.find((m) => m.role === "system")?.content ?? "");
    const userMsgs = o.messages.filter((m) => m.role === "user").map((m) => textOf(m.content));
    const lastUser = userMsgs[userMsgs.length - 1] ?? "";

    if (operation === "questions") {
      return JSON.stringify({
        questions: ["Wer war dabei?", "Was war das Highlight?", "Wie war das Wetter?"],
      });
    }

    if (operation === "outline") {
      const ids = opts.photoIds;
      const mid = Math.ceil(ids.length / 2);
      return JSON.stringify({
        title: "Über die Pässe",
        excerpt: "Zwei Tage zwischen Fels und Firn.",
        location: "Berner Oberland",
        lat: 46.5,
        lng: 8.0,
        cover_photo_id: ids[0] ?? null,
        sections: [
          {
            heading: "Aufstieg",
            beat: "Der Start in den Tag.",
            photo_ids: ids.slice(0, mid),
            interaction: { kind: "poll", idea: "Welchen Pass zuerst?" },
          },
          {
            heading: "Am Gipfel",
            beat: "Oben angekommen.",
            photo_ids: ids.slice(mid),
          },
        ],
      });
    }

    if (operation === "captions") {
      const ids = [...lastUser.matchAll(/^([0-9a-f-]{36})\s*\|/gim)].map((m) => m[1]);
      return JSON.stringify({
        items: ids.map((id) => ({ id, caption: "Ein stiller Moment.", alt: "Foto" })),
      });
    }

    if (operation === "enrich") {
      return "Eine weite Berglandschaft im Morgenlicht.";
    }

    if (operation === "section") {
      // Read the allowed photo from the ORIGINAL prompt, not a repair message
      // (which quotes the bad id back to us).
      const allowed = (userMsgs[0] ?? "").match(/\[photo:([0-9a-f-]{36})\]/)?.[1];
      const wantsPoll = /:::poll|:::quiz|exactly ONE|GENAU EINE/.test(sys);
      const isFix = /Fix only these issues/.test(lastUser);
      if (!isFix) {
        // Broken on purpose: invalid photo id (+ missing poll when requested).
        return `## Abschnitt\n\nWir brachen früh auf.\n\n[photo:${BAD_PHOTO}]\n`;
      }
      const photoLine = allowed ? `\n[photo:${allowed}]\n` : "";
      const poll = wantsPoll
        ? "\n:::poll Welchen Pass würdest du zuerst angehen?\n- Gemmipass\n- Furkapass\n:::\n"
        : "";
      return `## Abschnitt\n\nWir brachen früh auf, der Himmel klarte auf.${photoLine}\nSpäter wurde es steil.${poll}`;
    }

    return "OK";
  }

  return { chat, calls };
}
