import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, ListChecks } from "lucide-react";
import type { Interaction, Photo } from "@/lib/types";
import { parseBody } from "@/lib/rich";
import { Figure, mdComponents } from "@/components/prose";
import { InteractiveBlock } from "@/components/interactive-block";
import { Reveal } from "@/components/reveal";
import { RevealChildren } from "@/components/reveal-children";
import { T } from "@/components/i18n";

/** Renders a post body as Markdown, with photos ([photo:…]) and polls/quizzes
 *  ([ask:…]) placed inline so everything reads interleaved. When showIssues is
 *  set (editor preview), not-yet-created polls and dangling references render as
 *  visible placeholders instead of vanishing. */
export function RichBody({
  body,
  photos,
  interactions = [],
  showIssues = false,
}: {
  body: string;
  photos: Photo[];
  interactions?: Interaction[];
  showIssues?: boolean;
}) {
  const blocks = parseBody(body ?? "", photos, interactions, { showIssues });

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
        if (b.kind === "pending") {
          const s = b.spec;
          return (
            <div
              key={i}
              className="rounded-2xl border border-dashed border-ember-500/40 bg-ember-500/5 p-5"
            >
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ember-300">
                <ListChecks className="size-4" />
                <T
                  k={s.kind === "quiz" ? "litter.pendingQuiz" : "litter.pendingPoll"}
                />
              </p>
              <p className="mt-2 font-display text-lg text-sand-50">
                {s.question || <T k="litter.noQuestion" />}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-sand-100/70">
                {s.options.map((o, j) => (
                  <li key={j} className={s.correctIndex === j ? "text-lagoon-400" : ""}>
                    • {o}
                    {s.correctIndex === j ? " ✓" : ""}
                  </li>
                ))}
              </ul>
              {s.problems.length > 0 && (
                <p className="mt-2 text-xs text-red-400">
                  <T k="litter.willNotSave" />
                </p>
              )}
            </div>
          );
        }
        if (b.kind === "broken") {
          return (
            <p
              key={i}
              className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-300"
            >
              <AlertTriangle className="size-4 shrink-0" />
              <T
                k={b.refType === "photo" ? "litter.brokenPhoto" : "litter.brokenAsk"}
                vars={{ ref: b.ref }}
              />
            </p>
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
