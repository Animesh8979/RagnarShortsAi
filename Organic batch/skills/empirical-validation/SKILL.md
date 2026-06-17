---
name: empirical-validation
description: Requires proof before marking work complete — no "trust me, it works"
---

# Empirical Validation

<objective>
To ensure that all generated outputs, especially MP4 files from FFmpeg, are actually playable, perfectly synced, and error-free before they are handed off to the upload daemon.
</objective>

<rules>
1. **Never upload blindly.** Always use `ffprobe` to verify stream integrity of any output `.mp4` file.
2. **Validate duration match.** The audio stream duration must match the video stream duration.
3. **Validate visual output.** Check that the file size is non-zero and reasonable for the resolution and length.
</rules>

<process>
Execute `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <file.mp4>`
If it fails to parse, the file is corrupt. Fix the render pipeline before continuing.
</process>
