"""narrate_sections passes a take on its word-match ratio, not on zero misses."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "narrate_sections.py"


@pytest.fixture()
def ns(monkeypatch):
    spec = importlib.util.spec_from_file_location("narrate_sections", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _hear(ns, monkeypatch, heard: str) -> None:
    monkeypatch.setattr(ns, "transcribe", lambda wav, out_dir: {"segments": [{"text": heard}],
                                                                "word_timestamps": []})


# 20 checked words: all carry a diacritic except "cho", which the check skips as ASCII.
EXPECTED = ("chúng tôi đã thấy những chiếc đèn sáng rõ trên bàn, rồi chúng tôi "
            "chỉnh lại từng chiếc đèn cho đẹp")


def test_one_miss_in_twenty_passes(ns, monkeypatch, tmp_path):
    _hear(ns, monkeypatch, EXPECTED.replace("chỉnh", "trình"))
    assert len(ns.tokens(EXPECTED, set())) == 20
    r = ns.score(tmp_path / "try1.wav", EXPECTED, tmp_path, set(), 0.85)
    assert r["match"] == 0.95
    assert r["passed"]
    assert [m["expected"] for m in r["misses"]] == ["chỉnh"]


def test_below_threshold_fails(ns, monkeypatch, tmp_path):
    heard = EXPECTED.replace("chỉnh", "trình").replace("đẹp", "đẻ").replace("bàn", "bần")
    heard = heard.replace("thấy", "thầy")
    _hear(ns, monkeypatch, heard)
    r = ns.score(tmp_path / "try1.wav", EXPECTED, tmp_path, set(), 0.85)
    assert r["match"] == 0.8
    assert not r["passed"]


def test_threshold_is_inclusive(ns, monkeypatch, tmp_path):
    heard = EXPECTED.replace("chỉnh", "trình").replace("đẹp", "đẻ").replace("bàn", "bần")
    _hear(ns, monkeypatch, heard)
    r = ns.score(tmp_path / "try1.wav", EXPECTED, tmp_path, set(), 0.85)
    assert r["match"] == 0.85
    assert r["passed"]


def test_nothing_checkable_passes(ns, monkeypatch, tmp_path):
    _hear(ns, monkeypatch, "board ESP32")
    r = ns.score(tmp_path / "try1.wav", "board ESP32 GPIO", tmp_path, set(), 0.85)
    assert r["match"] == 1.0
    assert r["passed"]


def test_default_threshold_is_85_percent(ns):
    assert ns.MIN_SCORE == 0.85


def test_number_words_are_checked(ns, monkeypatch, tmp_path):
    # The recogniser writes numbers as words, so a wrong number is a miss.
    _hear(ns, monkeypatch, "mười tám chân có sẵn")
    r = ns.score(tmp_path / "try1.wav", "mười bảy chân có sẵn", tmp_path, ns.IGNORE, 0.85)
    assert [m["expected"] for m in r["misses"]] == ["bảy"]


def test_unit_words_are_ignored(ns, monkeypatch, tmp_path):
    # "vôn" comes out as "vun"/"vol" and "mê héc" is dropped: neither counts as a miss.
    _hear(ns, monkeypatch, "hai trăm hai mươi vun tốc độ bốn mươi")
    r = ns.score(tmp_path / "try1.wav", "hai trăm hai mươi vôn, tốc độ bốn mươi mê héc",
                 tmp_path, ns.IGNORE, 0.85)
    assert r["misses"] == []
    assert r["match"] == 1.0


def test_word_timings_come_from_the_locked_files(ns, monkeypatch, tmp_path):
    import json
    import wave

    audio = tmp_path / "assets" / "audio"
    audio.mkdir(parents=True)
    (tmp_path / "work").mkdir()
    with wave.open(str(audio / "narration_s1.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes(b"\x00\x00" * 48000 * 2)
    heard = []
    monkeypatch.setattr(ns, "transcribe", lambda wav, out_dir: heard.append(wav.name) or {
        "segments": [{"text": "chạm ngón"}],
        "word_timestamps": [{"word": "chạm", "start": 0.123, "end": 0.456}, {"word": "ngón", "start": 0.456, "end": 0.9}]})
    out = ns.write_timings([{"id": "s1", "adopted": "try2"}], tmp_path)
    assert heard == ["narration_s1.wav"]
    assert json.loads(out.read_text(encoding="utf-8")) == {
        "s1": {"duration": 2.0, "words": [{"word": "chạm", "start": 0.12, "end": 0.46},
                                           {"word": "ngón", "start": 0.46, "end": 0.9}]}}
    assert not (tmp_path / "work" / "word_timings_whisper.json").exists()


def test_whisper_timings_are_kept_aside_once(ns, monkeypatch, tmp_path):
    import wave

    audio = tmp_path / "assets" / "audio"
    audio.mkdir(parents=True)
    work = tmp_path / "work"
    work.mkdir()
    with wave.open(str(audio / "narration_s1.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes(b"\x00\x00" * 4800)
    monkeypatch.setattr(ns, "transcribe", lambda wav, out_dir: {"segments": [], "word_timestamps": []})
    (work / "word_timings.json").write_text('{"s1": "from align.py"}', encoding="utf-8")
    ns.write_timings([{"id": "s1"}], tmp_path)
    assert (work / "word_timings_whisper.json").read_text(encoding="utf-8") == '{"s1": "from align.py"}'
    # A report from this script marks the file as its own: the next run does not back it up again.
    (work / "word_timings_whisper.json").unlink()
    (work / "narration_report.json").write_text('{"timings": "work/word_timings.json"}', encoding="utf-8")
    ns.write_timings([{"id": "s1"}], tmp_path)
    assert not (work / "word_timings_whisper.json").exists()


def test_listen_checks_media_against_the_whole_script(ns, monkeypatch, tmp_path):
    base = tmp_path / "projects" / "demo"
    (base / "artifacts").mkdir(parents=True)
    (base / "work").mkdir()
    (base / "artifacts" / "script.json").write_text(
        '{"sections": [{"id": "s1", "text": "chạm ngón tay"}, {"id": "s2", "text": "nhận ra ngay"}]}',
        encoding="utf-8")
    render = tmp_path / "render.mp4"
    render.write_bytes(b"")
    _hear(ns, monkeypatch, "chạm ngón tay nhận ra ngay")
    monkeypatch.setattr(ns, "REPO_ROOT", tmp_path)
    monkeypatch.setattr("sys.argv", ["narrate_sections.py", "demo", "--listen", str(render)])
    assert ns.main() == 0
    assert (base / "work" / "listen_report.json").exists()
    assert not (base / "work" / "narration_report.json").exists()
