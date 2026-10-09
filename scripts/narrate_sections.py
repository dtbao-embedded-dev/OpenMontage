"""Generate and verify Vietnamese narration one section at a time.

Each script section is synthesised with `vieneu_tts`, transcribed with
faster-whisper large-v3 and aligned word by word with the script. An attempt
passes when at least --min-score (default 85 %) of the checked script words
are heard; the words it missed are still printed, for the user to judge while
listening to the full narration. A section that passes is adopted; one that
fails is regenerated on its own, up to --tries attempts. The tool already sends
every section as its own request, so sections from different attempts are as
consistent as the sections of one take. Once every section passes:

  1. adopted sections are gain-matched to their median loudness (true peak kept
     at or below -1 dBFS) and written to assets/audio/narration_<id>.wav;
  2. a section whose speech rate is more than 15 % off the median is flagged
     (reported, never changed);
  3. the adopted sections are joined into work/narration_full.wav, and the whole
     file is transcribed with large-v3 and checked against the full script with
     the same --min-score;
  4. every word the adopted sections missed is listed once more, to listen for.

Build the scene plan and the video only after this exits 0.

    python scripts/narrate_sections.py <slug> [--tries 4] [--min-score 0.85] [--redo s2 s5] [--ignore giây vôn]

Reads projects/<slug>/artifacts/script.json (section id and text: the reference
for the check) and projects/<slug>/work/tts_text.json (id -> the lower-case text
sent to the voice server). Attempts are kept as assets/audio/takes/<id>/try<k>.wav;
a rerun rescores the attempts already on disk before generating new ones, so
adding --ignore words never costs a regeneration. --redo renames the attempts of
those sections to try<k>.rejected.wav and starts them over.

The automatic check covers words with Vietnamese diacritics. All-ASCII words
(English terms, and Vietnamese words without marks) and number words are left
out because whisper spells them freely: read the HEARD text printed for every
section for terms whose meaning changes when misread ("board" -> "bot"). The
voice speaks Northern Vietnamese, where the initials ch/tr, d/gi/r and s/x sound
alike, so a word heard with the other spelling ("trục" for "chục") still counts.

Exit status: 0 every check reached --min-score, 1 a section or the full listen-back did not,
2 setup error (missing input, no ffmpeg, voice server not ready).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import statistics
import subprocess
import sys
import unicodedata
import wave
from difflib import SequenceMatcher
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from tools.analysis.transcriber import Transcriber  # noqa: E402
from tools.audio.vieneu_tts import VieneuTTS  # noqa: E402

VOICE = "Hải Đăng"
# Whisper writes number words as digits, and hears "lặp" as "lập" on every take.
IGNORE = {
    "không", "một", "mốt", "hai", "ba", "bốn", "tư", "năm", "lăm", "sáu", "bảy", "tám",
    "chín", "mười", "mươi", "linh", "lẻ", "trăm", "nghìn", "ngàn", "triệu", "phẩy", "nửa",
    "lặp",
}
PEAK_CEILING_DB = -1.0
RATE_TOLERANCE = 0.15
# Share of checked script words an attempt must be heard saying (user decision 2026-10-10:
# below it the attempt is retaken; the misses above it are the user's call on the full listen).
MIN_SCORE = 0.85


class SetupError(Exception):
    pass


def tokens(text: str, ignore: set[str]) -> list[str]:
    # Ignoring a word ignores every spelling that sounds the same ("giây" also drops "dây").
    skip = {fold(w) for w in ignore}
    return [w for w in re.findall(r"[^\W\d_]+", unicodedata.normalize("NFC", text).lower())
            if not re.fullmatch(r"[a-z]+", w) and fold(w) not in skip]


def fold(word: str) -> str:
    """One spelling for initials that sound alike in Northern Vietnamese: ch/tr, d/gi/r, s/x."""
    w = unicodedata.normalize("NFD", word)
    if w.startswith("tr"):
        return "ch" + w[2:]
    if w.startswith("x"):
        return "s" + w[1:]
    if w.startswith("gi"):
        # "gi" is the consonant when a vowel follows ("giây"); in "gì" the i is the vowel.
        return "z" + (w[2:] if w[2:3] in {"a", "e", "i", "o", "u", "y"} else w[1:])
    if w.startswith(("d", "r")):
        return "z" + w[1:]
    return w


def compare(expected: str, heard: str, ignore: set[str]) -> tuple[list[dict], list[str]]:
    """Script words the audio is missing or replaced, and words the audio added."""
    exp, got = tokens(expected, ignore), tokens(heard, ignore)
    misses, extras = [], []
    matcher = SequenceMatcher(None, [fold(w) for w in exp], [fold(w) for w in got], autojunk=False)
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op in ("replace", "delete"):
            misses.append({"expected": " ".join(exp[i1:i2]), "heard": " ".join(got[j1:j2]),
                           "context": " ".join(exp[max(0, i1 - 3):i2 + 3])})
        elif op == "insert":
            extras.append(" ".join(got[j1:j2]))
    return misses, extras


def transcribe(wav: Path, out_dir: Path) -> dict:
    cached = out_dir / f"{wav.stem}_transcript.json"
    if cached.exists() and cached.stat().st_mtime >= wav.stat().st_mtime:
        return json.loads(cached.read_text(encoding="utf-8"))
    r = Transcriber().execute({"input_path": str(wav), "model_size": "large-v3",
                               "language": "vi", "output_dir": str(out_dir)})
    if not r.success:
        raise SetupError(f"transcription failed for {wav}: {r.error}")
    return r.data


def score(wav: Path, expected: str, out_dir: Path, ignore: set[str], min_score: float) -> dict:
    t = transcribe(wav, out_dir)
    heard = " ".join(s["text"].strip() for s in t["segments"])
    misses, extras = compare(expected, heard, ignore)
    checked = len(tokens(expected, ignore))
    missed = sum(len(m["expected"].split()) for m in misses)
    match = 1 - missed / checked if checked else 1.0
    words = t.get("word_timestamps") or []
    span = words[-1]["end"] - words[0]["start"] if words else 0.0
    return {"try": wav.stem, "passed": match >= min_score - 1e-9, "match": round(match, 3),
            "misses": misses, "extras": extras,
            "heard": heard, "rate": round(len(words) / span, 2) if span > 0 else None}


def loudness(ffmpeg: str, wav: Path) -> tuple[float, float]:
    """Integrated loudness (LUFS) and true peak (dBFS) from ffmpeg's ebur128 summary."""
    err = subprocess.run([ffmpeg, "-hide_banner", "-nostats", "-i", str(wav),
                          "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    peak = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", err)
    if not lufs or not peak:
        raise SetupError(f"could not measure loudness of {wav}")
    return float(lufs[-1]), float(peak[-1])


def attempts(sec_dir: Path) -> tuple[list[Path], int]:
    """Live attempts in order, and the next free attempt number (rejected ones count)."""
    def num(p: Path) -> int:
        return int(re.match(r"try(\d+)", p.name).group(1))
    live = sorted(sec_dir.glob("try*[0-9].wav"), key=num)
    every = list(sec_dir.glob("try*.wav"))
    return live, max((num(p) for p in every), default=0) + 1


def narrate_section(sid: str, text: str, tts_text: str, base: Path, args, ignore: set[str]) -> dict:
    sec_dir = base / "assets" / "audio" / "takes" / sid
    sec_dir.mkdir(parents=True, exist_ok=True)
    out_dir = base / "work" / "transcripts_large" / sid
    if sid in args.redo:
        for p in sec_dir.glob("try*[0-9].wav"):
            p.rename(p.with_name(f"{p.stem}.rejected.wav"))
    live, next_k = attempts(sec_dir)
    results = []
    for wav in live:
        results.append(score(wav, text, out_dir, ignore, args.min_score))
        if results[-1]["passed"]:
            break
    while not (results and results[-1]["passed"]) and len(results) < args.tries:
        wav = sec_dir / f"try{next_k}.wav"
        next_k += 1
        r = VieneuTTS().execute({"voice": VOICE, "speed": 1.0,
                                 "segments": [{"text": tts_text, "output_path": str(wav)}]})
        if not r.success:
            raise SetupError(f"TTS failed for {sid}: {r.error}")
        results.append(score(wav, text, out_dir, ignore, args.min_score))
    for r in results:
        state = "PASS" if r["passed"] else "fail"
        print(f"{sid} {r['try']}: {state}  match {r['match']:.1%}  rate {r['rate']} w/s")
        for m in r["misses"]:
            print(f"   missing '{m['expected']}' heard '{m['heard']}'  ({m['context']})")
        if r["extras"]:
            print(f"   extra words heard: {r['extras']}")
    adopted = next((r for r in results if r["passed"]), None)
    section = {"id": sid, "adopted": adopted["try"] if adopted else None,
               "rate": adopted["rate"] if adopted else None,
               "to_listen": adopted["misses"] if adopted else [], "attempts": results}
    if adopted:
        print(f"{sid} HEARD: {adopted['heard']}")
    else:
        # A word missed by every attempt is a habit of the voice, not bad luck.
        always = set.intersection(*(set(m["expected"] for m in r["misses"]) for r in results))
        section["missed_every_time"] = sorted(always)
        print(f"{sid}: no attempt passed in {len(results)}; missed every time: {sorted(always)}")
    return section


def adopt(sections: list[dict], base: Path, ffmpeg: str) -> None:
    """Gain-match the adopted attempts to their median loudness and flag speech-rate outliers."""
    takes = base / "assets" / "audio" / "takes"
    for s in sections:
        s["lufs"], s["peak_dbfs"] = loudness(ffmpeg, takes / s["id"] / f"{s['adopted']}.wav")
    target = statistics.median(s["lufs"] for s in sections)
    rates = [s["rate"] for s in sections if s["rate"]]
    median_rate = statistics.median(rates) if rates else None
    for s in sections:
        src = takes / s["id"] / f"{s['adopted']}.wav"
        dst = base / "assets" / "audio" / f"narration_{s['id']}.wav"
        gain = min(target - s["lufs"], PEAK_CEILING_DB - s["peak_dbfs"])
        s["gain_db"] = round(gain, 2) if abs(gain) >= 0.5 else 0.0
        if s["gain_db"]:
            subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
                            "-af", f"volume={s['gain_db']}dB", "-c:a", "pcm_s16le", str(dst)], check=True)
        else:
            shutil.copy2(src, dst)
        s["rate_off"] = bool(s["rate"] and median_rate and abs(s["rate"] / median_rate - 1) > RATE_TOLERANCE)
        flag = "  RATE OFF MEDIAN" if s["rate_off"] else ""
        print(f"{s['id']} <- {s['adopted']}: {s['lufs']} LUFS, gain {s['gain_db']:+} dB, rate {s['rate']} w/s{flag}")


