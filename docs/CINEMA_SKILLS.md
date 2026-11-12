# Cinema Skills

A cinema skill is a JSON document (schema version 1) stored in Postgres. Installing one is an upload. It does not change application code and does not redeploy Railway.

The existing worker renders the film. `JOB_CONCURRENCY=1` keeps a single render active. Preview is 1080p. Final is 3840×2160, 24 fps, H.264, yuv420p, AAC. Output is uploaded to the private bucket and played through the existing signed-URL login.

## What a skill may say

Story chapters by age, opening and closing lines, shot length, warm-natural grading, a 16:9 crossfade, and whether the finale requires the owner's Happy Birthday vocal (`happy_birthday_vocal_standard`).

Captions come only from words already written on a picture. Undated pictures are left out and counted for review. Duplicates are skipped. Originals are never deleted.

## What a skill may not contain

JavaScript, Python, shell, FFmpeg arguments, remote URLs, or storage paths. The validator rejects them. `SKILL.md` is compiled into the same JSON. No language model is configured, so the page says the draft came from the file itself and still needs approval.

## Audio

Upload the vocal with Add memories, then assign it in Cinema to `happy_birthday_vocal_standard` and confirm the rights. If the skill requires that role and it is missing, rendering stops with **Missing required audio asset**. An instrumental bed is not substituted.

## Variables

No new secrets. The cinema worker is the existing `worker` service: `DATABASE_URL`, `STORAGE_DRIVER`, the bucket credentials, and `ENABLE_VIDEO_RENDER=true`.

## Bundled example

`cinema/skills/father-and-son.skill.json` and `cinema/skills/SKILL.md` are **Father and Son**, a five-minute film. Cinema → Install Father and Son saves it as a draft.
