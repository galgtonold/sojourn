// Pure: parse a photo's raw EXIF `DateTimeOriginal` (+ optional
// `OffsetTimeOriginal`) into the stored capture time. `DateTimeOriginal` carries
// NO timezone, so we label the exact wall-clock as UTC ("…Z") and keep the real
// UTC offset (in minutes) separately — that way capture time is independent of
// the uploader's browser zone, and photo ordering / track geotag matching can
// reconstruct true UTC (localMs − offset). Extracted from readExif (upload-client
// is client-only + excluded from coverage) so this rot-prone parse is testable.

export function parseExifDateTime(
  rawDateTime: unknown,
  rawOffset?: unknown,
): { takenAt: string | null; takenOffsetMin: number | null } {
  let takenAt: string | null = null;
  let takenOffsetMin: number | null = null;

  const raw = typeof rawDateTime === "string" ? rawDateTime : "";
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (m) takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;

  const off = typeof rawOffset === "string" ? rawOffset.trim() : "";
  const om = /^([+-])(\d{2}):(\d{2})$/.exec(off);
  if (om)
    takenOffsetMin = (om[1] === "-" ? -1 : 1) * (Number(om[2]) * 60 + Number(om[3]));

  return { takenAt, takenOffsetMin };
}
