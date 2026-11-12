# OpenMontage architecture

The website owns sign-in, the library, proposals, scene edits and playback. The studio worker owns the OpenMontage checkout and `video_compose`.

```text
Browser (signed in)
  -> POST /api/studio/projects
  -> scene edits, approval
  -> POST /api/studio/projects/:id/render
Postgres jobs (studio.render)
  -> studio worker claims the row
  -> stages owned objects from the private bucket into a temp directory
  -> python services/openmontage/compose_job.py
  -> OpenMontage VideoCompose.execute(operation=render)
  -> ffprobe
  -> put the MP4 back in the private bucket
  -> signed playback URL
```

Photographs use `render_runtime=remotion` and `renderer_family=explainer-data`, because the pinned Explainer composition can show a still or a video clip. Video-only cuts use `render_runtime=ffmpeg`, which trims and concatenates. That choice is stored on the project before approval. The worker does not change it.

Each export names an upstream profile (`youtube_landscape`, `youtube_4k`, `youtube_shorts`, `instagram_reels`, `instagram_feed`, `tiktok`, `linkedin`, `cinematic`, `generic_hd`). A 9:16 export is a separate render with that profile, not a crop of a finished 16:9 file. Instagram 4:5 is absent from the pinned `lib/media_profiles.py`, so it is not offered.

Scene text is the owner’s title and the caption already stored on the media row. Undated items are flagged and kept. Duplicate rows are skipped and the original file remains.

HEIC files are rotated with Sharp into a working JPEG. The original object is not replaced.

Temporary files live under the system temp directory and are deleted after the job. The MP4 is not written into the application directory.

The existing `film.render` worker is unchanged and does not claim `studio.render` unless `WORKER_JOB_TYPES` includes it.
