import { expect, test, type Page } from "@playwright/test";
import { E2E_OWNER } from "./credentials";
import { makeJpeg, makeMp4, makeZip } from "./fixtures";

test.describe.configure({ mode: "serial" });

const RANDOM_ID = "0b6b8a0e-8f1e-4b52-9a8e-2b0c1f0d9a11";

async function uploadAndWait(page: Page, input: string, files: string[], expected: "done" | "duplicate" = "done") {
  await page.goto("/app/upload");
  await page.getByTestId(input).setInputFiles(files);
  const rows = page.getByTestId("upload-row");
  await expect(rows).toHaveCount(files.length);
  for (let i = 0; i < files.length; i++) await expect(rows.nth(i)).toHaveAttribute("data-status", expected, { timeout: 60_000 });
}

test.describe("locked before login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("private pages and APIs refuse anonymous visitors", async ({ page, request }) => {
    for (const path of ["/app", "/app/library", `/theatre/${RANDOM_ID}`, "/app/birthday/5"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.locator("img")).toHaveCount(0); // no thumbnails on the lock screen
    expect((await request.get("/api/media")).status()).toBe(401);
    expect((await request.get(`/api/media/${RANDOM_ID}/access?v=thumb`, { maxRedirects: 0 })).status()).toBe(401);
    expect((await request.get(`/api/films/${RANDOM_ID}/playback`, { maxRedirects: 0 })).status()).toBe(401);
    expect((await request.get("/api/export")).status()).toBe(401);
    const signup = await request.post("/api/auth/sign-up/email", {
      data: { email: "intruder@example.test", password: "intruder-password-1", name: "x" },
      headers: { origin: "http://localhost:3100" },
    });
    expect(signup.ok()).toBe(false);
    const robots = (await request.get("/login")).headers()["x-robots-tag"];
    expect(robots).toContain("noindex");
  });

  test("a wrong password gets a generic message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_OWNER.email);
    await page.getByLabel("Password").fill("not-the-password-1");
    await page.getByRole("button", { name: "Open the archive" }).click();
    await expect(page.getByText("That email and password don’t match.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("the archive", () => {
  test("empty state before any upload", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("His story starts here")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add Memories", exact: true })).toBeVisible();
  });

  test("uploads mixed portrait/landscape photos and shows them after refresh", async ({ page }) => {
    const files = [
      await makeJpeg("IMG20211201101010.jpg", 1, 1600, 1200),
      await makeJpeg("IMG20221010120000.jpg", 2, 1200, 1600),
      await makeJpeg("IMG20240520093000.jpg", 3, 1600, 900),
      await makeJpeg("IMG20260801180000.jpg", 4, 900, 1600),
      await makeJpeg("Snapchat-1584183713.jpg", 5, 1080, 1920), // dated before his birth: must go to review
    ];
    await uploadAndWait(page, "file-input-media", files);
    await page.goto("/app/library?order=recent");
    await expect(page.getByTestId("media-item")).toHaveCount(5);
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Preparing…")).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 60_000 });
  });

  test("offers Skip / Keep both for an exact duplicate", async ({ page }) => {
    const again = await makeJpeg("IMG20211201101010.jpg", 1, 1600, 1200);
    await uploadAndWait(page, "file-input-media", [again], "duplicate");
    await expect(page.getByRole("button", { name: "Keep both" })).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByTestId("upload-row")).toHaveAttribute("data-status", "cancelled");
  });

  test("imports a ZIP with nested folders safely and idempotently", async ({ page }) => {
    const a = await makeJpeg("IMG20230305101010.jpg", 11, 1400, 1000);
    const b = await makeJpeg("IMG20250102121212.jpg", 12, 1000, 1400);
    const zip = makeZip("archive.zip", [
      { name: "SWrit/2023/IMG20230305101010.jpg", file: a },
      { name: "SWrit/2025/IMG20250102121212.jpg", file: b },
      { name: "../escape.jpg", file: a },
      { name: "SWrit/readme.txt", data: Buffer.from("hello") },
    ]);
    await page.goto("/app/upload");
    await page.getByTestId("zip-input").setInputFiles(zip);
    const status = page.getByTestId("import-status");
    await expect(status).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
    await expect(status).toContainText("2 added · 0 already here · 2 skipped");
    await page.getByTestId("zip-input").setInputFiles(zip);
    await expect(status).toContainText("0 added · 2 already here", { timeout: 60_000 });
  });

  test("a doubtful date goes to the review tray and can be fixed", async ({ page }) => {
    await page.goto("/app/review");
    const field = page.getByLabel("Date for Snapchat-1584183713.jpg");
    await expect(field).toBeVisible();
    await field.fill("2025-03-14");
    await field.locator("xpath=..").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Date for Snapchat-1584183713.jpg")).toHaveCount(0);
    await page.goto("/app/timeline");
    await expect(page.getByRole("heading", { name: "Three years old" })).toBeVisible();
  });

  test("captions, favourites and the 'Our First Five Years' album", async ({ page }) => {
    await page.goto("/app/library");
    await page.getByTestId("media-item").first().getByRole("link").click();
    await page.getByLabel("Caption").fill("The day our world became a little brighter.");
    await page.getByRole("button", { name: "Save words" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await page.getByRole("button", { name: /Favourite/ }).click();
    await expect(page.getByRole("status")).toHaveText("Added to favourites.");
    await page.getByLabel("Our First Five Years").check();
    await expect(page.getByRole("status")).toHaveText("Added to Our First Five Years.");
    await page.goto("/app/albums");
    await expect(page.getByText("Our First Five Years")).toBeVisible();
  });

  test("an existing MP4 plays behind login as a past film", async ({ page, request }) => {
    const mp4 = makeMp4("Swritsinh_Five_Years_Birthday_Film.mp4");
    await uploadAndWait(page, "file-input-legacy_film", [mp4]);
    await page.goto("/app/birthday/5");
    await expect(page.getByText("Swritsinh Five Years Birthday Film")).toBeVisible();
    await page.getByRole("link", { name: "▶ Play", exact: true }).first().click();
    const video = page.getByTestId("legacy-film-video");
    await expect(video).toBeVisible();
    const src = await video.getAttribute("src");
    const r = await page.request.get(src!);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toBe("video/mp4");
    // Same URL without the session is refused.
    expect((await request.get(src!, { maxRedirects: 0, headers: { cookie: "" } })).status()).toBeGreaterThanOrEqual(300);
  });

  test("Birthday Theatre plays from the opening to the closing banner", async ({ page }) => {
    const failed: string[] = [];
    page.on("requestfailed", (r) => failed.push(r.failure()?.errorText ?? "failed"));
    await page.goto("/app/birthday/5");
    await page.getByTestId("play-birthday").click();
    await page.getByTestId("theatre-play").click();
    const theatre = page.getByTestId("theatre");
    await expect(theatre).toHaveAttribute("data-scene", "opening");
    await expect(page.getByTestId("banner-opening")).toContainText("Five Years of Love");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(theatre).toHaveAttribute("data-scene", "photo");
    await expect(page.getByTestId("photo-scene").last().locator("img").last()).toHaveAttribute("src", /^blob:/);
    for (let i = 0; i < 40; i++) {
      if ((await theatre.getAttribute("data-scene")) === "closing") break;
      await page.keyboard.press("ArrowRight");
    }
    await expect(page.getByTestId("banner-closing")).toContainText("HAPPY 5TH BIRTHDAY");
    await expect(page.getByTestId("banner-closing")).toContainText("SWRITSINH CHAUHAN");
    await expect(page.getByText(/no vocals/)).toBeVisible();
    expect(failed).toEqual([]);
  });

  test("renders a real 1080p MP4 on the worker and verifies it", async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto("/app/birthday/5");
    await page.getByRole("button", { name: "Render 1080p MP4" }).click();
    await expect(page.getByTestId("render-ready")).toBeVisible({ timeout: 400_000 });
    await expect(page.getByTestId("render-ready")).toContainText("1920×1080, 24 fps");
    await expect(page.getByTestId("render-ready")).toContainText("h264/aac");
    const r = await page.request.get(await page.getByRole("link", { name: "Download MP4" }).getAttribute("href").then((h) => h!));
    expect(r.status()).toBe(200);
    expect(r.headers()["content-disposition"]).toContain("attachment");
  });

  test("works at phone width without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const p of ["/app", "/app/upload", "/app/library", "/app/timeline", "/app/birthday/5"]) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, p).toBeLessThanOrEqual(1);
    }
  });

  test("signing out locks everything again", async ({ page }) => {
    await page.goto("/app/settings");
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/media")).status()).toBe(401);
  });
});
