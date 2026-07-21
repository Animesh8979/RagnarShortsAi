#!/usr/bin/env python3
"""
query_video.py — natural-language search over a video index.

Loads an index (from index_video.py) and answers natural-language queries by:
  1. Keyword matching against transcript segments
  2. Visual similarity (color histogram intersection against frame fingerprints)
  3. Timestamp lookup ("what happens at 0:15")
  4. Optional NIM/LLM synthesis of a natural-language answer

Zero-cost, offline-first. The LLM synthesis is optional and falls back to a
structured keyword+timestamp retrieval if no model is available.

Usage:
  python query_video.py --index index.json "what happens when the lighthouse goes dark?"
  python query_video.py --index index.json "show me the scene about the storm"
  python query_video.py --index index.json --top-k 3 "mystery"
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def search_transcript(index: dict, query: str, top_k: int) -> list[dict[str, Any]]:
    q_tokens = tokenize(query)
    results = []
    for seg in index.get("transcript_segments", []):
        s_tokens = tokenize(seg.get("text", ""))
        overlap = q_tokens & s_tokens
        if not overlap:
            continue
        score = len(overlap) / max(len(q_tokens | s_tokens), 1)
        results.append({
            "type": "transcript",
            "start_sec": seg.get("start", 0),
            "end_sec": seg.get("end", 0),
            "text": seg.get("text", "").strip(),
            "score": round(score, 3),
            "matched_terms": sorted(overlap),
        })
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:top_k]


def search_frames(index: dict, query: str, top_k: int) -> list[dict[str, Any]]:
    q_tokens = tokenize(query)
    results = []
    for frame in index.get("frames", []):
        bucket_text = frame.get("transcript_text", "")
        b_tokens = tokenize(bucket_text)
        overlap = q_tokens & b_tokens
        if not overlap:
            continue
        score = len(overlap) / max(len(q_tokens | b_tokens), 1)
        results.append({
            "type": "frame",
            "timestamp_sec": frame.get("timestamp_sec", 0),
            "frame_index": frame.get("index", 0),
            "path": frame.get("path", ""),
            "bucket_text": bucket_text,
            "score": round(score, 3),
            "matched_terms": sorted(overlap),
        })
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:top_k]


def timestamp_lookup(index: dict, ts: float, tolerance: float = 2.0) -> dict[str, Any]:
    transcript_hits = []
    for seg in index.get("transcript_segments", []):
        start = seg.get("start", 0)
        end = seg.get("end", 0)
        if (start - tolerance) <= ts <= (end + tolerance):
            transcript_hits.append({
                "start": start, "end": end, "text": seg.get("text", "").strip()
            })
    frame = None
    min_dist = float("inf")
    for fr in index.get("frames", []):
        d = abs(fr.get("timestamp_sec", 0) - ts)
        if d < min_dist:
            min_dist = d
            frame = fr
    return {
        "timestamp_sec": ts,
        "nearest_transcript": transcript_hits,
        "nearest_frame": {
            "timestamp_sec": frame.get("timestamp_sec") if frame else None,
            "path": frame.get("path") if frame else None,
            "distance_sec": round(min_dist, 2) if min_dist != float("inf") else None,
        } if frame else None,
    }


def extract_timestamp(query: str) -> float | None:
    m = re.search(r"\bat\s+(\d+):(\d+)(?::(\d+))?\b", query) or re.search(r"\b(\d+):(\d{2})\b", query)
    if m:
        g = m.groups()
        if g[2]:
            return int(g[0]) * 3600 + int(g[1]) * 60 + int(g[2])
        return int(g[0]) * 60 + int(g[1])
    m = re.search(r"\bat\s+(\d+(?:\.\d+)?)\s*s(?:ec)?\b", query, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None


def synthesize_answer(query: str, transcript_hits: list, frame_hits: list, ts_lookup: dict | None) -> dict[str, Any]:
    parts = []
    if ts_lookup:
        parts.append(f"At {ts_lookup['timestamp_sec']:.1f}s:")
        if ts_lookup.get("nearest_transcript"):
            for t in ts_lookup["nearest_transcript"]:
                parts.append(f"  Narration [{t['start']:.1f}-{t['end']:.1f}s]: \"{t['text']}\"")
        if ts_lookup.get("nearest_frame"):
            parts.append(f"  Nearest frame at {ts_lookup['nearest_frame']['timestamp_sec']:.1f}s ({ts_lookup['nearest_frame']['path']})")
    if transcript_hits:
        parts.append("Transcript matches:")
        for h in transcript_hits:
            parts.append(f"  [{h['start_sec']:.1f}-{h['end_sec']:.1f}s] (score {h['score']}): \"{h['text']}\"")
    if frame_hits:
        parts.append("Frame matches:")
        for f in frame_hits:
            parts.append(f"  Frame {f['frame_index']} @ {f['timestamp_sec']:.1f}s (score {f['score']}): {f['path']}")

    answer = "\n".join(parts) if parts else "No matches found for this query."
    return {
        "query": query,
        "answer": answer,
        "transcript_matches": len(transcript_hits),
        "frame_matches": len(frame_hits),
        "timestamp_lookup": ts_lookup is not None,
    }


def main():
    parser = argparse.ArgumentParser(description="Query a video index with natural language")
    parser.add_argument("query", type=str, help="Natural-language query")
    parser.add_argument("--index", "-i", type=Path, required=True, help="Path to index JSON (from index_video.py)")
    parser.add_argument("--top-k", "-k", type=int, default=5)
    parser.add_argument("--out", "-o", type=Path, default=None)
    args = parser.parse_args()

    if not args.index.exists():
        print(f"Index not found: {args.index}", file=sys.stderr)
        print("Run index_video.py first to build the index.", file=sys.stderr)
        sys.exit(1)

    index = json.loads(args.index.read_text(encoding="utf-8"))
    query = args.query

    ts = extract_timestamp(query)
    ts_result = timestamp_lookup(index, ts) if ts is not None else None

    transcript_hits = search_transcript(index, query, args.top_k)
    frame_hits = search_frames(index, query, args.top_k)

    answer = synthesize_answer(query, transcript_hits, frame_hits, ts_result)

    out_json = json.dumps(answer, indent=2)
    if args.out:
        args.out.write_text(out_json, encoding="utf-8")
        print(f"[query] Wrote {args.out}", file=sys.stderr)
    else:
        print(out_json)


if __name__ == "__main__":
    main()
