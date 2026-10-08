#!/usr/bin/env python3
"""Owed's private inference adapter. Bind to loopback; access via SSH tunnel only."""
import gc
import json
import os
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

TOKEN = os.environ.get("OWED_WORKER_TOKEN", "")
MODEL = os.environ.get("OWED_TEXT_MODEL", "qwen2.5:0.5b")
WHISPER_MODEL = os.environ.get("OWED_WHISPER_MODEL", "base.en")
MODEL_DIR = os.environ.get("OWED_WHISPER_CACHE", "/var/lib/owed-worker/models")
TMP_DIR = os.environ.get("OWED_TMP_DIR", "/var/lib/owed-worker/tmp")
LOCK = threading.Lock()
MAX_AUDIO = 18 * 1024 * 1024

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not log user-provided transcripts, prompts or wallet info.
        pass

    def json_reply(self, status, value):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            return self.json_reply(200, {"ok": True, "service": "owed-inference", "model": MODEL, "speech_model": WHISPER_MODEL, "private": True})
        self.json_reply(404, {"error": "not found"})

    def do_POST(self):
        if not TOKEN or self.headers.get("Authorization", "") != "Bearer " + TOKEN:
            return self.json_reply(401, {"error": "unauthorized"})
        if self.path not in ("/v1/chat/completions", "/transcribe"):
            return self.json_reply(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length", "0"))
        cap = MAX_AUDIO if self.path == "/transcribe" else 40000
        if length < 1 or length > cap:
            return self.json_reply(413, {"error": "request too large"})
        if not LOCK.acquire(timeout=5):
            return self.json_reply(503, {"error": "inference busy; retry shortly"})
        try:
            payload = self.rfile.read(length)
            if self.path == "/transcribe":
                result = self.transcribe(payload)
            else:
                result = self.complete(payload)
            self.json_reply(200, result)
        except Exception as exc:
            # Short, generic errors; avoid accidentally disclosing model input.
            self.json_reply(502, {"error": type(exc).__name__ + " in local inference"})
        finally:
            LOCK.release()

    def complete(self, raw):
        incoming = json.loads(raw.decode("utf-8"))
        messages = incoming.get("messages", [])
        if not isinstance(messages, list) or not (1 <= len(messages) <= 4):
            raise ValueError("invalid messages")
        body = {
            "model": MODEL,
            "messages": messages,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0,
                "num_ctx": 2048,
                "num_predict": 1000,
                "num_thread": 2,
                "num_batch": 32
            },
            "keep_alive": "0s"
        }
        request = Request("http://127.0.0.1:11434/api/chat",
                          data=json.dumps(body).encode(),
                          headers={"Content-Type": "application/json"},
                          method="POST")
        with urlopen(request, timeout=170) as response:
            answer = json.load(response)
        content = answer.get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("empty completion")
        return {"choices": [{"message": {"content": content}}]}

    def transcribe(self, audio):
        from faster_whisper import WhisperModel
        content_type = self.headers.get("Content-Type", "").lower()
        suffix = ".wav" if "wav" in content_type else (".mp3" if "mpeg" in content_type else ".webm")
        os.makedirs(TMP_DIR, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=TMP_DIR, suffix=suffix, delete=False) as f:
            f.write(audio)
            path = f.name
        model = None
        try:
            model = WhisperModel(WHISPER_MODEL, device="cpu",
                                 compute_type="int8", cpu_threads=2,
                                 num_workers=1, download_root=MODEL_DIR,
                                 local_files_only=True)
            segments, _ = model.transcribe(path, language="en", beam_size=2,
                                           vad_filter=False, condition_on_previous_text=False)
            text = " ".join(segment.text.strip() for segment in segments).strip()
            if not text:
                raise ValueError("no speech detected")
            return {"text": text[:16000]}
        finally:
            if model is not None:
                del model
            gc.collect()
            os.unlink(path)

if __name__ == "__main__":
    if not TOKEN or len(TOKEN) < 24:
        raise RuntimeError("OWED_WORKER_TOKEN missing")
    os.makedirs(TMP_DIR, exist_ok=True)
    ThreadingHTTPServer(("127.0.0.1", 18765), Handler).serve_forever()
