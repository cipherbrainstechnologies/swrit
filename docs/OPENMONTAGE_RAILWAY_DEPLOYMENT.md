# Railway deployment

Do not add OpenMontage to the website image or the existing photo worker. Add one service from this repository.

| Setting | Value |
|---|---|
| Dockerfile | `Dockerfile.openmontage` |
| Config-as-code | `railway.openmontage.json` (Settings → Config-as-code on this service) |
| Start | `node --import tsx src/worker/main.ts` (the image default) |
| Public domain | none |
| Replicas | 1 |
| Concurrency | `JOB_CONCURRENCY=1` |
| Job filter | `WORKER_JOB_TYPES=studio.render` |
| Checkout | `OPENMONTAGE_ROOT=/opt/openmontage` |
| Python | `OPENMONTAGE_PYTHON=/opt/venv/bin/python` |
| Pin | `fecb9a1e3cc23ef84de30b272059457a427f16f8` |
| Remotion browser | `REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium` (set in the image; avoids downloading into read-only `node_modules/.remotion`) |

Copy these from the existing worker, by reference where Railway allows it. Do not invent new secrets.

- `DATABASE_URL`
- `STORAGE_DRIVER`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `BETTER_AUTH_SECRET`, `APP_URL`, `APP_TIMEZONE`
- `ENABLE_VIDEO_RENDER=true`

`STUDIO_ASSET_CAP` defaults to 5000. Above that, creation fails and lists the count. It does not drop items. `STUDIO_SPEND_CAP_USD` stays 0.

The image installs FFmpeg, Python 3, Chromium (for Remotion via `REMOTION_BROWSER_EXECUTABLE`), the pinned requirements and `remotion-composer` dependencies. `remotion-composer/node_modules/.remotion` is owned by the `app` user so cache metadata can be written; Chromium is not downloaded at render time. A 4K Remotion render of a long film can exceed a small Railway plan’s CPU, RAM and ephemeral disk. Keep one render at a time. The website process does not render.

The web service’s existing pre-deploy `pnpm db:migrate` applies `drizzle/0002_studio.sql`.

No new provider key is required for a source-led film.

## Redeploy after a Remotion or worker change

From your laptop (Railway CLI logged in, project linked):

```bash
railway login
railway link          # dear-swritsinh / production
railway service       # pick the OpenMontage worker (not `worker` / not `web`)
bash scripts/railway-openmontage-redeploy.sh
```

Verify inside the running container:

```bash
railway ssh -- test -x /usr/bin/chromium && printenv REMOTION_BROWSER_EXECUTABLE WORKER_JOB_TYPES
```

`web` redeploys on its own when `main` updates (`railway.web.json`). Only this service must be rebuilt for AI Studio Remotion renders.
