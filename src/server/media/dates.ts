/**
 * Capture-date inference. Order of trust: parent-entered > EXIF > filename.
 * Filesystem modification times are NEVER treated as a certain childhood date.
 * Anything outside a plausible window is sent to the "Help me place these memories" tray.
 */

export type DateSource = "exif" | "filename" | "user" | "filesystem" | "unknown";
export type Confidence = "high" | "medium" | "low" | "none";

export type InferredDate = {
  capturedAt: Date | null;
  timezone: string | null;
  source: DateSource;
  confidence: Confidence;
  needsReview: boolean;
  reason?: string;
};

const IST_OFFSET = "+05:30";

function fromParts(
  y: number,
  mo: number,
  d: number,
  h = 12,
  mi = 0,
  s = 0,
  offset = IST_OFFSET,
): Date | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}${offset}`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject rollovers such as 31 February.
  const check = new Date(date.getTime() + offsetMinutes(offset) * 60_000);
  if (check.getUTCDate() !== d) return null;
  return date;
}

function offsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Parse dates embedded in common phone/camera filenames. */
export function dateFromFilename(name: string): Date | null {
  const base = name.split(/[\\/]/).pop() ?? name;
  // IMG20220416170506, IMG_20211213_202022, VID_20230101_101010, PXL_20230101_101010123, 20230101_101010
  let m = /(?:^|[^0-9])(20[0-9]{2})([01][0-9])([0-3][0-9])[_-]?([0-2][0-9])([0-5][0-9])([0-5][0-9])/.exec(base);
  if (m) return fromParts(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  // WhatsApp: IMG-20230101-WA0001
  m = /(?:^|[^0-9])(20[0-9]{2})([01][0-9])([0-3][0-9])-WA/i.exec(base);
  if (m) return fromParts(+m[1], +m[2], +m[3]);
  // Screenshot_2023-01-01-10-10-10 / 2023-01-01 10.10.10
  m = /(20[0-9]{2})-([01][0-9])-([0-3][0-9])[ _-]([0-2][0-9])[.-]([0-5][0-9])[.-]([0-5][0-9])/.exec(base);
  if (m) return fromParts(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  // Snapchat-1584183713 / unix seconds or millis
  m = /(?:snapchat|^)[-_]?(1[0-9]{9})(?:[0-9]{3})?(?:\D|$)/i.exec(base);
  if (m) {
    const d = new Date(Number(m[1]) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export type ExifDateInput = {
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  OffsetTimeOriginal?: string;
  OffsetTime?: string;
};

/**
 * exifr returns local wall-clock time as a JS Date in the *process* timezone.
 * We re-read the wall-clock fields and attach the EXIF offset (or IST by default).
 */
export function dateFromExif(exif: ExifDateInput | null | undefined): { date: Date; tz: string } | null {
  if (!exif) return null;
  const raw = exif.DateTimeOriginal ?? exif.CreateDate;
  if (!raw) return null;
  const offset = exif.OffsetTimeOriginal ?? exif.OffsetTime ?? IST_OFFSET;
  if (typeof raw === "string") {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!m) return null;
    const d = fromParts(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], offset);
    return d ? { date: d, tz: offset } : null;
  }
  if (Number.isNaN(raw.getTime())) return null;
  const d = fromParts(
    raw.getFullYear(),
    raw.getMonth() + 1,
    raw.getDate(),
    raw.getHours(),
    raw.getMinutes(),
    raw.getSeconds(),
    offset,
  );
  return d ? { date: d, tz: offset } : null;
}

/**
 * Decide the best capture date. `birthDate` is the child's (possibly inferred) DOB.
 * Photos from up to ~10 months before birth are plausible (pregnancy, family);
 * earlier dates or future dates are flagged for review rather than trusted.
 */
export function inferCaptureDate(input: {
  exif?: ExifDateInput | null;
  filename: string;
  birthDate: string;
  now?: Date;
  hint?: Date | null;
}): InferredDate {
  const now = input.now ?? new Date();
  const birth = new Date(`${input.birthDate}T00:00:00${IST_OFFSET}`);
  const earliestPlausible = new Date(birth.getTime() - 300 * 86_400_000);
  const latest = new Date(now.getTime() + 2 * 86_400_000);
  const plausible = (d: Date) => d >= earliestPlausible && d <= latest;

  const exif = dateFromExif(input.exif);
  const fromName = dateFromFilename(input.filename);

  if (exif) {
    if (plausible(exif.date)) {
      // Disagreement with a dated filename by more than 2 days suggests a wrong camera clock.
      if (fromName && Math.abs(fromName.getTime() - exif.date.getTime()) > 2 * 86_400_000) {
        return {
          capturedAt: exif.date,
          timezone: exif.tz,
          source: "exif",
          confidence: "low",
          needsReview: true,
          reason: "Camera date and filename date disagree",
        };
      }
      return { capturedAt: exif.date, timezone: exif.tz, source: "exif", confidence: "high", needsReview: false };
    }
    // Implausible EXIF (e.g. camera clock never set). Prefer a plausible filename date if present.
    if (fromName && plausible(fromName)) {
      return {
        capturedAt: fromName,
        timezone: IST_OFFSET,
        source: "filename",
        confidence: "low",
        needsReview: true,
        reason: "Camera date looks wrong; using the date in the filename",
      };
    }
    return {
      capturedAt: exif.date,
      timezone: exif.tz,
      source: "exif",
      confidence: "low",
      needsReview: true,
      reason: "Camera date is outside his lifetime",
    };
  }

  if (fromName) {
    if (plausible(fromName)) {
      return { capturedAt: fromName, timezone: IST_OFFSET, source: "filename", confidence: "medium", needsReview: false };
    }
    return {
      capturedAt: fromName,
      timezone: IST_OFFSET,
      source: "filename",
      confidence: "low",
      needsReview: true,
      reason: "Filename date is outside his lifetime",
    };
  }

  if (input.hint && plausible(input.hint)) {
    // Browser-provided File.lastModified: a hint only, never a certain date.
    return {
      capturedAt: input.hint,
      timezone: IST_OFFSET,
      source: "filesystem",
      confidence: "low",
      needsReview: true,
      reason: "Only the file's modified time was available",
    };
  }

  return { capturedAt: null, timezone: null, source: "unknown", confidence: "none", needsReview: true, reason: "No date found" };
}