def join(sections: list[dict], base: Path, gap: float) -> Path:
    full = base / "work" / "narration_full.wav"
    params = None
    with wave.open(str(full), "wb") as out:
        for i, s in enumerate(sections):
            with wave.open(str(base / "assets" / "audio" / f"narration_{s['id']}.wav"), "rb") as w:
                p = (w.getnchannels(), w.getsampwidth(), w.getframerate())
                if params is None:
                    params = p
                    out.setnchannels(p[0])
                    out.setsampwidth(p[1])
                    out.setframerate(p[2])
                elif p != params:
                    raise SetupError(f"narration_{s['id']}.wav format {p} differs from {params}")
                if i:
                    out.writeframes(b"\x00" * int(gap * p[2]) * p[0] * p[1])
                out.writeframes(w.readframes(w.getnframes()))
    return full


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("slug", help="project folder under projects/")
    ap.add_argument("--tries", type=int, default=4, help="attempts per section before giving up (default 4)")
    ap.add_argument("--min-score", type=float, default=MIN_SCORE, metavar="RATIO",
                    help=f"share of checked script words an attempt must be heard saying (default {MIN_SCORE})")
    ap.add_argument("--redo", nargs="+", default=[], metavar="ID", help="section ids to start over")
    ap.add_argument("--ignore", nargs="+", default=[], metavar="WORD",
                    help="extra words whisper writes differently on every take (units such as giây, vôn)")
    ap.add_argument("--gap", type=float, default=0.5, help="silence between sections in the joined file (s)")
    args = ap.parse_args()

    base = REPO_ROOT / "projects" / args.slug
    ignore = IGNORE | {w.lower() for w in args.ignore}
    try:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise SetupError("ffmpeg not found on PATH")
        script = json.loads((base / "artifacts" / "script.json").read_text(encoding="utf-8"))
        tts = json.loads((base / "work" / "tts_text.json").read_text(encoding="utf-8"))
        if args.tries < 1:
            raise SetupError("--tries must be at least 1")
        if not 0 < args.min_score <= 1:
            raise SetupError("--min-score must be in (0, 1]")
        missing = [s["id"] for s in script["sections"] if s["id"] not in tts]
        if missing:
            raise SetupError(f"tts_text.json has no text for {missing}")
        unknown = set(args.redo) - {s["id"] for s in script["sections"]}
        if unknown:
            raise SetupError(f"--redo names sections not in the script: {sorted(unknown)}")

        sections = [narrate_section(s["id"], s["text"], tts[s["id"]], base, args, ignore)
                    for s in script["sections"]]
        report = {"sections": sections, "full": None, "passed": False}
        if all(s["adopted"] for s in sections):
            adopt(sections, base, ffmpeg)
            full = join(sections, base, args.gap)
            expected = " ".join(s["text"] for s in script["sections"])
            res = score(full, expected, base / "work" / "transcripts_large", ignore, args.min_score)
            report["full"] = res
            report["passed"] = res["passed"]
            print(f"full listen-back ({full.name}): {'PASS' if res['passed'] else 'FAIL'}  match {res['match']:.1%}")
            for m in res["misses"]:
                print(f"   missing '{m['expected']}' heard '{m['heard']}'  ({m['context']})")
            print("words to listen for in the full narration (the user decides):")
            for s in sections:
                for m in s["to_listen"]:
                    print(f"   {s['id']} {s['adopted']}: '{m['expected']}' heard '{m['heard']}'  ({m['context']})")
        (base / "work" / "narration_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    except (SetupError, OSError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError) as e:
        print(f"setup error: {e}", file=sys.stderr)
        return 2
    print("PASSED" if report["passed"] else "FAILED", "- report in work/narration_report.json")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
