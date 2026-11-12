# Backup & restore

No single provider should hold the only copy of irreplaceable childhood files.

## What to back up

| Data | Where | Backup |
|---|---|---|
| Originals, previews, rendered films | Cloudflare R2 bucket | Second copy elsewhere (below) |
| Dates, captions, albums, films, users | Railway PostgreSQL | Railway volume backups + periodic `pg_dump` |
| Everything, provider-independent | Your own disk | `pnpm export:heirloom` |

## Heirloom export (recommended monthly, and before any migration)

```bash
railway run pnpm export:heirloom --out ./exports
```

Creates `exports/dear-swritsinh-YYYY-MM-DD/` with:

- `originals/`: every photo/video exactly as uploaded, named `date_originalname`
- `films/`: rendered birthday films
- `manifest.json` + `media.csv`: dates, date sources, captions, stories, favourites, albums
- `SHA256SUMS.txt`: verify with `sha256sum -c SHA256SUMS.txt` (Git Bash / Linux / macOS)
- The export warns if a stored file no longer matches the checksum recorded at upload.

Keep one copy on an external drive at home and one in a different cloud (e.g. Google Drive / OneDrive / Backblaze).
The in-app *Settings → Download the archive manifest* gives the metadata JSON at any time.

## Second copy of R2

Option A: `rclone sync r2:dear-swritsinh-media b2:dear-swritsinh-backup` on a schedule from a trusted machine
(R2 and Backblaze B2 are both S3-compatible). Option B: the heirloom export above to two places.

## Database

1. Railway → Postgres service → Backups → enable daily and weekly backups.
2. Occasionally: `railway run pg_dump "$DATABASE_URL" -Fc -f dear-swritsinh.dump` and store with the export.

## Restore test (do this once after go-live, then twice a year)

1. Create a new Railway environment (`restore-test`) with its own Postgres and an empty R2 bucket.
2. `pg_restore -d "$DATABASE_URL" dear-swritsinh.dump` (or restore a Railway backup into it).
3. Copy objects into the new bucket with `rclone sync`.
4. Point a test `web` service at them and sign in: photos, captions and films should all be present.
5. Delete the test environment.

Status: the export command was run against a local test archive; **a production restore has not been tested yet.**

## Deleting

The web app only moves items to Trash (soft delete). Permanent deletion is deliberately not exposed in the UI; to
remove an original permanently, delete it from the database and bucket manually after exporting.
