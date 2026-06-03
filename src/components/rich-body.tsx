import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Interaction, Photo } from "@/lib/types";
import { parseBody } from "@/lib/rich";
import { optimizedSrc } from "@/lib/utils";
import { InteractiveBlock } from "@/components/interactive-block";

function Figure({
  src,
  caption,
  alt,
}: {
  src: string;
  caption?: string | null;
  alt?: string;
}) {
  return (
    <figure className="my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedSrc(src, 1600, 80)}
        alt={alt ?? caption ?? ""}
        loading="lazy"
        className="w-full rounded-3xl"
      />
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-sand-100/50">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// Theme-matched renderers for Markdown elements.
const components: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  h2: ({ children }) => (
    <h2 className="mt-10 font-display text-3xl font-semibold text-sand-50">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 font-display text-2xl font-semibold text-sand-50">
      {children}
    </h3>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-ember-400 underline underline-offset-2 hover:text-ember-300"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-6 marker:text-ember-400">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-6 marker:text-sand-100/50">
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-ember-500/60 pl-4 font-display text-xl italic text-sand-100/80">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-white/10" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-sand-50">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[0.9em]">
      {children}
    </code>
  ),
  img: ({ src, alt }) =>
    typeof src === "string" ? <Figure src={src} alt={alt} caption={alt} /> : null,
};

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
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {b.text}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}
