/**
 * Calendar helpers that are safe on both server and client.
 * Birthdays and ages are computed in the child's timezone (default Asia/Kolkata),
 * never at UTC midnight.
 */

export type YMD = { y: number; m: number; d: number };

export function parseYMD(s: string): YMD {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** The calendar date of `instant` as seen in `timeZone`. */
export function zonedYMD(instant: Date, timeZone: string): YMD {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function cmp(a: YMD, b: YMD): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

/** Birthday in a given year. 29 Feb birthdays are celebrated on 28 Feb in common years. */
export function birthdayInYear(birth: YMD, year: number): YMD {
  if (birth.m === 2 && birth.d === 29) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return { y: year, m: 2, d: leap ? 29 : 28 };
  }
  return { y: year, m: birth.m, d: birth.d };
}

/** Completed years of age on calendar date `on`. */
export function ageInYears(birth: YMD, on: YMD): number {
  let age = on.y - birth.y;
  if (cmp(on, birthdayInYear(birth, on.y)) < 0) age -= 1;
  return age;
}

export function ageAt(birthDate: string, instant: Date, timeZone: string): number {
  return ageInYears(parseYMD(birthDate), zonedYMD(instant, timeZone));
}

/** Age in whole months at an instant (for "6 months old" style labels). */
export function ageInMonths(birthDate: string, instant: Date, timeZone: string): number {
  const b = parseYMD(birthDate);
  const on = zonedYMD(instant, timeZone);
  let months = (on.y - b.y) * 12 + (on.m - b.m);
  if (on.d < b.d) months -= 1;
  return months;
}

export function ageLabel(birthDate: string, instant: Date, timeZone: string): string {
  const months = ageInMonths(birthDate, instant, timeZone);
  if (months < 0) return "Before he was born";
  if (months === 0) return "Newborn";
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} old`;
  const years = Math.floor(months / 12);
  return `${years} years old`;
}

export type BirthdayState =
  | { kind: "today"; age: number }
  | { kind: "upcoming"; age: number; days: number; date: YMD };

/** Countdown / greeting state relative to `now` in the child's timezone. */
export function birthdayState(birthDate: string, now: Date, timeZone: string): BirthdayState {
  const birth = parseYMD(birthDate);
  const today = zonedYMD(now, timeZone);
  const thisYear = birthdayInYear(birth, today.y);
  if (cmp(today, thisYear) === 0) return { kind: "today", age: today.y - birth.y };
  const next = cmp(today, thisYear) < 0 ? thisYear : birthdayInYear(birth, today.y + 1);
  const days = Math.round(
    (Date.UTC(next.y, next.m - 1, next.d) - Date.UTC(today.y, today.m - 1, today.d)) / 86_400_000,
  );
  return { kind: "upcoming", age: next.y - birth.y, days, date: next };
}

export function formatDate(instant: Date | string, timeZone: string, style: "long" | "short" = "long"): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  }).format(d);
}
