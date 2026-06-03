import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Interaction, Photo } from "@/lib/types";
import { parseBody } from "@/lib/rich";
import { Figure, mdComponents } from "@/components/prose";
import { InteractiveBlock } from "@/components/interactive-block";

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
            <Figure
              key={i}
              src={b.photo.url ?? ""}
              alt={b.photo.alt ?? undefined}
              caption={b.photo.caption}
            />
          );
        }
        if (b.kind === "interaction") {
          return <InteractiveBlock key={i} interaction={b.interaction} />;
        }
        return (
          <div key={i} className="space-y-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {b.text}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}
