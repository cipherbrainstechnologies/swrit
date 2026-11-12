# OpenMontage integration audit

Date: 2026-11-13. Repository: Dear Swritsinh (`cipherbrainstechnologies/swrit`).

## What the website already is

- Next.js 15.5 App Router, React 19, TypeScript, pnpm 9.15.9, Node 22 in Docker.
- Better Auth, Drizzle, Postgres. Private routes live under `/app` and `/api`.
- Media metadata is the `media` table. Originals stay in the private bucket (`STORAGE_DRIVER=r2`, Railway Tigris in production). Keys are server-side. The browser only receives short-lived signed URLs.
- Jobs are rows in `jobs`, claimed with `FOR UPDATE SKIP LOCKED`. The existing worker runs `media.process`, `import.zip` and `film.render`.
- Cinema Skills already render a family film through `src/film/render.ts`. That path is unchanged.
- Railway services in production: `swrit` (web, Dockerfile, pre-deploy `pnpm db:migrate`) and `worker` (Dockerfile.worker). Both were healthy on `main` before this branch.

## What OpenMontage actually is

Official repository: https://github.com/OpenMontageInc/OpenMontage

Pinned commit: `fecb9a1e3cc23ef84de30b272059457a427f16f8`

Author of that commit: `pika-ai-code`. Message: `feat(video): add Pika H3 Flex hosted provider via the Pika API (#905)`. Date: 2026-11-08.

License: GNU AGPL-3.0. `.python-version` is 3.11. `.node-version` is 22.23.4. The Makefile accepts Python 3.10 or newer.

OpenMontage is an instruction system. An agent reads `pipeline_defs/*.yaml` and the stage director skills, then calls Python tools. There is no supported headless “make a video” API. `tools/video/video_compose.py` is the compose tool. It locks `render_runtime` to `remotion`, `hyperframes` or `ffmpeg` and refuses a silent swap. Its pre-compose check can block a plan that scores as a slideshow.

The catalog in `src/studio/upstream-catalog.json` was exported from that checkout: 13 pipelines, 9 media profiles, 162 declared tools.

## Decision

The website keeps authentication, the library, Cinema and the current worker. A separate worker image (`Dockerfile.openmontage`) checks out the pinned commit, installs its requirements and Remotion, and runs only `studio.render`. The job calls `video_compose` with `operation=render`. It does not reimplement compose in the Next.js app.

Generated pipelines (`animated-explainer`, `animation`, `avatar-spokesperson`, `character-animation`, `documentary-montage`, `localization-dub`) stay unavailable. Running them without their providers would skip stages the manifests require. The spend cap stays 0. Private media is not sent to a provider.

A reference URL is stored and not fetched. Pixabay is a link the owner opens (https://pixabay.com/music/). The studio does not scrape it.

## License boundary

OpenMontage stays in its own tree at the pinned commit. The Next.js app does not copy its Python or Remotion source. The adapter is `services/openmontage/compose_job.py`, which imports `video_compose` at runtime. Offering a modified OpenMontage as a network service can trigger AGPL source obligations. This private family site’s operator already has this repository. A lawyer should review the boundary before the studio is offered to anyone outside the family.
