"""Compare a Concat export with the HyperFrames render it was built from.

    python scripts/concat_compare.py <slug> <render.mp4> <concat.mp4>

Prints duration, integrated loudness, speech-over-gap level (the project's build_hf.speech_vs_gap), sample peak
with the count of samples at full scale, and picture SSIM. Exits 1 when the export clips, its speech sits less
than 10 dB over the gaps, its loudness is more than 1 LU off the render's, the durations differ by more than a
frame, or the picture SSIM (Y) is under 0.999. The Concat export is the release copy (user decision 2026-10-27).
"""
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from concat_build import REPO, ffmpeg, lufs  # noqa: E402


def build_hf(slug: str):
    spec = importlib.util.spec_from_file_location("build_hf", REPO / "projects" / slug / "work" / "build_hf.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def duration(p: Path) -> float:
    out = subprocess.run([shutil.which("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "json", str(p)],
                         capture_output=True, text=True)
    return float(json.loads(out.stdout)["format"]["duration"])


def peaks(p: Path) -> tuple[float, int]:
    raw = subprocess.run([ffmpeg(), "-v", "error", "-i", str(p), "-f", "f32le", "-"], capture_output=True).stdout
    a = np.abs(np.frombuffer(raw, np.float32))
    return float(a.max()), int((a >= 0.999).sum())


def gap_db(B, p: Path) -> float:
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        B.speech_vs_gap(p)
    print("  " + buf.getvalue().strip())
    return float(re.search(r"-> ([-\d.]+) dB", buf.getvalue()).group(1))


def ssim_y(a: Path, b: Path) -> float:
    p = subprocess.run([ffmpeg(), "-v", "info", "-i", str(a), "-i", str(b), "-filter_complex",
                        "[0:v]setpts=PTS-STARTPTS[x];[1:v]setpts=PTS-STARTPTS[y];[x][y]ssim", "-f", "null", "-"],
                       capture_output=True, text=True)
    line = [l for l in p.stderr.splitlines() if "SSIM Y:" in l][-1]
    print("  picture SSIM", line.split("SSIM ")[1])
    return float(re.search(r"Y:([\d.]+)", line).group(1))


def main() -> None:
    slug, hf, cc = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    B = build_hf(slug)
    res = {}
    for name, p in (("render", hf), ("concat", cc)):
        d, l, (pk, n) = duration(p), lufs(p), peaks(p)
        print(f"{name:7s} {d:8.3f} s  {l:6.1f} LUFS  peak {pk:.3f} ({n} samples at full scale)")
        res[name] = (d, gap_db(B, p), n, l)
    s = ssim_y(hf, cc)
    bad = []
    if res["concat"][2]:
        bad.append("export clips")
    if res["concat"][1] < 10:
        bad.append("speech < 10 dB over gaps")
    if abs(res["render"][3] - res["concat"][3]) > 1.0:
        bad.append("loudness more than 1 LU off the render")
    if abs(res["render"][0] - res["concat"][0]) > 1 / 30:
        bad.append("durations differ")
    if s < 0.999:
        bad.append("picture differs")
    print("FAIL: " + ", ".join(bad) if bad else "PASS")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
