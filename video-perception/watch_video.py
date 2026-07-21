#!/usr/bin/env python3
"""
watch_video.py — video perception CLI for opencode video-perception skill.

Adaptive frame sampling + Whisper transcription + optional NIM vision query.
Zero-cost, offline-first (Whisper local, NIM free-tier). All artifacts on D: drive.

Usage:
  python watch_video.py <video_path> [--question "what to look for"] [--max-frames N]
  python watch_video.py <video_path> --extract-frames --out-dir D:\path\frames
  python watch_video.py <video_path> --transcribe-only

Outputs a JSON bundle to stdout (or --out-file) with:
{
  "video": {"path", "duration_sec", "width", "height", "fps"},
  "frames": [{"path", "timestamp_sec", "index"}],
  "transcript": {"language", "segments": [{"start", "end", "text", "words": [...]}]},
  "vision_answer": {"question", "answer", "model", "frames_used"}  (if --question given)
}
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

# Ensure we use the openmontage venv python for whisper
VENV_PYTHON = Path(r"D:\anitgravity work\openmontage\.venv\Scripts\python.exe")

# Prefer system ffprobe/ffmpeg (Gyan build supports -select_streams);
# fall back to Remotion-bundled binaries if system ones not on PATH.
REMOTION_BIN = Path(r"D:\anitgravity work\node_modules\@remotion\compositor-win32-x64-msvc")
SYSTEM_BIN = Path(r"C:\Users\shukl\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin")


def _find_binary(name: str, env_var: str) -> str:
    """Find first existing binary path."""
    if os.environ.get(env_var):
        return os.environ[env_var]
    candidates = [
        SYSTEM_BIN / name,
        REMOTION_BIN / name,
        name,  # PATH fallback
    ]
    for c in candidates:
        if c.exists() if isinstance(c, Path) else shutil.which(str(c)):
            return str(c)
    return str(REMOTION_BIN / name)


FFMPEG = _find_binary("ffmpeg.exe", "FFMPEG_PATH")
FFPROBE = _find_binary("ffprobe.exe", "FFPROBE_PATH")
NIM_KEY = os.environ.get("NVIDIA_API_KEY") or os.environ.get("NIM_API_KEY")
NIM_MODEL = os.environ.get("NIM_VISION_MODEL", "meta/llama-3.2-90b-vision-instruct")
# v13 fix: use model-specific endpoint (not generic /chat/completions) per NVIDIA docs
NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def _load_gemini_key() -> str | None:
    """Look up GEMINI_API_KEY from env first, then from openmontage .env."""
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    env_path = Path(r"D:\anitgravity work\openmontage\.env")
    if not env_path.exists():
        return None
    import re
    m = re.search(r"^GEMINI_API_KEY=(.+)$", env_path.read_text(encoding="utf-8"), re.M)
    return m.group(1).strip() if m else None


def query_vision(frames: list[dict], question: str) -> dict[str, Any]:
    """Try Gemini first, fall back to NIM."""
    if not frames:
        return {"error": "No frames to analyze"}

    import base64
    import requests
    import re as _re

    frame_data = []
    for fr in frames[:6]:
        with open(fr["path"], "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        frame_data.append({"path": fr["path"], "b64": b64, "ts": fr["timestamp_sec"]})

    # ---- 1. GEMINI ----
    gemini_key = _load_gemini_key()
    if gemini_key:
        parts = [{"text": question}]
        for fr in frame_data:
            parts.append({"inline_data": {"mime_type": "image/jpeg", "data": fr["b64"]}})
        body = {"contents": [{"parts": parts}]}
        try:
            resp = requests.post(f"{GEMINI_URL}?key={gemini_key}", json=body, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            answer = data["candidates"][0]["content"]["parts"][0]["text"]
            return {
                "question": question, "answer": answer,
                "model": GEMINI_MODEL, "frames_used": len(frame_data)
            }
        except Exception as e:
            last_gem_err = str(e)

    # ---- 2. NIM FALLBACK ----
    if not NIM_KEY:
        return {"error": "No GEMINI_API_KEY or NIM_API_KEY available"}

    content = [{"type": "text", "text": f"Question: {question}\n\nAnalyze the provided video frames and answer concisely."}]
    for fr in frame_data:
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{fr['b64']}"}})

    body = {
        "model": NIM_MODEL,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 2048,
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {NIM_KEY}",
        "Content-Type": "application/json",
    }
    last_err = None
    for attempt in range(1, 4):
        try:
            resp = requests.post(NIM_URL, json=body, headers=headers, timeout=100)
            resp.raise_for_status()
            data = resp.json()
            answer = data["choices"][0]["message"]["content"]
            return {
                "question": question, "answer": answer,
                "model": NIM_MODEL, "frames_used": len(frame_data),
                "attempt": attempt
            }
        except Exception as e:
            last_err = str(e)
            time.sleep(8)
    return {"error": f"Gemini: {last_gem_err if 'last_gem_err' in dir() else 'no key'}. NIM: {last_err}"}

query_nim_vision = query_vision  # backward compat


def run_cmd(cmd: list[str], cwd: str | None = None, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=capture, text=True, check=False)


def probe_video(video_path: Path) -> dict[str, Any]:
    """ffprobe for duration, resolution, fps."""
    cmd = [
        FFPROBE, "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,duration",
        "-of", "json", str(video_path)
    ]
    res = run_cmd(cmd)
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {res.stderr}")
    data = json.loads(res.stdout)
    stream = data["streams"][0]
    w = int(stream["width"])
    h = int(stream["height"])
    # r_frame_rate like "30000/1001"
    num, den = map(int, stream["r_frame_rate"].split("/"))
    fps = num / den
    duration = float(stream.get("duration", 0))
    return {"width": w, "height": h, "fps": fps, "duration_sec": duration}


def extract_frames(
    video_path: Path,
    out_dir: Path,
    timestamps: list[float],
    prefix: str = "frame"
) -> list[dict[str, Any]]:
    """Extract frames at given timestamps (seconds)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    frames = []
    for i, ts in enumerate(timestamps):
        out_path = out_dir / f"{prefix}_{i:03d}_{int(ts):04d}s.jpg"
        cmd = [
            FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{ts:.3f}", "-i", str(video_path),
            "-frames:v", "1", "-q:v", "2", str(out_path)
        ]
        run_cmd(cmd, capture=False)
        if out_path.exists():
            frames.append({
                "path": str(out_path),
                "timestamp_sec": round(ts, 3),
                "index": i
            })
    return frames


