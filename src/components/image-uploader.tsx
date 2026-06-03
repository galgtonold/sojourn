"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadImage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

/** Single-image drag/drop uploader with preview. */
export function ImageUploader({
  value,
  onChange,
  folder = "covers",
  label,
}: {
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { url } = await uploadImage(file, folder);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-sand-100/60">
        {label ?? t("admin.upload.cover")}
      </p>

      {value ? (
        <div className="group relative aspect-[16/9] overflow-hidden rounded-2xl bg-ink-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Image
            src={value}
            alt="Cover preview"
            fill
            sizes="(max-width: 768px) 100vw, 700px"
            className="object-cover"
          />
          {busy && (
            <div className="absolute inset-0 grid place-items-center gap-2 bg-ink-950/70 text-sm text-sand-50">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={busy}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink-950/70 text-sand-50 opacity-0 transition group-hover:opacity-100 hover:bg-ink-950 disabled:opacity-50"
            aria-label="Remove image"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="absolute bottom-2 right-2 rounded-full bg-ink-950/70 px-3 py-1 text-xs text-sand-50 opacity-0 transition group-hover:opacity-100 hover:bg-ink-950 disabled:opacity-50"
          >
            {busy ? t("admin.upload.uploading") : t("admin.upload.replace")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm transition",
            dragging
              ? "border-ember-400 bg-ember-500/5 text-ember-300"
              : "border-white/15 bg-ink-800 text-sand-100/50 hover:border-white/30",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-6 animate-spin" />
              {t("admin.upload.uploading")}
            </>
          ) : (
            <>
              <ImagePlus className="size-6" />
              {t("admin.upload.drop")}
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
