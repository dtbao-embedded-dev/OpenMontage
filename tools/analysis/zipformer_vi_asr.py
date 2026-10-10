"""Vietnamese speech-to-text with Zipformer-30M-RNNT-6000h through sherpa-onnx.

A 30M-parameter transducer trained on ~6000 h of Vietnamese
(https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h). It runs on the CPU at
about 100x real time, so a three-minute narration or render decodes in one pass
in a few seconds. Output is lower-case spoken form: numbers and units come out
as words ("hai mi li giây", "hai trăm hai mươi vôn"), English terms as the
syllables the model heard ("i sp ba hai" for ESP32). Meant for checking that
synthesised narration says the script, not for subtitles.

The model is licensed CC BY-NC-ND 4.0 (non-commercial, no derivatives).
Files are fetched once into the Hugging Face cache.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    RetryPolicy,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)

DEFAULT_MODEL = "hynt/Zipformer-30M-RNNT-6000h"
SAMPLE_RATE = 16000
# Decoding settings of the model author's own demo (huggingface.co/spaces/hynt/k2-automatic-speech-recognition-demo).
BLANK_PENALTY = 0.25
FEATURE_DIM = 80

# One recogniser per (model, threads) per process: loading takes ~1 s, decoding a section ~0.2 s.
_recognizers: dict[tuple[str, int], Any] = {}


def _model_file(folder: Path, prefix: str) -> str:
    found = sorted(p for p in folder.glob(f"{prefix}-*.onnx") if ".int8." not in p.name)
    if not found:
        raise FileNotFoundError(f"no {prefix}-*.onnx in {folder}")
    return str(found[0])


def _recognizer(model: str, threads: int):
    key = (model, threads)
    if key not in _recognizers:
        import sherpa_onnx
        from huggingface_hub import snapshot_download

        patterns = ["*.onnx", "tokens.txt", "config.json"]
        try:
            # Offline once cached: no request to huggingface.co on every run.
            folder = Path(snapshot_download(model, allow_patterns=patterns, local_files_only=True))
        except Exception:
            folder = Path(snapshot_download(model, allow_patterns=patterns))
        # This model ships its token table as config.json; sherpa-onnx models name it tokens.txt.
        tokens = folder / "tokens.txt" if (folder / "tokens.txt").exists() else folder / "config.json"
        _recognizers[key] = sherpa_onnx.OfflineRecognizer.from_transducer(
            tokens=str(tokens),
            encoder=_model_file(folder, "encoder"),
            decoder=_model_file(folder, "decoder"),
            joiner=_model_file(folder, "joiner"),
            num_threads=threads,
            sample_rate=SAMPLE_RATE,
            feature_dim=FEATURE_DIM,
            blank_penalty=BLANK_PENALTY,
            decoding_method="greedy_search",
        )
    return _recognizers[key]


def words_from_tokens(tokens: list[str], times: list[float]) -> list[dict]:
    """Group BPE tokens into words; a token starting with a space (sherpa-onnx's rendering
    of the BPE marker '▁') starts a word.

    The model gives each token the time it was emitted, not where a word ends, so a
    word's end is the next word's start and the last word ends at its last token.
    """
    words: list[dict] = []
    for tok, t in zip(tokens, times):
        piece = tok.lower()
        if piece.startswith((" ", "▁")) or not words:
            words.append({"word": piece.lstrip(" ▁"), "start": round(t, 3), "last": t})
        else:
            words[-1]["word"] += piece
            words[-1]["last"] = t
    for i, w in enumerate(words):
        last = w.pop("last")
        w["end"] = words[i + 1]["start"] if i + 1 < len(words) else round(last, 3)
    return [w for w in words if w["word"]]


class ZipformerViASR(BaseTool):
    name = "zipformer_vi_asr"
    version = "0.1.0"
    tier = ToolTier.CORE
    capability = "analysis"
    provider = "sherpa-onnx"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL

    dependencies = ["python:sherpa_onnx", "python:numpy", "python:huggingface_hub", "binary:ffmpeg"]
    install_instructions = (
        "pip install sherpa-onnx  # model files download on first use (~100 MB)\n"
        "ffmpeg must be on PATH (decodes any audio/video input to 16 kHz mono)."
    )

    capabilities = ["transcribe", "word_timestamps"]
    supports = {"offline": True, "languages": ["vi"]}
    best_for = [
        "checking that Vietnamese TTS narration says the script, fast on CPU",
        "listen-back of a full render (music under the voice is fine)",
    ]
    not_good_for = [
        "English terms (heard as Vietnamese syllables)",
        "subtitles (no punctuation or casing)",
        "commercial use of the model itself (CC BY-NC-ND 4.0)",
    ]

    input_schema = {
        "type": "object",
        "required": ["input_path"],
        "properties": {
            "input_path": {"type": "string", "description": "Audio or video file (anything ffmpeg reads)"},
            "model": {"type": "string", "default": DEFAULT_MODEL,
                      "description": "Hugging Face repo of a sherpa-onnx offline transducer"},
            "num_threads": {"type": "integer", "default": 4},
            "output_path": {"type": "string", "description": "Optional JSON file for the transcript"},
        },
    }

    output_schema = {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "segments": {"type": "array"},
            "word_timestamps": {"type": "array"},
            "duration_seconds": {"type": "number"},
            "model": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(cpu_cores=4, ram_mb=1024, vram_mb=0, disk_mb=150, network_required=False)
    retry_policy = RetryPolicy(max_retries=0)
    idempotency_key_fields = ["input_path", "model"]
    side_effects = ["writes transcript JSON to output_path when given",
                    "downloads the model into the Hugging Face cache on first use"]
    user_visible_verification = ["Listen to the audio where the transcript differs from the script"]

    def get_status(self) -> ToolStatus:
        try:
            self.check_dependencies()
        except Exception:
            return ToolStatus.UNAVAILABLE
        return ToolStatus.AVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        input_path = Path(inputs["input_path"])
        if not input_path.exists():
            return ToolResult(success=False, error=f"Input file not found: {input_path}")
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(success=False, error="zipformer_vi_asr unavailable. " + self.install_instructions)
        model = inputs.get("model", DEFAULT_MODEL)
        start = time.time()
        try:
            import numpy as np

            pcm = subprocess.run(
                [shutil.which("ffmpeg"), "-v", "error", "-i", str(input_path),
                 "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"],
                capture_output=True, check=True,
            ).stdout
            samples = np.frombuffer(pcm, dtype=np.float32)
            recognizer = _recognizer(model, int(inputs.get("num_threads", 4)))
            stream = recognizer.create_stream()
            stream.accept_waveform(SAMPLE_RATE, samples)
            recognizer.decode_stream(stream)
            result = stream.result
        except subprocess.CalledProcessError as e:
            return ToolResult(success=False, error=f"ffmpeg could not decode {input_path}: {e.stderr.decode(errors='replace')}")
        except Exception as e:
            return ToolResult(success=False, error=f"{type(e).__name__}: {e}")

        words = words_from_tokens(list(result.tokens), list(result.timestamps))
        text = " ".join(w["word"] for w in words)
        duration = len(samples) / SAMPLE_RATE
        data = {
            "text": text,
            "segments": [{"id": 0, "start": 0.0, "end": round(duration, 3), "text": text}],
            "word_timestamps": words,
            "duration_seconds": round(duration, 3),
            "model": model,
        }
        artifacts = []
        if inputs.get("output_path"):
            out = Path(inputs["output_path"])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            artifacts.append(str(out))
        return ToolResult(success=True, data=data, artifacts=artifacts, duration_seconds=round(time.time() - start, 2))
