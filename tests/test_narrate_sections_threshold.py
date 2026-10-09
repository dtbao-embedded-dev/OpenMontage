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
