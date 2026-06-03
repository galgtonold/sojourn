import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Interaction, Photo } from "@/lib/types";
import { parseBody } from "@/lib/rich";
import { Figure, mdComponents } from "@/components/prose";
import { InteractiveBlock } from "@/components/interactive-block";
import { Reveal } from "@/components/reveal";
import { RevealChildren } from "@/components/reveal-children";

/** Renders a post body as Markdown, with photos ([photo:…]) and polls/quizzes
 *  ([ask:…]) placed inline so everything reads interleaved. */
export function RichBody({
  body,
  photos,
  interactions = [],
}: {
  body: string;
  photos: Photo[];
  interactions?: Interaction[];
}) {
  const blocks = parseBody(body ?? "", photos, interactions);

  return (
    <div className="space-y-6 text-lg text-sand-100/80">
      {blocks.map((b, i) => {
        if (b.kind === "photo") {
          return (
            <Reveal key={i}>
              <Figure
                src={b.photo.url ?? ""}
                alt={b.photo.alt ?? undefined}
                caption={b.photo.caption}
              />
            </Reveal>
          );
        }
        if (b.kind === "interaction") {
          return (
            <Reveal key={i}>
              <InteractiveBlock interaction={b.interaction} />
            </Reveal>
          );
        }
        return (
          <RevealChildren key={i} className="space-y-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {b.text}
            </ReactMarkdown>
          </RevealChildren>
        );
      })}
    </div>
  );
}
