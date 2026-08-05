"use client";
import type { ReactNode } from "react";
import { useT } from "@/components/i18n";

const code =
  "rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ember-300";

/** The article editor's formatting reference, shown in the "?" popover. A small
 *  table: the Markdown you type on the left, the effect it produces — actually
 *  rendered — on the right. Prose is plain Markdown; photos and polls go in via
 *  the insert bar, never typed. */
export function FormattingHelp() {
  const t = useT();

  const rows: { syntax: string; result: ReactNode }[] = [
    {
      syntax: "## ",
      result: (
        <span className="font-display text-base font-semibold text-sand-50">
          {t("admin.editor.help.heading")}
        </span>
      ),
    },
    {
      syntax: "**text**",
      result: (
        <span className="font-semibold text-sand-50">
          {t("admin.editor.help.bold")}
        </span>
      ),
    },
    {
      syntax: "*text*",
      result: (
        <span className="italic text-sand-100/80">
          {t("admin.editor.help.italic")}
        </span>
      ),
    },
    {
      syntax: "> ",
      result: (
        <span className="block border-l-2 border-ember-400/50 pl-2 italic text-sand-100/60">
          {t("admin.editor.help.quote")}
        </span>
      ),
    },
    {
      syntax: "- ",
      result: (
        <span className="flex items-center gap-2 text-sand-100/80">
          <span className="size-1.5 shrink-0 rounded-full bg-ember-400/70" />
          {t("admin.editor.help.list")}
        </span>
      ),
    },
    {
      syntax: "[text](url)",
      result: (
        <span className="text-ember-300 underline underline-offset-2">
          {t("admin.editor.help.link")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sand-100/70">{t("admin.editor.help.intro")}</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[0.7rem] uppercase tracking-wider text-sand-100/60">
            <th className="pb-1.5 pr-4 font-medium">
              {t("admin.editor.help.colType")}
            </th>
            <th className="pb-1.5 font-medium">
              {t("admin.editor.help.colResult")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr key={r.syntax}>
              <td className="whitespace-nowrap py-2 pr-4 align-middle">
                <code className={code}>{r.syntax}</code>
              </td>
              <td className="w-full py-2 align-middle">{r.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
