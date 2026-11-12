# OpenMontage implementation status

Pinned commit: `fecb9a1e3cc23ef84de30b272059457a427f16f8`.

## Done

- Catalog, profiles and declared providers read from that commit.
- Authenticated AI Studio pages: create, scene edits, approval, render, cancel, playback, skills, providers.
- Postgres tables and `studio.render` on the existing queue.
- Worker path that stages private media and calls `video_compose`.
- Separate `Dockerfile.openmontage`. One render at a time.
- Source-led pipelines only: cinematic, hybrid, clip-factory, talking-head, screen-demo, podcast-repurpose.
- Output profiles that exist upstream. 4:5 is not invented.
- Reference URLs are not fetched. Pixabay is a link, not a scraper.
- Uploaded skills are validated data.

## Not done

- The research, script and asset director stages are not executed by an agent inside the worker. The website writes a source-led proposal and scene plan from the owner’s title, prompt and library metadata, then the owner approves it. That is not the full executive-producer loop.
- Paid image, video, voice and music providers are not called.
- HyperFrames is not selected.
- Documentary montage does not search Pexels, Archive.org or Wikimedia.
- There is no YouTube or Instagram publishing OAuth.
- Face detection is not added. Remotion’s still-image scene uses its own cover crop. The proposal locks that runtime so it is not a surprise swap.
- A verified end-to-end MP4 from this integration has not been produced yet. It needs the studio worker image, an approved project and media the owner already uploaded.
