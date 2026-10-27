"""Master the audio of a Concat export into the release-ready file; the picture stream is copied untouched.

    python scripts/concat_master.py <slug> <concat export.mp4>

Concat has no master loudness normaliser or limiter, so its export sits under the series (Video 61: -16.9 LUFS).
The series' -14 LUFS does not come from audio_mixer (its loudnorm I=-16 leaves final_mix.wav at -17.3 LUFS for
Video 61) but from the HyperFrames render, which lifts it to -14.3; released Videos 54/57/59/60 measure
-14.1/-14.0/-13.9/-14.0 LUFS, peak about -1.2 dBFS. This runs loudnorm (I=-14:LRA=11:TP=-1.5, dynamic mode) on
the whole Concat mix, re-encodes the audio as AAC 192 kb/s, copies the H.264 stream, and writes
projects/<slug>/renders/<slug>-concat-<YYYYMMDD-HHMM>.mp4, the release copy (user decision 2026-10-27).
Loudness per clip is tried and rejected in concat_build.py's docstring.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = "loudnorm=I=-14:LRA=11:TP=-1.5,aresample=48000"  # series level (see above)


def master(src: Path, out: Path) -> Path:
    ff = shutil.which("ffmpeg")
    if not ff:
        raise SystemExit("ffmpeg not on PATH")
    subprocess.run([ff, "-y", "-v", "error", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
                    "-af", MASTER, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)], check=True)
    return out


def release_path(slug: str) -> Path:
    return REPO / "projects" / slug / "renders" / f"{slug}-concat-{time.strftime('%Y%m%d-%H%M')}.mp4"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    print(master(Path(sys.argv[2]), release_path(sys.argv[1])))
