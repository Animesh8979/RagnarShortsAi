---
name: video-perception
description: Watch, index, summarize, and query video files. Extracts adaptive frames, transcribes speech with Whisper, computes visual fingerprints, and answers natural-language questions about video content. Zero-cost, offline-first (Whisper local, NIM vision optional). Use this skill when the user asks to "watch", "summarize", "search", "index", or "understand" a video file, or when working with the OpenMontage video production pipeline.
---

# video-perception

Perceive, index, and query video files. Four CLI tools, all on the D: drive, all zero-cost.

## Layout

```
D:\anitgravity work\video-perception\
  watch_video.py      — adaptive frame extraction + Whisper transcription + optional NIM vision Q&A
  index_video.py      — build a searchable visual+textual index of a video
  summarize_video.py  — structured markdown summary (logline, scene breakdown, key moments, transcript)
  query_video.py      — natural-language search over an index (keyword + timestamp + frame retrieval)
  out\                — default output directory (frames, indexes, summaries)
```

## Environment

- **Python**: `D:\anitgravity work\openmontage\.venv\Scripts\python.exe` (has Whisper installed)
- **ffmpeg/ffprobe**: Gyan FFmpeg on PATH, fallback to Remotion-bundled at `D:\anitgravity work\node_modules\@remotion\compositor-win32-x64-msvc\`
- **NIM key** (optional, for vision queries): `NVIDIA_API_KEY` in `D:\anitgravity work\openmontage\.env`
- **NIM model**: `meta/llama-3.2-90b-vision-instruct` (free-tier; quota-limited)

## Commands

### Watch a video (frames + transcript + optional vision Q&A)

```powershell
$py = "D:\anitgravity work\openmontage\.venv\Scripts\python.exe"
$vp = "D:\anitgravity work\video-perception\watch_video.py"

# Extract frames only (no Whisper)
& $py $vp "D:\path\to\video.mp4" --extract-frames --max-frames 6 --out-dir "D:\anitgravity work\video-perception\out\frames"

# Full watch: frames + Whisper transcript
& $py $vp "D:\path\to\video.mp4" --max-frames 6 --whisper-model base.en --out-file "D:\anitgravity work\video-perception\out\watch.json"

# Vision Q&A (requires NIM key in env)
$envContent = Get-Content "D:\anitgravity work\openmontage\.env"
foreach ($line in $envContent) { if ($line -match "^\s*(\w+)=(.+)$") { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process") } }
& $py $vp "D:\path\to\video.mp4" --question "Rate readability, character clarity, caption legibility on 1-10. PRO or AMATEUR?" --max-frames 6
```

### Build an index for search

```powershell
& $py "D:\anitgravity work\video-perception\index_video.py" "D:\path\to\video.mp4" --out "D:\anitgravity work\video-perception\out\index.json" --max-frames 20
```

### Summarize a video

```powershell
& $py "D:\anitgravity work\video-perception\summarize_video.py" "D:\path\to\video.mp4" --index "D:\anitgravity work\video-perception\out\index.json" --out "D:\anitgravity work\video-perception\out\summary.md"
```

### Query a video (natural-language search)

```powershell
& $py "D:\anitgravity work\video-perception\query_video.py" --index "D:\anitgravity work\video-perception\out\index.json" "what happens when the lighthouse goes dark?"
& $py "D:\anitgravity work\video-perception\query_video.py" --index "...index.json" "show me the scene about the storm"
& $py "D:\anitgravity work\video-perception\query_video.py" --index "...index.json" "what is on screen at 0:15"
```

## Whisper model sizes

| Size | VRAM | Speed | Accuracy |
|------|------|-------|----------|
| `tiny.en` | ~1 GB | fastest | OK for clean audio |
| `base.en` | ~1 GB | fast | good default |
| `small.en` | ~2 GB | medium | better accuracy |
| `medium.en` | ~5 GB | slow | best (may exceed 4GB VRAM) |

Default: `base.en` (best speed/accuracy tradeoff on GTX 1650 4GB).

## Adaptive frame sampling

`watch_video.py` and `index_video.py` bias frame extraction toward the hook (first 15%) and CTA (last 15%) when a question is provided, with even sampling across the middle. Without a question, frames are evenly distributed.

## NIM vision Q&A (optional)

If `NVIDIA_API_KEY` is set and quota is available, `watch_video.py --question "..."` sends up to 6 base64-encoded frames to `meta/llama-3.2-90b-vision-instruct` and returns a single answer. If the key is missing or quota is exhausted, the tool degrades gracefully (frames + transcript only; vision_answer contains an error string).

## Output formats

- `watch_video.py` → JSON with `video`, `frames`, `transcript`, `vision_answer`
- `index_video.py` → JSON with `video`, `frames` (with phash + color_hist), `transcript_segments`, `frame_buckets`
- `summarize_video.py` → Markdown (logline, scene table, key moments, full transcript)
- `query_video.py` → JSON with `query`, `answer`, match counts

## Integration with OpenMontage pipeline

- Run `watch_video.py` after rendering to audit a video before publish
- Run `index_video.py` once per episode to enable `query_video.py` lookups (e.g., "what was the narrator's name in Ep 1?")
- Use `summarize_video.py` to generate a YouTube description from the transcript
- The index JSON is suitable for episodic memory (MemRL) — store per-episode indexes and cross-query them
