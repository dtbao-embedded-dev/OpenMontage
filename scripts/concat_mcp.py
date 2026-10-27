"""Minimal client for Concat's MCP server (https://github.com/jub0t/Concat), run headless over stdio.

Concat is a local timeline editor. OpenMontage hands it the finished pieces of a video (scene clips,
narration sections, music) so the user can open the project in the Concat window, adjust it by hand
and export again without a full HyperFrames/Remotion re-render.

    with ConcatMCP() as c:
        c.call("project_create", location=..., name=..., video={...})

Every tool result is returned as parsed JSON (the server answers with one text block of JSON).
A tool error raises ConcatError. Files are written only under CONCAT_MCP_ROOTS
(default here: E:\\Baotd\\media).
"""
from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
from pathlib import Path

DEFAULT_EXE = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Concat" / "concat.exe"
DEFAULT_ROOTS = r"E:\Baotd\media"


class ConcatError(RuntimeError):
    pass


class ConcatMCP:
    def __init__(self, exe: str | Path | None = None, roots: str | None = None, timeout: float = 900.0):
        self.exe = Path(exe or os.environ.get("CONCAT_EXE") or DEFAULT_EXE)
        if not self.exe.is_file():
            raise ConcatError(f"concat.exe not found at {self.exe}")
        env = dict(os.environ, CONCAT_MCP_ROOTS=roots or os.environ.get("CONCAT_MCP_ROOTS") or DEFAULT_ROOTS)
        self.timeout = timeout
        self._p = subprocess.Popen([str(self.exe), "--mcp", "headless"], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
        self._q: queue.Queue = queue.Queue()
        threading.Thread(target=self._pump, daemon=True).start()
        self._id = 0
        self.server = self._rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                               "clientInfo": {"name": "openmontage", "version": "1"}})["result"]
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _pump(self) -> None:
        for line in self._p.stdout:
            self._q.put(line)
        self._q.put(None)

    def _send(self, msg: dict) -> None:
        self._p.stdin.write((json.dumps(msg) + "\n").encode("utf-8"))
        self._p.stdin.flush()

    def _rpc(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        msg = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            msg["params"] = params
        self._send(msg)
        while True:
            line = self._q.get(timeout=self.timeout)
            if line is None:
                raise ConcatError(f"concat exited during {method}")
            r = json.loads(line)
            if r.get("id") == self._id:
                return r

    def call(self, tool: str, **args):
        r = self._rpc("tools/call", {"name": tool, "arguments": args})
        res = r.get("result") or {}
        txt = "".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")
        if r.get("error") or res.get("isError"):
            raise ConcatError(f"{tool}: {r.get('error') or txt}")
        try:
            return json.loads(txt)
        except ValueError:
            return txt

    def export(self, path: str, output: str, wait_s: float = 3600.0, **opts) -> dict:
        """Start an export and wait for it; raise unless it ends 'done'."""
        job = self.call("export_start", path=path, output=output, **opts)
        job = job.get("job", job) if isinstance(job, dict) else job
        waited = 0.0
        while True:
            st = self.call("export_wait", job=job, timeoutSeconds=600)
            if st.get("state") != "running":
                break
            waited += 600
            if waited >= wait_s:
                self.call("export_cancel", job=job)
                raise ConcatError(f"export timed out after {wait_s} s")
        if st.get("state") != "done":
            raise ConcatError(f"export {st.get('state')}: {st}")
        return st

    def close(self) -> None:
        if self._p.poll() is None:
            self._p.kill()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
