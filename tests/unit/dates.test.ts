import { describe, expect, it } from "vitest";
import { ageAt, ageInYears, birthdayInYear, birthdayState } from "@/lib/dates";
import { dateFromExif, dateFromFilename, inferCaptureDate } from "@/server/media/dates";

const BIRTH = "2021-11-13";
const NOW = new Date("2026-11-12T12:00:00Z");

describe("birthday maths in Asia/Kolkata", () => {
  it("is not five yet on 12 Nov in India", () => {
    expect(ageAt(BIRTH, new Date("2026-11-12T18:00:00Z"), "Asia/Kolkata")).toBe(4); // 23:30 IST
  });
  it("turns five at Indian midnight, before UTC midnight", () => {
    // 00:10 IST on 13 Nov is still 12 Nov in UTC.
    const t = new Date("2026-11-12T18:40:00Z");
    expect(ageAt(BIRTH, t, "Asia/Kolkata")).toBe(5);
    expect(ageAt(BIRTH, t, "UTC")).toBe(4);
    expect(birthdayState(BIRTH, t, "Asia/Kolkata")).toEqual({ kind: "today", age: 5 });
  });
  it("counts down the days", () => {
    expect(birthdayState(BIRTH, new Date("2026-11-10T06:00:00Z"), "Asia/Kolkata")).toMatchObject({ kind: "upcoming", age: 5, days: 3 });
    expect(birthdayState(BIRTH, new Date("2026-11-14T06:00:00Z"), "Asia/Kolkata")).toMatchObject({ kind: "upcoming", age: 6, days: 364 });
  });
  it("handles 29 February birthdays", () => {
    expect(birthdayInYear({ y: 2020, m: 2, d: 29 }, 2023)).toEqual({ y: 2023, m: 2, d: 28 });
    expect(birthdayInYear({ y: 2020, m: 2, d: 29 }, 2024)).toEqual({ y: 2024, m: 2, d: 29 });
    expect(ageInYears({ y: 2020, m: 2, d: 29 }, { y: 2023, m: 2, d: 28 })).toBe(3);
  });
});

describe("filename dates", () => {
  it.each([
    ["IMG20220416170506.jpg", "2022-04-16T11:35:06.000Z"],
    ["IMG_20211213_202022.jpg", "2021-12-13T14:50:22.000Z"],
    ["IMG_20220213_203513_Bokeh.jpg", "2022-02-13T15:05:13.000Z"],
    ["IMG20240417225005_01.jpg", "2024-04-17T17:20:05.000Z"],
    ["IMG-20230101-WA0001.jpg", "2023-01-01T06:30:00.000Z"],
    ["Snapchat-1584183713.jpg", "2020-03-14T11:01:53.000Z"],
  ])("%s", (name, iso) => {
    expect(dateFromFilename(name)?.toISOString()).toBe(iso);
  });
  it("ignores names without dates", () => {
    expect(dateFromFilename("DSC_3750.JPG")).toBeNull();
    expect(dateFromFilename("IMG_9600.JPG")).toBeNull();
    expect(dateFromFilename("IMG20221331120000.jpg")).toBeNull(); // month 13
  });
});

describe("capture date inference", () => {
  it("trusts plausible EXIF in IST", () => {
    const r = inferCaptureDate({ exif: { DateTimeOriginal: "2023:04:08 16:49:39" }, filename: "DSC06780.JPG", birthDate: BIRTH, now: NOW });
    expect(r).toMatchObject({ source: "exif", confidence: "high", needsReview: false });
    expect(r.capturedAt?.toISOString()).toBe("2023-04-08T11:19:39.000Z");
  });
  it("sends a wrong camera clock (2004) to review", () => {
    const r = inferCaptureDate({ exif: { DateTimeOriginal: "2004:07:29 06:19:01" }, filename: "DSC_3750.JPG", birthDate: BIRTH, now: NOW });
    expect(r).toMatchObject({ confidence: "low", needsReview: true });
  });
  it("prefers a plausible filename date when EXIF is implausible", () => {
    const r = inferCaptureDate({ exif: { DateTimeOriginal: "2004:07:29 06:19:01" }, filename: "IMG20220416170506.jpg", birthDate: BIRTH, now: NOW });
    expect(r).toMatchObject({ source: "filename", needsReview: true });
  });
  it("flags disagreement between EXIF and filename", () => {
    const r = inferCaptureDate({ exif: { DateTimeOriginal: "2023:01:14 14:22:38" }, filename: "IMG20220416170506.jpg", birthDate: BIRTH, now: NOW });
    expect(r.needsReview).toBe(true);
  });
  it("never treats a modified time as certain", () => {
    const r = inferCaptureDate({ filename: "IMG_9600.JPG", birthDate: BIRTH, now: NOW, hint: new Date("2023-05-01T00:00:00Z") });
    expect(r).toMatchObject({ source: "filesystem", confidence: "low", needsReview: true });
  });
  it("reports unknown dates honestly", () => {
    expect(inferCaptureDate({ filename: "IMG_9600.JPG", birthDate: BIRTH, now: NOW })).toMatchObject({ source: "unknown", capturedAt: null, needsReview: true });
  });
  it("rejects future dates", () => {
    const r = inferCaptureDate({ exif: { DateTimeOriginal: "2030:01:01 10:00:00" }, filename: "x.jpg", birthDate: BIRTH, now: NOW });
    expect(r.needsReview).toBe(true);
  });
  it("honours an explicit EXIF offset", () => {
    expect(dateFromExif({ DateTimeOriginal: "2024:06:01 10:00:00", OffsetTimeOriginal: "+07:00" })?.date.toISOString()).toBe("2024-06-01T03:00:00.000Z");
  });
});
