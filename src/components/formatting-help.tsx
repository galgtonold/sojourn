"use client";
import { useT } from "@/components/i18n";

const code =
  "shrink-0 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ember-300";
const row = "flex items-baseline gap-3";

/** The article editor's formatting reference, shown in the "?" popover. Prose is
 *  plain markdown; photos and polls go in via the insert bar, never typed. */
export function FormattingHelp() {
  const t = useT();
  return (
    <div className="space-y-3">
      <p className="text-sand-100/70">{t("admin.editor.help.intro")}</p>
      <ul className="space-y-1.5">
        <li className={row}>
          <code className={code}>## </code>
          <span className="text-sand-100/70">{t("admin.editor.help.heading")}</span>
        </li>
        <li className={row}>
          <code className={code}>**text**</code>
          <span className="text-sand-100/70">{t("admin.editor.help.bold")}</span>
        </li>
        <li className={row}>
          <code className={code}>*text*</code>
          <span className="text-sand-100/70">{t("admin.editor.help.italic")}</span>
        </li>
        <li className={row}>
          <code className={code}>&gt; </code>
          <span className="text-sand-100/70">{t("admin.editor.help.quote")}</span>
        </li>
        <li className={row}>
          <code className={code}>- </code>
          <span className="text-sand-100/70">{t("admin.editor.help.list")}</span>
        </li>
        <li className={row}>
          <code className={code}>[text](url)</code>
          <span className="text-sand-100/70">{t("admin.editor.help.link")}</span>
        </li>
      </ul>
    </div>
  );
}
