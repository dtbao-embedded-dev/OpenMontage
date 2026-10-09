"""VieNeu-TTS Vietnamese text-to-speech via the homelab voice-tts server.

Synthesis runs only on the homelab server (E:/Baotd/software/apps/voice-tts — FastAPI
around VieNeu-TTS v3 Turbo, https://github.com/pnnbao97/VieNeu-TTS, Apache-2.0). Nothing
runs on this machine. Configure:

    VOICE_TTS_SERVER=http://<host>:8760
    VOICE_TTS_TOKEN=<token>          # from ~/voice-tts/.env on the server
"""

from __future__ import annotations

import os
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

DEFAULT_VOICE = "Hải Đăng"
SAMPLE_RATE = 48000


def _server() -> str:
    return os.environ.get("VOICE_TTS_SERVER", "").rstrip("/")


def _token() -> str:
    return os.environ.get("VOICE_TTS_TOKEN", "")


class VieneuTTS(BaseTool):
    name = "vieneu_tts"
    version = "0.2.0"
    tier = ToolTier.VOICE
    capability = "tts"
    provider = "vieneu"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = ["env:VOICE_TTS_SERVER", "env:VOICE_TTS_TOKEN", "python:requests"]
    install_instructions = (
        "Point this tool at the homelab voice-tts server:\n"
        "  VOICE_TTS_SERVER=http://<host>:8760\n"
        "  VOICE_TTS_TOKEN=<token from ~/voice-tts/.env on the server>\n"
        "Server install: python docs/scripts/tool-install.py --remote user@host "
        "(in software/apps/voice-tts)."
    )
    agent_skills = ["text-to-speech"]

    capabilities = [
        "text_to_speech",
    ]
    supports = {
        "voice_cloning": False,
        "multilingual": False,
        "offline": False,
        "native_audio": True,
    }
    best_for = [
        "natural Vietnamese narration, free, on the homelab server",
        "Vietnamese text mixed with English technical terms",
    ]
    not_good_for = [
        "non-Vietnamese narration",
        "work when the homelab server is unreachable",
    ]

    input_schema = {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "voice": {
                "type": "string",
                "default": DEFAULT_VOICE,
                "description": "Preset voice name, e.g. 'Hải Đăng', 'Mai Anh', 'Thiện Minh' (GET /api/voices)",
            },
            "speed": {
                "type": "number",
                "default": 1.0,
                "description": "Time-stretch factor (0.75-1.5); pitch unchanged",
            },
            "pronunciation": {
                "type": "string",
                "enum": ["special", "normal"],
                "default": "special",
                "description": "'special' respells words the engine garbles (board, AP, POST, ESP32) via the "
                               "server lexicon (voice-tts >= 0.7.0); 'normal' reads the text as typed",
            },
            "output_path": {"type": "string"},
            "segments": {
                "type": "array",
                "description": "Batch: [{text, output_path, voice?, speed?}]",
                "items": {
                    "type": "object",
                    "required": ["text", "output_path"],
                },
            },
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=128, vram_mb=0, disk_mb=50, network_required=True
    )
    retry_policy = RetryPolicy(max_retries=1, retryable_errors=["ConnectionError", "Timeout"])
    idempotency_key_fields = ["text", "voice", "speed", "pronunciation", "segments"]
    side_effects = ["writes audio file(s) to output_path", "calls the homelab voice-tts server"]
    user_visible_verification = ["Listen to generated audio for pronunciation"]

    def get_status(self) -> ToolStatus:
        if not (_server() and _token()):
            return ToolStatus.UNAVAILABLE
        try:
            import requests  # noqa: F401
        except ImportError:
            return ToolStatus.UNAVAILABLE
        return ToolStatus.AVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(success=False, error="VieNeu-TTS server not configured. " + self.install_instructions)

        start = time.time()
        try:
            result = self._generate(inputs)
        except Exception as exc:
            return ToolResult(success=False, error=f"VieNeu-TTS server request failed ({_server()}): {exc}")

        result.duration_seconds = round(time.time() - start, 2)
        return result

    def _generate(self, inputs: dict[str, Any]) -> ToolResult:
        import requests

        voice = inputs.get("voice", DEFAULT_VOICE)
        speed = inputs.get("speed", 1.0)
        pronunciation = inputs.get("pronunciation", "special")
        segments = inputs.get("segments") or [{
            "text": inputs["text"],
            "output_path": inputs.get("output_path", "tts_output.wav"),
        }]
        headers = {"Authorization": f"Bearer {_token()}"}

        status = requests.get(f"{_server()}/api/status", headers=headers, timeout=10)
        status.raise_for_status()
        if status.json().get("state") != "ready":
            return ToolResult(success=False, error=f"VieNeu-TTS server not ready: {status.text}")

        outputs = []
        for seg in segments:
            out = Path(seg["output_path"]).resolve()
            out.parent.mkdir(parents=True, exist_ok=True)
            # "wav" returns one 16-bit file; the default "f32" is a raw float stream.
            body = {"text": seg["text"], "voice": seg.get("voice", voice),
                    "speed": seg.get("speed", speed), "format": "wav", "pronunciation": pronunciation}
            resp = requests.post(f"{_server()}/api/tts/stream", json=body, headers=headers, timeout=600)
            if resp.status_code != 200:
                return ToolResult(success=False, error=f"VieNeu-TTS server HTTP {resp.status_code}: {resp.text[:500]}")
            out.write_bytes(resp.content)
            outputs.append(str(out))

        return ToolResult(
            success=True,
            data={
                "provider": self.provider,
                "server": _server(),
                "voice": voice,
                "output": outputs[0],
                "outputs": outputs,
                "format": "wav",
                "sample_rate": SAMPLE_RATE,
            },
            artifacts=outputs,
            model="VieNeu-TTS-v3-Turbo (homelab voice-tts)",
        )
