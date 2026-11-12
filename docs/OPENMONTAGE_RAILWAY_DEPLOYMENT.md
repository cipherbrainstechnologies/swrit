# Railway deployment

Do not add OpenMontage to the website image or the existing photo worker. Add one service from this repository.

| Setting | Value |
|---|---|
| Dockerfile | `Dockerfile.openmontage` |
| Start | `node --import tsx src/worker/main.ts` (the image default) |
| Public domain | none |
| Replicas | 1 |
| Concurrency | `JOB_CONCURRENCY=1` |
| Job filter | `WORKER_JOB_TYPES=studio.render` |
| Checkout | `OPENMONTAGE_ROOT=/opt/openmontage` |
| Python | `OPENMONTAGE_PYTHON=/opt/venv/bin/python` |
| Pin | `fecb9a1e3cc23ef84de30b272059457a427f16f8` |

Copy these from the existing worker, by reference where Railway allows it. Do not invent new secrets.

- `DATABASE_URL`
- `STORAGE_DRIVER`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `BETTER_AUTH_SECRET`, `APP_URL`, `APP_TIMEZONE`
- `ENABLE_VIDEO_RENDER=true`

`STUDIO_ASSET_CAP` defaults to 5000. Above that, creation fails and lists the count. It does not drop items. `STUDIO_SPEND_CAP_USD` stays 0.

The image installs FFmpeg, Python 3, the pinned requirements and `remotion-composer` dependencies. A 4K Remotion render of a long film can exceed a small Railway plan’s CPU, RAM and ephemeral disk. Keep one render at a time. The website process does not render.

The web service’s existing pre-deploy `pnpm db:migrate` applies `drizzle/0002_studio.sql`.

No new provider key is required for a source-led film.
