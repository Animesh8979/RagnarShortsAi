#!/usr/bin/env python3
"""
index_video.py — build a searchable visual+textual index of a video.

Extracts frames at adaptive intervals, computes a lightweight visual fingerprint
(perceptual hash + color histogram), and indexes the Whisper transcript per
frame bucket. Output is a single JSON index file suitable for query_video.py.

Zero-cost, fully offline (no CLIP/GPU required). Uses Pillow + imagehash if
available, falling back to raw color stats if not.

Usage:
  python index_video.py <video_path> [--out index.json] [--max-frames 20]
  python index_video.py <video_path> --index-dir D:\\path\\index


Output JSON structure:
{
  "video": {"path","duration_sec","width","height","fps"},
  "frames": [{"path","timestamp_sec","index","phash","color_hist":[...]}],
  "transcript_segments": [{"start","end","text"}],
  "frame_buckets": [{"index","start_sec","end_sec","text","frame_index"}]
}
"""
from __future__ import annotations
import argparse
import json
import math
import os
import struct
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

VENV_PYTHON = Path(r"D:\anitgravity work\openmontage\.venv\Scripts\python.exe")
REMOTION_BIN = Path(r"D:\anitgravity work\node_modules\@remotion\compositor-win32-x64-msvc")
SYSTEM_BIN = Path(r"C:\Users\shukl\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin")


def _find_binary(name: str, env_var: str) -> str:
    if os.environ.get(env_var):
        return os.environ[env_var]
    import shutil
    for c in [SYSTEM_BIN / name, REMOTION_BIN / name]:
        if c.exists():
            return str(c)
    found = shutil.which(name)
    return found or str(REMOTION_BIN / name)


FFMPEG = _find_binary("ffmpeg.exe", "FFMPEG_PATH")
FFPROBE = _find_binary("ffprobe.exe", "FFPROBE_PATH")


def run_cmd(cmd: list[str], capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=capture, text=True, check=False)


def probe_video(video_path: Path) -> dict[str, Any]:
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
    num, den = map(int, stream["r_frame_rate"].split("/"))
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": num / den,
        "duration_sec": float(stream.get("duration", 0)),
    }


def extract_frames(video_path: Path, out_dir: Path, max_frames: int, duration: float) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    n = min(max_frames, max(1, int(duration / 5)))
    timestamps = [duration * (i + 0.5) / n for i in range(n)]
    frames = []
    for i, ts in enumerate(timestamps):
        out_path = out_dir / f"frame_{i:03d}_{int(ts):04d}s.jpg"
        cmd = [
            FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{ts:.3f}", "-i", str(video_path),
            "-frames:v", "1", "-q:v", "2", str(out_path)
        ]
        run_cmd(cmd, capture=False)
        if out_path.exists():
            frames.append(out_path)
    return frames


def compute_fingerprint(frame_path: Path) -> dict[str, Any]:
    """Compute a perceptual hash + color histogram without external deps.

    Uses the system Python's struct module to read JPEG via Pillow if available.
    Falls back to a raw-bytes histogram (less precise but dependency-free).
    """
    result: dict[str, Any] = {"phash": None, "color_hist": []}
    try:
        from PIL import Image
        import imagehash
        img = Image.open(frame_path).convert("RGB").resize((8, 8))
        result["phash"] = str(imagehash.average_hash(Image.open(frame_path).convert("L")))
        pixels = list(img.getdata())
        c = Counter()
        for r, g, b in pixels:
            c[(r >> 5, g >> 5, b >> 5)] += 1
        result["color_hist"] = [c.get((i, j, k), 0) for i in range(8) for j in range(8) for k in range(8)][:64]
        result["color_hist"] = sorted(result["color_hist"], reverse=True)
        result["dominant_colors"] = [(r << 5, g << 5, b << 5) for (r, g, b), _ in c.most_common(3)]
    except ImportError:
        with open(frame_path, "rb") as f:
            raw = f.read()
        result["size_bytes"] = len(raw)
        result["color_hist"] = [raw.count(bytes([i])) for i in range(0, 256, 4)][:32]
    return result


