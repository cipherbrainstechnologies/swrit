# Dear Swritsinh

A private, mobile-first childhood archive and birthday theatre for Swritsinh Chauhan.
*Every moment. Every milestone. Forever yours.*

Nothing here is public: every page, API call, thumbnail and video requires the owner's login.
Family photos are **never** committed to this repository (`photos/`, `media-inbox/` and `.data/` are git-ignored).

## Quick start (local)

```bash
pnpm install
pnpm owner:bootstrap   # one time: choose the owner email + password (hidden input)
pnpm dev               # http://localhost:3000
```

Locally the app uses an embedded PostgreSQL (PGlite in `.data/pglite`) and file storage in `.data/objects`,
and the background worker runs inside the web process. No Docker or cloud accounts are needed to try it.

Import the existing family folder or ZIP (same validation as the web uploader, idempotent):

```bash
pnpm media:import --path ./photos/SWrit --wait
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev server / production build / production server |
| `pnpm worker` | Background worker (Railway `worker` service) |
| `pnpm lint` · `pnpm typecheck` | ESLint · TypeScript |
| `pnpm test` | Vitest unit + integration tests (auth, IDOR, uploads, ZIP safety, queue, real FFmpeg render) |
| `pnpm test:e2e` | Playwright end-to-end against the production build (`pnpm build` first) |
| `pnpm db:generate` · `pnpm db:migrate` | Drizzle migrations |
| `pnpm owner:bootstrap` | One-time owner provisioning (refuses once an owner exists) |
| `pnpm media:import --path <dir or zip>` | Import photos/videos/ZIPs; `legacy-films/` folders become past films |
| `pnpm film:render --age 5 [--resolution 2160p] [--run]` | Queue (and optionally run) an MP4 render |
| `pnpm export:heirloom --out ./exports` | Full export: originals, films, manifest, SHA-256 sums |
| `pnpm verify:storage` | Checks storage works and that the R2 bucket is not public |

## Architecture

One Next.js (App Router, TypeScript) app plus a worker process sharing `src/server`:

- `src/app` – pages and API routes (every route authorises on the server)
- `src/server` – auth (Better Auth), DB (Drizzle; Postgres in production, PGlite locally), storage (Cloudflare R2 or local), uploads, media processing, ZIP import, job queue
- `src/film` – film plan (shared by the browser Theatre and the renderer), music, FFmpeg renderer
- `src/worker` – PostgreSQL-backed job runner (`FOR UPDATE SKIP LOCKED` + leases)
- `scripts/` – CLI tools · `drizzle/` – migrations · `docs/` – deployment, security, backup, editing, status

The spec suggested an `apps/` + `packages/` monorepo; a single package with clear module boundaries was chosen
for a reliable birthday-day delivery (one lockfile, one build). See `docs/ROADMAP_AND_STATUS.md`.

## Documentation

- [Deploy to Railway](docs/DEPLOY_RAILWAY.md)
- [Import my memories](docs/IMPORT_MY_MEMORIES.md)
- [Security & privacy](docs/SECURITY_PRIVACY.md)
- [Backup & restore](docs/BACKUP_RESTORE.md)
- [Birthday film editing](docs/BIRTHDAY_FILM_EDITING.md)
- [Roadmap & status](docs/ROADMAP_AND_STATUS.md)
