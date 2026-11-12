"""Call the pinned OpenMontage video_compose tool. No shell, no extra tools."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    job_path = Path(sys.argv[1])
    job = json.loads(job_path.read_text(encoding="utf-8"))
    root = Path(job["openmontage_root"])
    sys.path.insert(0, str(root))
    try:
        from tools.video.video_compose import VideoCompose
    except Exception as exc:  # noqa: BLE001 — surface the import failure to the worker
        print(json.dumps({"success": False, "error": f"OpenMontage import failed: {exc}"}))
        return 1
    # Use Remotion's pinned chrome-headless-shell from `npx remotion browser ensure` unless the
    # job explicitly overrides. Do not fall back to REMOTION_BROWSER_EXECUTABLE — distro Chromium
    # often SIGTRAPs in containers (see remotion.dev/docs/miscellaneous/chrome-headless-shell).
    browser_executable = job.get("remotion_browser_executable")
    payload: dict = {
        "operation": "render",
        "edit_decisions": job["edit_decisions"],
        "asset_manifest": job["asset_manifest"],
        "proposal_packet": job["proposal_packet"],
        "scene_plan": job.get("scene_plan") or [],
        "output_path": job["output_path"],
        "profile": job.get("profile"),
        "audio_path": job.get("audio_path"),
        "options": {"subtitle_burn": False},
    }
    if browser_executable:
        payload["remotion_browser_executable"] = str(browser_executable)
    tool = VideoCompose()
    result = tool.execute(payload)
    data = getattr(result, "data", None)
    print(json.dumps({"success": bool(result.success), "error": result.error, "data": data}, default=str))
    output = Path(job["output_path"])
    return 0 if result.success and output.is_file() and output.stat().st_size > 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"success": False, "error": str(exc)}))
        raise SystemExit(1)
