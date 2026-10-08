#!/usr/bin/env python3
"""One-time live Whisper benchmark. Tests actual audio, not mocks."""
import os
import sys
import time
from faster_whisper import WhisperModel
if len(sys.argv)<2: raise SystemExit("Usage: probe-vps-whisper.py <audio.wav>")
start=time.perf_counter()
model=WhisperModel("tiny.en", device="cpu", compute_type="int8",
                   cpu_threads=2, num_workers=1,
                   download_root="/var/lib/owed-worker/models")
print("MODEL_LOADED_SEC="+str(round(time.perf_counter()-start,2)),flush=True)
segments, _=model.transcribe(sys.argv[1], language="en",
                             beam_size=2, vad_filter=False)
transcript=" ".join(s.text.strip() for s in segments)
print("WHISPER_TRANSCRIPT="+transcript,flush=True)
print("ELAPSED_SEC="+str(round(time.perf_counter()-start,2)),flush=True)
if len(transcript)<8: raise SystemExit("Whisper produced no usable transcript")
