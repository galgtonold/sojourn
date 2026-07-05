"use client";
// TEMPORARY, LOCAL-ONLY diagnostic — nothing is uploaded. Drop a photo and it
// reports which extraction strategy (if any) finds the coordinates, so we can
// tell EXIF-GPS vs XMP-GPS vs no-GPS apart. Delete this page after debugging.
import exifr from "exifr";
import { useState } from "react";

type Row = { method: string; lat?: unknown; lng?: unknown; note: string };

export default function ExifDebug() {
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<string>("");
  const [xmpDump, setXmpDump] = useState<string>("");

  async function inspect(file: File) {
    setMeta(`file: ${file.name} · ${file.type || "?"} · ${(file.size / 1024).toFixed(0)} KB`);
    const out: Row[] = [];

    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v));

    // 0) CAPTURE TIME — the go/no-go for geotag-from-GPX. GPS redaction leaves
    // DateTimeOriginal intact, so this should survive even when location doesn't.
    try {
      const t = await exifr.parse(file, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
      out.push({
        method: "CAPTURE TIME (DateTimeOriginal)",
        note:
          "DateTimeOriginal=" +
          JSON.stringify(t?.DateTimeOriginal) +
          " | CreateDate=" +
          JSON.stringify(t?.CreateDate) +
          " | file.lastModified=" +
          new Date(file.lastModified).toISOString(),
      });
    } catch (e) {
      out.push({ method: "CAPTURE TIME", note: "THREW: " + (e as Error).message });
    }

    // 1) The strategy the app uses today.
    try {
      const g = await exifr.gps(file);
      out.push({
        method: "exifr.gps() — CURRENT APP METHOD",
        lat: g?.latitude,
        lng: g?.longitude,
        note: g && num(g.latitude) && num(g.longitude) ? "✅ found" : "❌ none",
      });
    } catch (e) {
      out.push({ method: "exifr.gps()", note: "THREW: " + (e as Error).message });
    }

    // 2) Full parse with EVERYTHING on (exif + gps + xmp + iptc + icc), no chunk cap.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await exifr.parse(file, {
        tiff: true,
        ifd0: true,
        exif: true,
        gps: true,
        xmp: true,
        iptc: true,
        icc: false,
        chunked: false,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        mergeOutput: true,
      } as any);
      out.push({
        method: "exifr.parse(everything, chunked:false)",
        lat: r?.latitude ?? r?.GPSLatitude,
        lng: r?.longitude ?? r?.GPSLongitude,
        note: r
          ? "keys: " + Object.keys(r).slice(0, 40).join(", ")
          : "❌ null",
      });
    } catch (e) {
      out.push({ method: "exifr.parse(everything)", note: "THREW: " + (e as Error).message });
    }

    // 3) XMP only — is the location hiding in XMP?
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await exifr.parse(file, { xmp: true, mergeOutput: false, chunked: false } as any);
      const xmp = (r as Record<string, unknown> | undefined)?.xmp as
        | Record<string, unknown>
        | undefined;
      const cand = xmp
        ? Object.fromEntries(
            Object.entries(xmp).filter(([k]) => /lat|lon|lng|gps|geo/i.test(k)),
          )
        : {};
      out.push({
        method: "XMP block",
        note: xmp
          ? "xmp keys: " + Object.keys(xmp).join(", ") + " || geo-ish: " + JSON.stringify(cand)
          : "❌ no xmp segment",
      });
      setXmpDump(xmp ? JSON.stringify(xmp, null, 2) : "(no XMP segment found)");
    } catch (e) {
      out.push({ method: "XMP block", note: "THREW: " + (e as Error).message });
    }

    setRows(out);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>EXIF/XMP inspector (local only)</h1>
      <p style={{ margin: "8px 0 16px", opacity: 0.7 }}>
        Pick the ORIGINAL failing photo. Nothing is uploaded — this reads it in your browser.
      </p>
      <div style={{ display: "grid", gap: 14, margin: "12px 0" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <b>A) accept=&quot;image/*&quot; (what the app uses today → Photo Picker)</b>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && inspect(e.target.files[0])}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <b>B) no accept (should offer &quot;Files&quot;)</b>
          <input
            type="file"
            onChange={(e) => e.target.files?.[0] && inspect(e.target.files[0])}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <b>C) accept=&quot;.jpg,.jpeg,.png,.heic&quot; (extension-based)</b>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.heic"
            onChange={(e) => e.target.files?.[0] && inspect(e.target.files[0])}
          />
        </label>
      </div>
      {meta && <p style={{ marginTop: 16, fontWeight: 600 }}>{meta}</p>}
      <div style={{ marginTop: 12 }}>
        {rows.map((r, i) => (
          <pre
            key={i}
            style={{
              background: "#111",
              color: "#eee",
              padding: 12,
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              margin: "8px 0",
              fontSize: 13,
            }}
          >
            {`▸ ${r.method}\n  lat=${JSON.stringify(r.lat)} lng=${JSON.stringify(r.lng)}\n  ${r.note}`}
          </pre>
        ))}
      </div>
      {xmpDump && (
        <details style={{ marginTop: 8 }}>
          <summary>Full XMP dump</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{xmpDump}</pre>
        </details>
      )}
    </div>
  );
}
