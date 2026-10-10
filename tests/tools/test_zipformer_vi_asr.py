"""zipformer_vi_asr groups BPE tokens into timed words and decodes Vietnamese speech."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from tools.analysis.zipformer_vi_asr import ZipformerViASR, words_from_tokens
from tools.base_tool import ToolStatus


def test_tokens_group_into_lower_case_words():
    # sherpa-onnx returns the BPE marker '▁' as a leading space.
    words = words_from_tokens([" HAI", " MI", " LI", " GI", "ÂY"], [0.2, 0.52, 0.68, 0.84, 0.96])
    assert [w["word"] for w in words] == ["hai", "mi", "li", "giây"]
    assert [w["start"] for w in words] == [0.2, 0.52, 0.68, 0.84]


def test_raw_bpe_marker_also_starts_a_word():
    assert [w["word"] for w in words_from_tokens(["▁HAI", "▁B", "A"], [0.0, 0.3, 0.4])] == ["hai", "ba"]


def test_word_ends_at_next_start_and_last_at_its_last_token():
    words = words_from_tokens([" CH", "ẠM", " NGÓN"], [1.0, 1.12, 1.4])
    assert words[0] == {"word": "chạm", "start": 1.0, "end": 1.4}
    assert words[1] == {"word": "ngón", "start": 1.4, "end": 1.4}


def test_leading_piece_without_marker_still_starts_a_word():
    assert [w["word"] for w in words_from_tokens(["N", " A"], [0.0, 0.1])] == ["n", "a"]


def test_no_tokens_no_words():
    assert words_from_tokens([], []) == []


def test_missing_input_fails_cleanly(tmp_path):
    r = ZipformerViASR().execute({"input_path": str(tmp_path / "none.wav")})
    assert not r.success
    assert "not found" in r.error


# A real decode needs the model (~100 MB download on first use); opt in with ZIPFORMER_SMOKE_WAV=<wav>
# and ZIPFORMER_SMOKE_TEXT=<words it must contain>.
@pytest.mark.skipif(not os.environ.get("ZIPFORMER_SMOKE_WAV"), reason="set ZIPFORMER_SMOKE_WAV to run")
def test_real_decode(tmp_path):
    tool = ZipformerViASR()
    assert tool.get_status() == ToolStatus.AVAILABLE
    out = tmp_path / "t.json"
    r = tool.execute({"input_path": os.environ["ZIPFORMER_SMOKE_WAV"], "output_path": str(out)})
    assert r.success, r.error
    assert os.environ.get("ZIPFORMER_SMOKE_TEXT", "") in r.data["text"]
    words = r.data["word_timestamps"]
    # One entry per spoken word, timed within the file: a narration section runs ~2-5 words/s.
    assert len(words) == len(r.data["text"].split())
    assert 1.5 < len(words) / r.data["duration_seconds"] < 6
    assert all(0 <= w["start"] <= w["end"] <= r.data["duration_seconds"] for w in words)
    assert out.exists()
    assert Path(r.artifacts[0]) == out
