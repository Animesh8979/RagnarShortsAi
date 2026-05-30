---
name: ffmpeg-recipes
description: ffmpeg recipes for this pipeline — platform-correct export specs (YT Shorts / IG Reels / TikTok), resize/crop to 9:16, compression, trim, concat, audio extract, fade, speed. Use for any ad-hoc ffmpeg media op. Adapted from digitalsamba/claude-code-video-toolkit's ffmpeg skill, stripped to local/free (no cloud GPU, no ElevenLabs, no Python).
allowed-tools:
  - Bash
  - Read
---

Pipeline ffmpeg reference. We use the bundled static binary — get its path with
`node -e "console.log(require('ffmpeg-static'))"`. All temp output goes under
`D:\anitgravity work\.runtime-cache\` (NEVER C:\). Source: adapted from
github.com/digitalsamba/claude-code-video-toolkit (`.claude/skills/ffmpeg`),
reduced to the local/free subset that fits our $0 / no-GPU / Windows constraints.

## Our canonical Shorts/Reels output spec (1080×1920, 30fps)
```
-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p"
-r 30 -c:v libx264 -profile:v high -level:v 4.1 -preset medium -crf 20
-pix_fmt yuv420p -c:a aac -b:a 160k -ar 44100 -ac 2 -movflags +faststart
```
This is exactly what `ig-uploader.js:optimizeVideoForInstagram` already enforces — reuse that for IG; YT accepts the same.

## Platform export targets (2026)
| Platform | Resolution | CRF / bitrate | Notes |
|---|---|---|---|
| YouTube Shorts | 1080×1920 | CRF 18-20 | ≤60s (Content-ID-claimed clips >60s get globally blocked — keep clips ≤59s) |
| Instagram Reels | 1080×1920 | bitrate 5M, faststart | AAC 44.1k stereo; ≤90s |
| TikTok | 1080×1920 | CRF 20 | ≤3min; avoid recycled-fingerprint (see lib/platform-variant.js) |
| X / Twitter | ≤1280 wide | target <15MB | re-encode smaller |

## Recipes (vertical 9:16)
- **Smart 9:16 center-crop** (fill, no bars): `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1`
- **Letterboxed 9:16** (whole frame visible): `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`
- **Trim**: `-ss <start> -i in.mp4 -t <dur> -c copy out.mp4` (re-encode if cut must be frame-exact: drop `-c copy`)
- **Concat (same codec)**: demuxer list file + `-f concat -safe 0 -i list.txt -c copy`
- **Concat (different)**: `concat` filter (see lib/cut-and-stack.js for the trim+concat graph)
- **Audio extract**: `-vn -c:a aac -b:a 192k -ar 48000 -ac 2`
- **LUFS normalize -14 (YT std)**: `-af loudnorm=I=-14:LRA=11:TP=-1.5` (already in daily-auto-v8 mux)
- **Fade in/out**: `-vf "fade=t=in:st=0:d=0.3,fade=t=out:st=<dur-0.3>:d=0.3"`
- **Speed (video+audio)**: `-vf "setpts=PTS/1.25" -af "atempo=1.25"`
- **First-frame poster/thumb**: `-ss <t> -frames:v 1 -q:v 2 thumb.jpg`
- **Scene-change detection** (clip moment hints): `-vf "select='gt(scene,0.3)',showinfo" -f null -` then parse `pts_time`

## Pipeline modules that already encapsulate these (prefer reusing)
- `lib/split-screen.js` — compose (split + full_frame_horror), adaptive EQ, brain-rot grade
- `lib/cut-and-stack.js` — multi-cut concat + SFX overlay
- `lib/platform-variant.js` — de-fingerprint IG variant (zoom+eq+audio-shift+re-encode)
- `lib/first-frame-hook.js` / `lib/seamless-loop.js` — retention post-FX
- `lib/auto-editor-compress.js` — silence-cut compression
- `ig-uploader.js:optimizeVideoForInstagram` — IG-safe transcode

## Hard rules
- Static binary via `require('ffmpeg-static')` — do not assume a system ffmpeg.
- All temp/output under D:\ (`.runtime-cache\`), never C:\.
- Re-encode (not `-c copy`) whenever a filter is applied or the cut must be exact.
- Use `videoBitrate` OR `crf`, never both.

## NOT pulled from the source repo (and why)
- `elevenlabs`, `acestep`, `ltx2`, `qwen-edit`, `runpod` skills → paid API or cloud GPU → violate $0 / no-card / local-GPU-ban. Excluded.
- `moviepy` skill + `op7418/Youtube-clipper-skill` → require a Python install (not present on this box). Excluded until Python is set up (operator decision).
- `remotion` skill → we already have the richer `remotion-shorts` skill.
