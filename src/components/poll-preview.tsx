"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only render of a poll/quiz: the question and its options, with the
 *  correct option marked for a quiz. Used for both materialised [ask:id]
 *  interactions and well-formed pending :::poll/:::quiz directives. */
export function PollPreview({
  kind,
  question,
  options,
  correctIndex,
}: {
  kind: "poll" | "quiz";
  question: string;
  options: string[];
  correctIndex?: number | null;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-display text-base text-sand-50">{question}</p>
      <ul className="space-y-1 text-sm text-sand-100/80">
        {options.map((o, i) => {
          const correct = kind === "quiz" && correctIndex === i;
          return (
            <li
              key={i}
              className={cn("flex items-center gap-1.5", correct && "text-sage-400")}
            >
              <span className="text-sand-100/40">•</span>
              <span>{o}</span>
              {correct && <Check className="size-3.5 shrink-0" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
