"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Mail, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";

type Member = { id: string; email: string | null; tripIds: string[] };
type TripOpt = { id: string; title: string };

/** A copyable link row, used for both a fresh invite and a re-issued login link. */
function LinkRow({ url, label }: { url: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5 rounded-xl bg-ink-800 p-3">
      <p className="text-sm text-sand-100/70">{label}</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="w-full truncate rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-xs text-sand-100/80"
        />
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs hover:border-ember-400"
        >
          <Copy className="size-3.5" />
          {copied ? t("admin.members.copied") : t("admin.members.copy")}
        </button>
      </div>
    </div>
  );
}

export function MembersManager({
  members: initial,
  trips,
}: {
  members: Member[];
  trips: TripOpt[];
}) {
  const t = useT();
  const confirm = useConfirm();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initial);

  // Invite form
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  // Per-member editing + re-issued login link
  const [editing, setEditing] = useState<string | null>(null);
  const [editPick, setEditPick] = useState<Set<string>>(new Set());
  const [memberLink, setMemberLink] = useState<{ id: string; url: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);

  const tripTitle = (id: string) => trips.find((x) => x.id === id)?.title ?? id;

  function toggle(set: Set<string>, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function upsertMember(m: Member) {
    setMembers((list) => [...list.filter((x) => x.id !== m.id), m]);
  }

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setLink(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tripIds: [...picked] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "failed");
      setNotice(j.status === "granted" ? t("admin.members.granted") : null);
      if (j.link) setLink(j.link);
      if (j.member) upsertMember(j.member as Member);
      setEmail("");
      setPicked(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function genLoginLink(id: string) {
    setLinkBusy(id);
    setMemberLink(null);
    try {
      const res = await fetch(`/api/admin/members/${id}/reset-link`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.link) setMemberLink({ id, url: j.link });
    } finally {
      setLinkBusy(null);
    }
  }

  async function saveGrants(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/admin/members/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripIds: [...editPick] }),
      });
      setMembers((m) =>
        m.map((x) => (x.id === id ? { ...x, tripIds: [...editPick] } : x)),
      );
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ message: t("admin.members.removeConfirm"), danger: true, confirmLabel: t("common.delete") }))) return;
    setMembers((m) => m.filter((x) => x.id !== id));
    await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition",
      active
        ? "border-ember-400 bg-ember-500/15 text-ember-300"
        : "border-white/15 text-sand-100/70 hover:border-white/30",
    );

  return (
    <div className="space-y-8">
      {/* Invite */}
      <div className="space-y-3 rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("admin.members.email")}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
        />
        {trips.length === 0 ? (
          <p className="text-sm text-sand-100/50">{t("admin.members.noTrips")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {trips.map((tr) => (
              <button
                key={tr.id}
                type="button"
                onClick={() => setPicked((s) => toggle(s, tr.id))}
                className={chip(picked.has(tr.id))}
              >
                {tr.title}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={invite}
            disabled={busy || !email.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
          >
            <UserPlus className="size-4" />
            {busy ? t("admin.members.inviting") : t("admin.members.invite")}
          </button>
          {error && <span className="text-sm text-red-400">{error}</span>}
          {notice && <span className="text-sm text-sage-400">{notice}</span>}
        </div>
        {link && <LinkRow url={link} label={t("admin.members.linkShare")} />}
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <p className="text-sand-100/50">{t("admin.members.none")}</p>
      ) : (
        <ul className="space-y-3">
          {members.map((m) => (
            <li
              key={m.id}
              className="rounded-2xl bg-ink-900 p-4 ring-1 ring-white/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 text-sand-100/60" />
                  {m.email}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <button
                    onClick={() => genLoginLink(m.id)}
                    disabled={linkBusy === m.id}
                    className="inline-flex items-center gap-1 text-sand-100/70 hover:text-sand-50 disabled:opacity-50"
                  >
                    {linkBusy === m.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="size-3.5" />
                    )}
                    {t("admin.members.resetLink")}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(editing === m.id ? null : m.id);
                      setEditPick(new Set(m.tripIds));
                    }}
                    className="text-ember-400 hover:underline"
                  >
                    {t("admin.members.edit")}
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    className="inline-flex items-center gap-1 text-red-400/80 hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" /> {t("admin.members.remove")}
                  </button>
                </span>
              </div>

              {memberLink?.id === m.id && (
                <div className="mt-3">
                  <LinkRow url={memberLink.url} label={t("admin.members.linkShare")} />
                </div>
              )}

              {editing === m.id ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {trips.map((tr) => (
                      <button
                        key={tr.id}
                        type="button"
                        onClick={() => setEditPick((s) => toggle(s, tr.id))}
                        className={chip(editPick.has(tr.id))}
                      >
                        {tr.title}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => saveGrants(m.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-1.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
                  >
                    <Check className="size-4" /> {t("admin.members.save")}
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.tripIds.length === 0 ? (
                    <span className="text-xs text-sand-100/60">
                      {t("admin.members.noAccess")}
                    </span>
                  ) : (
                    m.tripIds.map((tid) => (
                      <span
                        key={tid}
                        className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-sand-100/70"
                      >
                        {tripTitle(tid)}
                      </span>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
