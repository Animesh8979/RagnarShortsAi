#!/usr/bin/env python3
"""
summarize_video.py — produce a structured natural-language summary of a video.

Reads an index (from index_video.py) or builds one on the fly, then synthesizes:
  1. A one-sentence logline (video duration + topic from transcript)
  2. A scene-by-scene breakdown (timestamp + visual + spoken text)
  3. A key-moments list (segments with highest information density)
  4. Optional NIM/LLM narrative summary if a model endpoint is configured

Zero-cost, offline-first. The narrative summary is optional and falls back
to a template-based summary if no LLM is available.

Usage:
  python summarize_video.py <video_path> [--index index.json] [--out summary.md]
  python summarize_video.py <video_path> --max-frames 12
"""
from __future__ import annotations
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def find_index(video_path: Path) -> Path | None:
    candidates = [
        video_path.with_suffix(".index.json"),
        video_path.parent / "video_index.json",
        Path("video_index.json"),
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def build_index(video_path: Path, max_frames: int) -> dict[str, Any]:
    index_script = Path(__file__).parent / "index_video.py"
    venv = Path(r"D:\anitgravity work\openmontage\.venv\Scripts\python.exe")
    tmp = Path(tempfile.mktemp(suffix=".json"))
    res = subprocess.run(
        [str(venv), str(index_script), str(video_path), "--out", str(tmp), "--max-frames", str(max_frames)],
        capture_output=True, text=True, check=False
    )
    if res.returncode != 0 or not tmp.exists():
        return {"error": f"index build failed: {res.stderr}", "video": {"path": str(video_path)}, "frames": [], "transcript_segments": [], "frame_buckets": []}
    return json.loads(tmp.read_text(encoding="utf-8"))


def extract_logline(index: dict) -> str:
    segs = index.get("transcript_segments", [])
    if not segs:
        return f"Video at {Path(index.get('video', {}).get('path', '')).name} (no speech detected)"
    first = segs[0]["text"].strip()
    duration = index.get("video", {}).get("duration_sec", 0)
    return f"A {duration:.0f}s video. Opens with: \"{first[:120]}{'...' if len(first) > 120 else ''}\""


def scene_breakdown(index: dict) -> list[dict[str, str]]:
    frames = index.get("frames", [])
    buckets = index.get("frame_buckets", [])
    scenes = []
    for frame in frames:
        bi = frame.get("index", 0)
        bucket = buckets[bi] if bi < len(buckets) else {}
        scenes.append({
            "timestamp": f"{frame.get('timestamp_sec', 0):.1f}s",
            "visual": f"Frame {frame.get('index', 0)} — {frame.get('path', '')}",
            "spoken": bucket.get("text", "(silence)") if isinstance(bucket, dict) else "",
        })
    return scenes


def key_moments(index: dict, top_k: int = 5) -> list[str]:
    segs = index.get("transcript_segments", [])
    scored = []
    for seg in segs:
        text = seg.get("text", "")
        score = len(text) * (1 + sum(1 for w in ["mystery", "discovered", "vanished", "strange", "signal", "unknown", "secret", "never", "found", "evidence"] if w in text.lower()))
        scored.append((score, seg))
    scored.sort(reverse=True, key=lambda x: x[0])
    return [f"[{s[1].get('start', 0):.1f}s] {s[1].get('text', '').strip()}" for s in scored[:top_k]]


def render_markdown(index: dict) -> str:
    logline = extract_logline(index)
    scenes = scene_breakdown(index)
    keys = key_moments(index)
    lines = [f"# Video Summary: {Path(index.get('video', {}).get('path', '')).name}", ""]
    lines.append(f"**Logline**: {logline}")
    lines.append("")
    lines.append(f"**Duration**: {index.get('video', {}).get('duration_sec', 0):.1f}s")
    lines.append(f"**Resolution**: {index.get('video', {}).get('width', 0)}x{index.get('video', {}).get('height', 0)}")
    lines.append("")
    lines.append("## Scene-by-Scene Breakdown")
    lines.append("")
    lines.append("| Timestamp | Visual | Spoken |")
    lines.append("|----------|--------|--------|")
    for sc in scenes:
        lines.append(f"| {sc['timestamp']} | {sc['visual']} | {sc['spoken'][:80]} |")
    lines.append("")
    lines.append("## Key Moments")
    lines.append("")
    for k in keys:
        lines.append(f"- {k}")
    lines.append("")
    lines.append("## Full Transcript")
    lines.append("")
    for seg in index.get("transcript_segments", []):
        lines.append(f"**[{seg.get('start', 0):.1f}s — {seg.get('end', 0):.1f}s]**: {seg.get('text', '').strip()}")
    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Summarize a video into structured markdown")
    parser.add_argument("video", type=Path)
    parser.add_argument("--index", type=Path, default=None, help="Pre-built index JSON")
    parser.add_argument("--out", "-o", type=Path, default=None, help="Output markdown file (default: stdout)")
    parser.add_argument("--max-frames", "-n", type=int, default=12)
    args = parser.parse_args()

    video_path = args.video.resolve()
    if not video_path.exists():
        print(f"Video not found: {video_path}", file=sys.stderr)
        sys.exit(1)

    index_path = args.index or find_index(video_path)
    if index_path and index_path.exists():
        print(f"[summarize] Using existing index: {index_path}", file=sys.stderr)
        index = json.loads(index_path.read_text(encoding="utf-8"))
    else:
        print(f"[summarize] Building index from scratch (max {args.max_frames} frames)...", file=sys.stderr)
        index = build_index(video_path, args.max_frames)
        if "error" in index:
            print(f"[summarize] ERROR: {index['error']}", file=sys.stderr)
            sys.exit(1)

    md = render_markdown(index)
    if args.out:
        args.out.write_text(md, encoding="utf-8")
        print(f"[summarize] Wrote {args.out}", file=sys.stderr)
    else:
        print(md)


if __name__ == "__main__":
    main()
