# Import my memories

## From a phone (simplest)

Sign in → **Add memories** → *Select photos & videos*. Pick many at once from the gallery.
Each file shows its own progress, can be cancelled or retried, and exact duplicates ask *Skip* or *Keep both*.
Videos over 64 MB upload in 16 MB parts that retry automatically. If the page is closed mid-upload, that file
must be chosen again (resuming across a page reload is not implemented yet; nothing half-written is kept).

## A ZIP archive

**Add memories → Import a ZIP archive.** Folders inside the ZIP are fine. The worker:

- rejects path traversal (`../`), absolute paths, symlinks, nested archives, oversized entries and
  zip-bomb compression ratios, and counts real bytes while extracting (header sizes are not trusted);
- checks every file's real type from its bytes (a `.jpg` that is really HTML is rejected);
- stores each accepted file privately under a random key, unchanged;
- skips files already in the archive (same SHA-256), so importing the same ZIP twice is safe.

The result shows *added / already here / skipped* with a reason for each skipped file.

## From a computer folder (CLI)

Put files in `media-inbox/` (git-ignored) and run:

```bash
pnpm media:import --path ./media-inbox --wait
```

- `.zip` files inside the folder are imported with the same rules as above.
- Files under any `legacy-films/` folder become **past films** in the Birthday Theatre
  (e.g. `media-inbox/legacy-films/Swritsinh_Five_Years_4K_Cinema_Master.mp4`).
- `--wait` processes previews in the same process (useful locally); on Railway the worker does it.

For production, run with production variables: `railway run pnpm media:import --path ./media-inbox`.

## Suggested layout for the current material

```
media-inbox/
  SWrit.zip                         # the 76-photo archive
  extra-photos/                     # the 19 separately uploaded photos
  originals/1000079313.mp4          # original video clip
  legacy-films/                     # earlier edited films (shown as past editions)
    Swritsinh_Five_Years_4K_Cinema_Master.mp4
    Swritsinh_Five_Years_Directors_Cut.mp4
    Swritsinh_Five_Years_Birthday_Film.mp4
```

## Dates

Dates come from the camera (EXIF) first, then the file name (`IMG20220416170506.jpg`), and are interpreted in
India time. Anything implausible (e.g. a camera that thinks it is 2004, a date before his birth, or only a
file-modified time) goes to **His Story → Help me place these memories**, and stays out of the timeline and film
until you confirm it. Nothing is guessed silently. A local test import of 6 of the real photos found exactly
this: one camera photo dated 2004 and one Snapchat file dated before his birth were both sent to review.

## HEIC / MOV

Originals are always kept. iPhone HEIC photos may show "Preview unavailable" because the image library in this
build cannot decode HEVC-based HEIC; the original stays downloadable. Videos that are not H.264 (e.g. HEVC MOV)
get an additional 1080p H.264 copy for playback; the original is untouched.
