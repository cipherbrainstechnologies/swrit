# OpenMontage test results

Recorded while implementing the branch. This file is updated when a command is actually run.

## Passed

- `pnpm exec tsc --noEmit`
- `tests/unit/studio-catalog.test.ts` (3): pinned pipelines are present, generated pipelines are not source-led, family prompts are not sent to the stock documentary pipeline, captions are not invented.
- `tests/unit/cinema-skill.test.ts` (4) and `tests/unit/plan.test.ts` (8) still pass.

## OpenMontage tool smoke

A two-second synthetic color clip was passed to the pinned `VideoCompose.execute(operation="render")` with `render_runtime=ffmpeg` and profile `generic_hd`. The tool returned `success: true`. FFprobe-style review inside the tool reported container `mp4`, codec `h264`, resolution `1920x1080`, fps `30`, duration `2.03` seconds. `runtime_swap_detected` was false. Final review status was `revise` because the clip is silent. This was not a family film and Remotion was not used.

The same checkout's `score_slideshow_risk` scored a two-shot source-led plan at `0.92`, verdict `strong`.

## Not passed, because they were not run

- No authenticated browser pass of AI Studio.
- No FFmpeg on the Windows shell, so a local `video_compose` MP4 was not produced here.
- No FFprobe check of a finished studio export.
- No worker interruption test against Railway.
- Remotion was not installed on this machine.

The production named Cinematic Instagram Reel was marked complete with a 7.062 second 1080×1920 file. That file is the final export, not a preview. The stored scene plan still lists eight photographs through 38 seconds. The renderer looked up `scene-1` … `scene-8` against asset-row UUIDs, matched none, and kept only the two title cards plus Remotion's tail. The same skip marked other short exports complete. A file is no longer complete unless its duration matches the rebuilt timeline, every selected shot has a cut, and a selected soundtrack measures louder than silence.
