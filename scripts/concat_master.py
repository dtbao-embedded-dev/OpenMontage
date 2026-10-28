"""Master the audio of a Concat export into the release-ready file; the picture stream is copied untouched.

    python scripts/concat_master.py <slug> <concat export.mp4>

Concat has no master loudness normaliser or limiter, so its export sits under the series (Video 61: -16.9 LUFS).
The series' -14 LUFS does not come from audio_mixer (its loudnorm I=-16 leaves final_mix.wav at -17.3 LUFS for
Video 61) but from the HyperFrames render, which lifts it to -14.3; released Videos 54/57/59/60 measure
-14.1/-14.0/-13.9/-14.0 LUFS, peak about -1.2 dBFS. This runs loudnorm (I=-14:LRA=11:TP=-1.5, dynamic mode) on
the whole Concat mix, re-encodes the audio as AAC 192 kb/s, copies the H.264 stream, and writes
projects/<slug>/renders/<slug>-concat-<YYYYMMDD-HHMM>.mp4, the release copy (user decision 2026-10-27).
Loudness per clip is tried and rejected in concat_build.py's docstring. Concat's own audio controls, checked on
0.2.8 (2026-10-27): per-clip volume, fades, volume keys, track mute, and the per-clip filter 'Normalize Loudness'
(concat.loudness, target -30..-12); no master bus, track volume, limiter, compressor, ducking (issue #282, open) or
audio export option. concat.loudness keeps peaks near -2 dBFS: target -14 on the raw voice sections reached
-15.3..-16.7 LUFS and -16.3 LUFS for the export, the same with Enhance Voice 60 % in front of it.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = "loudnorm=I=-14:LRA=11:TP=-1.5,aresample=48000"  # series level (see above)


def video_seconds(src: Path) -> str:
    fp = shutil.which("ffprobe")
    if not fp:
        raise SystemExit("ffprobe not on PATH")
    return subprocess.run([fp, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0",
                           str(src)], capture_output=True, text=True, check=True).stdout.strip()


def master(src: Path, out: Path) -> Path:
    ff = shutil.which("ffmpeg")
    if not ff:
        raise SystemExit("ffmpeg not on PATH")
    # loudnorm + AAC can end the audio a few frames past the picture (Video 63: +0.08 s), which concat_compare.py
    # reports as a duration change: cut the output at the picture's own length.
    subprocess.run([ff, "-y", "-v", "error", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
                    "-af", MASTER, "-c:a", "aac", "-b:a", "192k", "-t", video_seconds(src), "-movflags", "+faststart",
                    str(out)], check=True)
    return out


def release_path(slug: str) -> Path:
    return REPO / "projects" / slug / "renders" / f"{slug}-concat-{time.strftime('%Y%m%d-%H%M')}.mp4"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    print(master(Path(sys.argv[2]), release_path(sys.argv[1])))