def transcribe(video_path: Path, model: str = "base.en") -> list[dict[str, Any]]:
    script = f"""
import sys, json
sys.path.insert(0, r"D:\\anitgravity work\\openmontage")
import whisper
m = whisper.load_model("{model}")
r = m.transcribe(r"{video_path}", word_timestamps=True, language="en")
print(json.dumps(r.get("segments", [])))
"""
    res = run_cmd([str(VENV_PYTHON), "-c", script], capture=True)
    if res.returncode != 0:
        return []
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return []


def bucket_transcript(segments: list[dict], n_buckets: int, duration: float) -> list[dict[str, Any]]:
    """Assign each transcript segment to a frame bucket."""
    bucket_dur = duration / n_buckets if n_buckets else 1
    buckets: list[list[str]] = [[] for _ in range(n_buckets)]
    for seg in segments:
        mid = (seg.get("start", 0) + seg.get("end", 0)) / 2
        idx = min(int(mid / bucket_dur), n_buckets - 1)
        buckets[idx].append(seg.get("text", "").strip())
    return [
        {
            "index": i,
            "start_sec": round(i * bucket_dur, 2),
            "end_sec": round((i + 1) * bucket_dur, 2),
            "text": " ".join(texts),
        }
        for i, texts in enumerate(buckets)
    ]


def main():
    parser = argparse.ArgumentParser(description="Index a video for search/retrieval")
    parser.add_argument("video", type=Path)
    parser.add_argument("--out", "-o", type=Path, default=None, help="Output JSON file")
    parser.add_argument("--max-frames", "-n", type=int, default=20)
    parser.add_argument("--frame-dir", type=Path, default=None)
    parser.add_argument("--whisper-model", default="base.en")
    args = parser.parse_args()

    video_path = args.video.resolve()
    if not video_path.exists():
        print(f"Video not found: {video_path}", file=sys.stderr)
        sys.exit(1)

    info = probe_video(video_path)
    duration = info["duration_sec"]
    print(f"[index] {video_path.name} — {duration:.1f}s, {info['width']}x{info['height']}", file=sys.stderr)

    frame_dir = args.frame_dir or Path(tempfile.mkdtemp(prefix="video_index_"))
    frame_paths = extract_frames(video_path, frame_dir, args.max_frames, duration)
    print(f"[index] Extracted {len(frame_paths)} frames", file=sys.stderr)

    frames = []
    for i, fp in enumerate(frame_paths):
        ts = duration * (i + 0.5) / len(frame_paths) if frame_paths else 0
        fp_data = compute_fingerprint(fp)
        frames.append({
            "path": str(fp),
            "timestamp_sec": round(ts, 3),
            "index": i,
            **fp_data,
        })
    print(f"[index] Computed fingerprints for {len(frames)} frames", file=sys.stderr)

    print(f"[index] Transcribing with Whisper {args.whisper_model}...", file=sys.stderr)
    segments = transcribe(video_path, args.whisper_model)
    buckets = bucket_transcript(segments, len(frames), duration)
    print(f"[index] {len(segments)} transcript segments → {len(buckets)} buckets", file=sys.stderr)

    n_buckets = len(frames)
    bucket_dur = (duration / n_buckets) if n_buckets else 0
    
    for frame in frames:
        bi = min(int(frame["timestamp_sec"] / bucket_dur), n_buckets - 1) if n_buckets else 0
        frame["transcript_text"] = buckets[bi].get("text", "") if bi < len(buckets) and isinstance(buckets[bi], dict) else ""

    index = {
        "video": {"path": str(video_path), **info},
        "frames": frames,
        "transcript_segments": [
            {"start": s.get("start", 0), "end": s.get("end", 0), "text": s.get("text", "")}
            for s in segments
        ],
        "frame_buckets": buckets,
    }

    out_path = args.out or (Path("video_index.json"))
    out_path.write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"[index] Wrote {out_path}", file=sys.stderr)
    print(json.dumps({"status": "ok", "frames": len(frames), "segments": len(segments), "out": str(out_path)}))


if __name__ == "__main__":
    main()
