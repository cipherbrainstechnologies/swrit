# Deploy to Railway

Topology: **web** (Next.js, public HTTPS) + **worker** (no public domain) + **PostgreSQL** on Railway,
with originals in a **private Cloudflare R2 bucket**. Nothing persistent lives on Railway's container disks.

> Never paste secrets into chat, issues or source files. Enter them only as Railway service variables.

## 1. Cloudflare R2 (private storage)

1. Cloudflare dashboard → R2 → **Create bucket** `dear-swritsinh-media` (Standard storage).
2. Bucket → Settings: keep **Public access disabled** (no `r2.dev` URL, no custom public domain).
3. R2 → **Manage API tokens** → Create token with **Object Read & Write**, scoped to *this bucket only*.
   Note the Access Key ID, Secret Access Key and your Account ID (shown once).
4. Bucket → Settings → **CORS policy** (replace the origin with your real app URL):

```json
[
  {
    "AllowedOrigins": ["https://YOUR-DOMAIN.example"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`ExposeHeaders: ETag` is required: large videos upload in parts and the browser must read each part's ETag.
`GET` is required because the Birthday Theatre preloads photos with `fetch`.

## 2. Railway project

1. Push this repository to a **private** GitHub repo (photos are git-ignored and never pushed).
2. Railway → New Project `dear-swritsinh` (environment `production`).
3. **+ New → Database → PostgreSQL.** Do not enable a public TCP proxy for it.
4. **+ New → GitHub Repo → this repo** → name the service `web`.
   - Settings → *Config-as-code* → Railway config file: `railway.web.json`
     (Dockerfile build, `pnpm db:migrate` as pre-deploy command, health check `/api/health`).
   - Settings → Networking → **Generate Domain** (or add your own domain).
5. **+ New → GitHub Repo → same repo** → name it `worker`.
   - Config file: `railway.worker.json` (uses `Dockerfile.worker`, FFmpeg + fonts included).
   - **No** public domain. Keep 1 replica. Start with 2 vCPU / 2–4 GB RAM; 4K renders need more.

## 3. Variables

Set on **both** `web` and `worker` (use Railway's *shared variables* to avoid duplicates):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private network reference) |
| `BETTER_AUTH_SECRET` | 32+ random bytes, e.g. output of `openssl rand -base64 48` (generate on your own machine) |
| `APP_URL`, `BETTER_AUTH_URL` | `https://<your web domain>` |
| `STORAGE_DRIVER` | `r2` |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from step 1 |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `PUBLIC_SIGNUP_ENABLED` | `false` |
| `ENABLE_VIDEO_RENDER` | `true` |

`web` only: `RUN_WORKER_IN_WEB=false`, `TRUST_PROXY=true`. `worker` only: `JOB_CONCURRENCY=1`.
Mark `BETTER_AUTH_SECRET` and `R2_SECRET_ACCESS_KEY` as **sealed** variables.
See `.env.example` for the full list.

## 4. First deploy, migrations and the owner

1. Deploy both services. The web pre-deploy step runs `pnpm db:migrate`.
2. Create the owner once, from your machine (secrets are typed into a hidden prompt, never stored in files):

```bash
railway login
railway link            # choose dear-swritsinh / production / web
railway run pnpm owner:bootstrap
```

   `railway run` injects the production variables locally. The command refuses to run again once an owner exists.
   Note: it needs the database reachable from your machine; if Postgres is private-only, run it in the web
   service instead with `railway ssh` → `pnpm owner:bootstrap`.
3. Open `https://<domain>/login` and sign in.

## 5. Verify before importing real memories

1. `railway run pnpm verify:storage`: confirms writes work and an **unsigned** GET is denied (bucket is private).
2. In the app, upload a **test image** (not a family photo), check it appears, open it, sign out, and confirm
   `https://<domain>/api/media` returns 401.
3. Then import the family archive (web uploader or `railway run pnpm media:import --path ./media-inbox`).

## 6. Backups and costs

- Enable Railway **volume backups** for the Postgres service (daily + weekly).
- Set up an **independent second copy** of R2 (see `BACKUP_RESTORE.md`).
- Set a Railway **usage limit / alert**. Rendering is CPU-heavy; hosting is not free.

## Optional: network-level lock

For "invisible to the internet" put **Cloudflare Access** in front of the web domain (Zero Trust → Access →
Application → your domain, allow only family emails). The app's own login stays in place behind it.

## Daily birthday-draft cron (optional, later)

Railway Cron runs in **UTC** and is not exact. A daily job would only prepare an editable draft; films are never
auto-published. Not configured yet.