def adaptive_timestamps(duration: float, max_frames: int, question: str | None = None) -> list[float]:
    """Generate adaptive timestamps. If question given, bias toward start/end for hooks/outros."""
    if duration <= 0:
        return []
    n = min(max_frames, max(3, int(duration * 0.3) + 1))  # at least 3 frames, biased by duration
    if question:
        # Bias: more frames in first 15% (hook) and last 15% (CTA)
        hook_end = duration * 0.15
        cta_start = duration * 0.85
        hook_frames = max(1, n // 3)
        cta_frames = max(1, n // 3)
        mid_frames = n - hook_frames - cta_frames
        timestamps = []
        if hook_frames:
            timestamps += [hook_end * (i + 0.5) / hook_frames for i in range(hook_frames)]
        if mid_frames and cta_start > hook_end:
            timestamps += [hook_end + (cta_start - hook_end) * (i + 0.5) / mid_frames for i in range(mid_frames)]
        if cta_frames:
            timestamps += [cta_start + (duration - cta_start) * (i + 0.5) / cta_frames for i in range(cta_frames)]
    else:
        timestamps = [duration * (i + 0.5) / n for i in range(n)]
    return timestamps


def transcribe_video(video_path: Path, model: str = "tiny.en") -> dict[str, Any]:
    """Run Whisper via openmontage venv python. Returns transcript with word timestamps."""
    # Write a small inline script to avoid import issues
    script = f"""
import sys
sys.path.insert(0, r"D:\\anitgravity work\\openmontage")
import whisper
model = whisper.load_model("{model}")
result = model.transcribe(r"{video_path}", word_timestamps=True, language="en")
import json
print(json.dumps(result))
"""
    res = run_cmd([str(VENV_PYTHON), "-c", script], capture=True)
    if res.returncode != 0:
        raise RuntimeError(f"Whisper failed: {res.stderr}")
    return json.loads(res.stdout)


def main():
    parser = argparse.ArgumentParser(description="Watch video: frames + transcript + vision Q&A")
    parser.add_argument("video", type=Path, help="Path to video file")
    parser.add_argument("--question", "-q", type=str, help="Question for vision model")
    parser.add_argument("--max-frames", "-n", type=int, default=6, help="Max frames to extract")
    parser.add_argument("--out-dir", "-o", type=Path, help="Directory to save frames (default: temp)")
    parser.add_argument("--out-file", "-f", type=Path, help="Write JSON output to file")
    parser.add_argument("--transcribe-only", action="store_true", help="Only transcribe, no frames")
    parser.add_argument("--extract-frames", action="store_true", help="Extract frames without vision query")
    parser.add_argument("--whisper-model", default="tiny.en", choices=["tiny.en", "base.en", "small.en", "medium.en"],
                        help="Whisper model size")
    args = parser.parse_args()

    video_path = args.video.resolve()
    if not video_path.exists():
        print(f"Video not found: {video_path}", file=sys.stderr)
        sys.exit(1)

    # Probe
    info = probe_video(video_path)
    duration = info["duration_sec"]
    print(f"[watch] {video_path.name} — {duration:.1f}s, {info['width']}x{info['height']} @ {info['fps']:.2f}fps", file=sys.stderr)

    # Frames
    frames = []
    if not args.transcribe_only:
        if args.out_dir:
            frame_dir = args.out_dir
        else:
            frame_dir = Path(tempfile.mkdtemp(prefix="watch_frames_"))
        timestamps = adaptive_timestamps(duration, args.max_frames, args.question)
        frames = extract_frames(video_path, frame_dir, timestamps)
        print(f"[watch] Extracted {len(frames)} frames to {frame_dir}", file=sys.stderr)

    # Transcript
    transcript = None
    if not args.extract_frames:
        print(f"[watch] Transcribing with Whisper {args.whisper_model}...", file=sys.stderr)
        transcript = transcribe_video(video_path, args.whisper_model)
        print(f"[watch] Transcript: {len(transcript.get('segments', []))} segments", file=sys.stderr)

    # Vision query
    vision_answer = None
    if args.question and frames:
        print(f"[watch] Querying vision model (Gemini preferred, NIM fallback)...", file=sys.stderr)
        vision_answer = query_nim_vision(frames, args.question)

    result = {
        "video": {"path": str(video_path), **info},
        "frames": frames,
        "transcript": transcript,
        "vision_answer": vision_answer
    }

    out_json = json.dumps(result, indent=2)
    if args.out_file:
        args.out_file.write_text(out_json, encoding="utf-8")
        print(f"[watch] Wrote {args.out_file}", file=sys.stderr)
    else:
        print(out_json)


if __name__ == "__main__":
    main()