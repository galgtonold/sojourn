"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { slugify } from "@/lib/utils";
import { ImageUploader } from "@/components/image-uploader";

export type EditablePost = {
  id?: string;
  title: string;
  slug: string;
  location: string;
  excerpt: string;
  body: string;
  cover_image: string;
  cover_alt: string;
  lat: string;
  lng: string;
  published: boolean;
};

const EMPTY: EditablePost = {
  title: "",
  slug: "",
  location: "",
  excerpt: "",
  body: "",
  cover_image: "",
  cover_alt: "",
  lat: "",
  lng: "",
  published: false,
};

export function PostEditor({ initial }: { initial?: EditablePost }) {
  const router = useRouter();
  const [post, setPost] = useState<EditablePost>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(post.id);

  function set<K extends keyof EditablePost>(key: K, value: EditablePost[K]) {
    setPost((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      ...post,
      slug: post.slug || slugify(post.title),
      lat: post.lat ? Number(post.lat) : null,
      lng: post.lng ? Number(post.lng) : null,
    };
    try {
      const res = await fetch(
        isEdit ? `/api/admin/posts/${post.id}` : "/api/admin/posts",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      router.push("/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!post.id || !confirm("Delete this post permanently?")) return;
    setBusy(true);
    await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    router.push("/admin");
    router.refresh();
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  return (
    <div className="space-y-4">
      <input
        className={`${input} font-display text-lg`}
        placeholder="Title"
        value={post.title}
        onChange={(e) => set("title", e.target.value)}
        onBlur={() => !post.slug && set("slug", slugify(post.title))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          className={input}
          placeholder="slug"
          value={post.slug}
          onChange={(e) => set("slug", e.target.value)}
        />
        <input
          className={input}
          placeholder="Location (e.g. Kyoto, Japan)"
          value={post.location}
          onChange={(e) => set("location", e.target.value)}
        />
      </div>
      <ImageUploader
        value={post.cover_image}
        onChange={(url) => set("cover_image", url)}
      />
      <input
        className={input}
        placeholder="…or paste an image URL"
        value={post.cover_image}
        onChange={(e) => set("cover_image", e.target.value)}
      />
      <input
        className={input}
        placeholder="Cover alt text (describe the image for screen readers)"
        value={post.cover_alt}
        onChange={(e) => set("cover_alt", e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          className={input}
          placeholder="Latitude"
          value={post.lat}
          onChange={(e) => set("lat", e.target.value)}
        />
        <input
          className={input}
          placeholder="Longitude"
          value={post.lng}
          onChange={(e) => set("lng", e.target.value)}
        />
      </div>
      <textarea
        className={`${input} resize-y`}
        rows={2}
        placeholder="Excerpt"
        value={post.excerpt}
        onChange={(e) => set("excerpt", e.target.value)}
      />
      <textarea
        className={`${input} resize-y font-mono`}
        rows={14}
        placeholder={"Body — Markdown supported (## headings, **bold**, > quotes, - lists, [links](url)).\n\nPlace a gallery photo inline by putting [photo:ID] on its own line — copy a photo's tag from the Gallery section below."}
        value={post.body}
        onChange={(e) => set("body", e.target.value)}
      />
      <p className="text-xs text-sand-100/40">
        Markdown supported. Drop <code className="text-sand-100/70">[photo:ID]</code>{" "}
        on its own line to weave a gallery photo into the story — grab a photo&rsquo;s
        tag with “Copy inline tag” in the Gallery below.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={post.published}
          onChange={(e) => set("published", e.target.checked)}
          className="size-4 accent-[#f56a1f]"
        />
        Published
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={busy || !post.title}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          <Save className="size-4" /> {busy ? "Saving…" : "Save"}
        </button>
        {isEdit && (
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/30 px-4 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
