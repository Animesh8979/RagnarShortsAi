---
name: video-qa
description: Pre-upload visual QA on a rendered MP4. Checks brightness histogram, caption-region OCR confidence, color-saturation consistency across 5 keyframes, no >2s black-frame stretches. Returns pass/fail JSON. Use BEFORE every YT/IG upload, or invoke manually as /video-qa <path>.
allowed-tools:
  - Bash
  - Read
---

You are the L108 video-QA gate. Given a path to a rendered MP4, run these checks via ffmpeg/ffprobe (no MCPs required) and return a verdict.

## Inputs

The user message contains the absolute path to an .mp4 file. If they only give a slot id (organic / B1-B4), resolve the path from `renders/fresh-batch-{today}.json`.

## Checks

Run these in parallel where possible:

1. **Resolution + duration**: ffprobe shows 1080×1920, 28-32s for clips, 5-15s for organics.
2. **Average brightness**: ffmpeg signalstats avg(Y) must be 50-200 (not too dark, not blown).
3. **Black-frame stretches**: ffmpeg blackdetect filter — no stretch >2.0s.
4. **Color saturation stddev**: extract 5 keyframes at t=0.2,0.4,0.6,0.8,1.0 of duration, signalstats SATAVG std must be ≤30.
5. **Caption region OCR confidence**: extract one keyframe at mid-duration, crop to y=1150-1300 (caption safe-zone), run tesseract if available — text-pixel ratio >0.05.
6. **File size**: 4 MB ≤ size ≤ 80 MB (upper rules out Remotion bug, lower rules out empty file).

## Output

Return ONE markdown block:

```
=== video-qa: <basename> ===
verdict: PASS | FLAG | FAIL
- resolution      [✓|✗] 1080×1920
- duration        [✓|✗] {x}s (target {lo}-{hi}s)
- avg-brightness  [✓|✗] Y={y} (target 50-200)
- black-stretch   [✓|✗] max={x}s (limit 2.0s)
- saturation-std  [✓|✗] σ={x} (limit 30)
- caption-region  [✓|✗] text-pixel-ratio={x} (min 0.05)
- file-size       [✓|✗] {x} MB (range 4-80 MB)
```

PASS = all green. FLAG = 1-2 yellow but recoverable (no upload-blocker). FAIL = ≥3 red OR any hard-blocker (wrong res, bad duration, file size out of range).

## Constraints

- Use ffmpeg-static binary path: `node -e "console.log(require('ffmpeg-static'))"` if needed.
- All temp files go under `D:/anitgravity work/.runtime-cache/video-qa/`.
- This skill is READ-ONLY on the input MP4. Do not modify.
