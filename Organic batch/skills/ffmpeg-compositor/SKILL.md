---
name: ffmpeg-compositor
description: Strict guidelines for complex non-linear video editing via FFmpeg filtergraphs
---

# FFmpeg Compositor

<objective>
To migrate away from simple linear concatenation (`-f concat`) and enable complex, non-linear video editing. This allows for dynamic J-cuts, audio ducking, B&W emotional overlays, and precise subtitle mapping using Whisper timestamps.
</objective>

<rules>
1. **Never use `-f concat` for complex edits.** It prevents dynamic overlapping.
2. **Use `-filter_complex`.** Master the syntax for chaining audio (`amerge`, `volume`, `afade`) and video (`overlay`, `drawtext`, `fade`) streams.
3. **Map Whisper Timestamps:** Use the precise word-level start/end times from the local `faster-whisper` output to trigger `enable='between(t, START, END)'` in `drawtext` or `colorchannelmixer` (for B&W).
4. **Resolution Normalization:** Always normalize all inputs to 1080x1920 (9:16 aspect ratio) before compositing. Use `scale` and `crop` or `pad`.
</rules>
