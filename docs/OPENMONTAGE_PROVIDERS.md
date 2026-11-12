# OpenMontage providers

AI Studio → Providers lists the `provider` names declared on tools in the pinned commit. The list is a snapshot in `src/studio/upstream-catalog.json`. It is not a live health check.

Nothing in that list is invoked. `STUDIO_SPEND_CAP_USD` defaults to 0. `externalProcessing` is stored false and the create API rejects pipelines that need generated or stock media.

Local tools the worker does call: `video_compose` (FFmpeg and, for stills, Remotion). HyperFrames is not selected. If Remotion fails, the tool’s own error is stored. The worker does not substitute a Ken Burns slideshow from `src/film/render.ts` and does not claim the run succeeded.

Pixabay music is suggested as a link: https://pixabay.com/music/ . The owner downloads a track they are allowed to use and uploads it through the existing library. `PIXABAY_API_KEY` is optional and unused. The website does not scrape Pixabay.

Railway has no GPU in this project. GPU providers in the catalog stay unused.
