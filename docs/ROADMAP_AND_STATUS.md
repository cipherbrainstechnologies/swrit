# Roadmap & status

Last updated: 12 November 2026. "Verified" means covered by an automated test or a run whose output was checked.

## P0: Birthday-ready

| Feature | Status | Evidence |
|---|---|---|
| Private login, no public sign-up, one-time owner bootstrap | Done | unit: sign-up refused; e2e: anonymous redirects/401s; CLI refuses second bootstrap |
| Persistent login rate limit, generic errors, CSRF origin check | Done | unit: 429 after repeated failures, rows in `rate_limit`; cross-site POST → 403 |
| Server-side authorisation on every page/API, no IDOR | Done | unit: other family's media → 404 on GET/PATCH/access |
| Sign out, sign out everywhere, change password | Done | e2e: sign-out locks APIs |
| Private R2 storage with presigned PUT/GET, random keys | Done | S3 driver verified end-to-end against SeaweedFS (S3-compatible) in Docker: signed GET ok, unsigned GET 403; **real Cloudflare R2 not yet tested** |
| Phone multi-select upload, progress, cancel, retry, duplicate Skip/Keep both | Done | e2e: 5 mixed photos, duplicate prompt |
| Large videos: multipart (16 MB parts, retries, abort/cleanup of stale sessions) | Done | code path shared with local driver; cross-reload resume **not** implemented (documented) |
| Magic-byte validation, originals byte-for-byte | Done | unit: disguised HTML rejected; stored bytes equal uploaded bytes |
| Previews (WebP, EXIF/GPS stripped), video posters, H.264 copy for non-H.264 | Done | unit + 6 real photos processed locally |
| Capture dates: EXIF → filename → review; IST; never trust modified time | Done | unit (19 date tests); real photos: 2004 camera clock + pre-birth Snapchat sent to review |
| ZIP import (background), traversal/symlink/bomb/nested defences, idempotent | Done | unit + e2e: `../escape.jpg` rejected, re-import = 0 added |
| CLI `media:import` (same pipeline), `legacy-films/` → past films | Done | run on 6 real photos locally |
| Home ("Dear Swritsinh", countdown in IST, CTAs), library + filters, year pages, timeline, review tray | Done | e2e + screenshots (desktop + 390 px) |
| Captions, stories, favourites, albums incl. *Our First Five Years* / *Family & Love* | Done | e2e |
| Birthday Theatre: fullscreen slideshow, banners, captions, controls, music (instrumental + labelled HB melody), uploaded song | Done | e2e: opening → photos (blob images) → closing banner; no failed requests |
| Play existing family MP4 behind login | Done | e2e: authenticated playback 200, `video/mp4` |
| Heirloom export with SHA-256 manifest | Done | run locally; `sha256sum -c` all OK |
| Dockerfiles + Railway config + deploy guide | Done | both images built; all 14 e2e tests pass on Docker web + worker + Postgres 16 + S3 storage (`tests/docker`); **not deployed to Railway** |

## P1: Film studio

| Feature | Status | Evidence |
|---|---|---|
| Worker + durable Postgres queue (SKIP LOCKED, leases, retries, cancel, idempotency) | Done | unit queue test |
| 1080p H.264/AAC render: titles, chapters, captions, Ken Burns, pillarbox for portraits, loudness-normalised score | Done | unit (real FFmpeg) + e2e via UI; ffprobe: 1920×1080, 24 fps, h264/aac stereo |
| QA: ffprobe checks + black-frame sampling before marking ready | Done | in renderer; failure → human-readable error |
| Studio: titles, captions, pin/leave out, target length, approve | Done | manual review; not e2e-tested |
| Uploaded song for finale (rights checkbox gates MP4 use) | Done | not e2e-tested with a real song file |
| 4K UHD render | Implemented, **not tested** | needs a larger worker |
| Timeline scrubbing in studio, per-scene durations/crops, automatic yearly drafts (cron) | Not done | |

## P2: Heirloom

Not implemented: Dad's Voice recordings, Letters Through Time / time capsules, Atlas of Firsts, Memory
Constellation, Then & Now, Today's Little Thing, family invitations, AI caption ideas. Database tables for
milestones, memories, voice notes and capsules exist so these can be added without breaking changes.

## Deviations from the spec (deliberate)

- Single package (Next.js app + `src/worker`) instead of `apps/` + `packages/`: one lockfile, one build.
- One `jobs` table for all job types (media, imports, renders) instead of a render-only `render_jobs` table.
- No shadcn/ui or Motion: hand-built components and CSS transitions keep the bundle small (~110 kB first load).
- PGlite (embedded Postgres) for local dev/tests because Docker was unavailable; production uses Railway Postgres
  with the same migrations.
- Better Auth's default scrypt hashing (Argon2id not configured).

## Next steps

1. Deploy to Railway + R2 (`DEPLOY_RAILWAY.md`) and run the production checks with a test image.
2. Import the real archive, confirm dates, curate *Our First Five Years*.
3. Render the 1080p MP4 and copy it to USB for the party.
4. Then: real-bucket R2 test of multipart uploads from iPhone Safari and Android Chrome; restore test; P2.
