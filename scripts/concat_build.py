"""Rebuild a finished OpenMontage project as a Concat project (headless, over MCP), then export it.

    python scripts/concat_build.py <slug> [--render renders/<file>.mp4] [--project-dir DIR] [--force] [--no-export]
    python scripts/concat_build.py <slug> --stems-only

--stems-only rewrites work/concat_stems/narration_<id>.wav (the files the Concat project's voice clips point to)
from the current locked narration and stops, so a re-taken section reaches an existing, hand-edited project
without rebuilding it; a take of another length still needs its clip trimmed or moved in Concat.

Inputs from projects/<slug>/: artifacts/edit_decisions.json (scene cuts, section starts, end), the HyperFrames
render (default: newest renders/<slug>-2*.mp4), assets/audio/narration_<id>.wav, assets/music/music_bed.wav,
work/narration_full.wav and work/word_timings.json.

Timeline (1080x1920, 30 fps), one lane each:
  T1 picture: the render, muted, split at every scene cut into clips named "scene <id>", so a scene can be
     trimmed or replaced by hand.
  T2 narration: one clip "voice <id>" per locked section at its start, pre-mastered by ffmpeg into
     work/concat_stems/ (gain to -16 LUFS, then a -2 dBFS limiter) so the mix never clips: Concat has no
     master limiter, a plain clip gain clipped the export (Video 61: 160 samples at full scale), and it passes
     clip audio through unchanged. Loudness to the series' level is done after the export by concat_master.py:
     per-section loudnorm reached only -16 to -17 LUFS and a voice limiter to -14.5 LUFS needed ~10 dB of peak
     cut (Video 61 trials).
  T3 music: the music bed, fade in 1 s / out 3 s, one constant volume so it sits ~12 dB under the speech
     (CLAUDE.md, Audio mix). No ducking keyframes: Concat replaces a key that lies within ~0.2 % of the clip
     length of another (on a 229 s clip keys 0.3 s apart merge, 0.5 s apart stay), so ramps around the 0.6 s
     section gaps collapse; with gaps that short a constant level measures the same.
The project is saved in projects/<slug>/concat/<slug>/ (or --project-dir DIR/<slug>; open it in the Concat window
to edit), exported to work/concat_export.mp4, and mastered by concat_master.py into
renders/<slug>-concat-<YYYYMMDD-HHMM>.mp4, the release copy (user decision 2026-10-27). Check that file with
scripts/concat_compare.py.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from concat_master import master, release_path  # noqa: E402
from concat_mcp import ConcatMCP  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
TARGET_LUFS = -16.0  # audio_mixer full_mix default loudnorm target (build_hf.py passes no loudnorm_target)
MUSIC_DB = 13.8      # set point: whole-bed mean this far under the narration-section mean (raw files, after
                     # gain); calibrated on Video 61 (2026-10-27): music volume 0.136 measured 11.5 dB speech over
                     # gaps with build_hf.speech_vs_gap; re-check that number after every export
LIMIT_DB = -2.0      # narration stem ceiling


def ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise SystemExit("ffmpeg not on PATH")
    return exe


def lufs(path: Path) -> float:
    p = subprocess.run([ffmpeg(), "-v", "info", "-i", str(path), "-af", "ebur128", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = p.stderr[p.stderr.rfind("Summary:"):]
    return float(tail.split("I:")[1].split("LUFS")[0])


def mean_db(path: Path, t0: float, t1: float) -> float:
    p = subprocess.run([ffmpeg(), "-v", "info", "-ss", f"{t0:.2f}", "-to", f"{t1:.2f}", "-i", str(path), "-af", "volumedetect",
                        "-f", "null", "-"], capture_output=True, text=True)
    return float([l for l in p.stderr.splitlines() if "mean_volume" in l][0].split("mean_volume:")[1].split("dB")[0])


def clip_of(c: ConcatMCP, path: str, cid: str) -> dict:
    return [k for k in c.call("timeline_read", path=path)["timeline"]["clips"] if k["id"] == cid][0]


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1].startswith("-"):
        raise SystemExit(__doc__)
    slug = sys.argv[1]
    base = REPO / "projects" / slug
    ed = json.loads((base / "artifacts" / "edit_decisions.json").read_text(encoding="utf-8"))
    starts, end = ed["metadata"]["section_starts"], ed["metadata"]["end"]
    cuts = [(c["id"][2:], c["in_seconds"], c["out_seconds"]) for c in ed["cuts"]]
    wt = json.loads((base / "work" / "word_timings.json").read_text(encoding="utf-8"))
    if "--render" in sys.argv:
        render = base / sys.argv[sys.argv.index("--render") + 1]
    else:
        render = sorted((base / "renders").glob(f"{slug}-2*.mp4"), key=lambda p: p.stat().st_mtime)[-1]
    narr = {sid: base / "assets" / "audio" / f"narration_{sid}.wav" for sid in starts}
    bed = base / "assets" / "music" / "music_bed.wav"

    # Levels: one gain for every narration clip (they are gain-matched already), music from the measured bed.
    nl = lufs(base / "work" / "narration_full.wav")
    v_speech = 10 ** ((TARGET_LUFS - nl) / 20)
    sp = sum(mean_db(narr[s], 0.5, min(wt[s]["duration"] - 0.2, 6.0)) for s in starts) / len(starts)
    bg = mean_db(bed, 0.0, end)
    v_music = 10 ** ((sp + 20 * math.log10(v_speech) - MUSIC_DB - bg) / 20)
    print(f"render {render.name}; narration {nl:.1f} LUFS -> gain {v_speech:.3f}; music volume {v_music:.4f}")
    stems = base / "work" / "concat_stems"
    stems.mkdir(exist_ok=True)
    lim = 10 ** (LIMIT_DB / 20)
    for sid, f in list(narr.items()):
        out = stems / f.name
        subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", str(f), "-af",
                        f"volume={v_speech:.4f},alimiter=limit={lim:.4f}:attack=2:release=50:level=false",
                        "-c:a", "pcm_s16le", str(out)], check=True)
        narr[sid] = out
    if "--stems-only" in sys.argv:
        print("stems written to", stems)
        return

    proj_dir = Path(sys.argv[sys.argv.index("--project-dir") + 1]) if "--project-dir" in sys.argv else base / "concat"
    path = proj_dir / slug
    if path.exists():
        if "--force" not in sys.argv:
            raise SystemExit(f"{path} exists (it may hold hand edits); pass --force to rebuild it")
        shutil.rmtree(path)
    proj_dir.mkdir(exist_ok=True)
    P = str(path)
    with ConcatMCP() as c:
        c.call("project_create", location=str(proj_dir), name=slug,
               video={"width": 1080, "height": 1920, "rateNum": 30, "rateDen": 1})
        m_v = c.call("media_import", path=P, file=str(render))["createdId"]
        m_n = {s: c.call("media_import", path=P, file=str(f))["createdId"] for s, f in narr.items()}
        m_b = c.call("media_import", path=P, file=str(bed))["createdId"]

        # T1: the render, split at the scene cuts.
        v = c.call("clip_add", path=P, mediaId=m_v, trackId="T1", start=0)["createdId"]
        c.call("clip_update", path=P, clipId=v, patch={"muted": True})
        pieces = [("intro", 0.0)] + [(sid, t0) for sid, t0, _ in cuts]
        ids = [v]
        for _, t0 in pieces[1:]:
            before = {k["id"] for k in c.call("timeline_read", path=P)["timeline"]["clips"]}
            c.call("clips_split", path=P, clipIds=[ids[-1]], time=t0)
            new = [k["id"] for k in c.call("timeline_read", path=P)["timeline"]["clips"] if k["id"] not in before]
            ids.append(new[0])
        for (name, _), cid in zip(pieces, ids):
            c.call("clip_update", path=P, clipId=cid, patch={"name": f"scene {name}"})

        # T2: narration sections.
        for s, mid in m_n.items():
            cid = c.call("clip_add", path=P, mediaId=mid, trackId="T2", start=starts[s])["createdId"]
            c.call("clip_update", path=P, clipId=cid, patch={"name": f"voice {s}"})

        # T3: music bed, trimmed to the video, one constant level.
        b = c.call("clip_add", path=P, mediaId=m_b, trackId="T3", start=0)["createdId"]
        bd = clip_of(c, P, b)["duration"]
        if bd > end:
            c.call("clip_trim", path=P, clipId=b, edge="end", delta=end - bd)
        c.call("clip_update", path=P, clipId=b, patch={"name": "music bed", "fadeIn": 1.0, "fadeOut": 3.0,
                                                        "volume": round(v_music, 4)})

        c.call("project_save", path=P)
        shots = base / "work" / "concat_preview"
        shots.mkdir(exist_ok=True)
        for sid, t0, t1 in cuts:
            c.call("preview_frame", path=P, time=round((t0 + t1) / 2, 2), output=str(shots / f"{sid}.png"))
        tl = c.call("timeline_read", path=P)["timeline"]
        print(f"timeline {tl['duration']:.2f} s, {len(tl['clips'])} clips")
        if "--no-export" in sys.argv:
            return
        raw = base / "work" / "concat_export.mp4"
        t = time.time()
        st = c.export(P, str(raw), crf=16, preset="slow")
        print(f"export {st.get('state')} in {time.time() - t:.0f} s -> {raw}")
    print("mastered ->", master(raw, release_path(slug)))


if __name__ == "__main__":
    main()
