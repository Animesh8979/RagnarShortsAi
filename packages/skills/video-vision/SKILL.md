# Video Vision — Pixel-Level Render Flaw Detection

**Purpose**: Diagnose VISUAL render flaws by analyzing actual frame pixels — black/freeze frames, letterbox/pillarbox bands, brightness/clipping/drift, desaturation, flicker, low-contrast text overlays. Complements `video-watch` (which only checks container metadata).
**Triggers**: On-demand via `analyzeVideo()`, or as an MCP server (`analyze_video`, `get_video_info`, `extract_frames_debug`).

## What It Checks

### Container checks (via ffprobe)
| Check | Threshold | Severity |
|---|---|---|
| Tiny file | < 10 KB | critical |
| Missing audio | no audio stream | error |
| Zero duration | duration = 0 | critical |
| Aspect ratio wrong | dev > 3% warn, > 8% error (target 0.5625 = 9:16) | warn / error |
| Duration mismatch | mean > ±5% tolerance of expected | warn |

### Frame detectors (per-frame pixel stats, sampled at 2 fps, width 320)
| Detector | Threshold | Severity |
|---|---|---|
| `black_frame_opening` / `black_frame_closing` | mean luma < 8 at start/end | error |
| `freeze_frame` | std < 1.5 && mean/std delta < 1.0, span > 1.2 s | warn → error if long |
| `letterbox_bands` | edge luma < 12 on all 4 sides for > 60% of frames | warn |
| `pillarbox_bands` | left/right < 12 && top/bottom > 40 for > 50% of frames | warn |
| `too_dark` | median mean luma < 25 | warn |
| `too_bright` | median mean luma > 240 | warn |
| `brightness_drift` | \|firstQ − lastQ\| > 60 | warn |
| `white_clipping` | whiteRatio > 0.4 for > 30% of frames | warn |
| `black_crush` | blackRatio > 0.6 for > 30% of frames | warn |
| `desaturated` | median saturation < 0.08 | warn |
| `text_low_contrast` | \|edgeTop − mean\| < 18 && topLuma > 80 for > 40% of frames | warn |
| `flicker` | > 30% of inter-frame deltas exceed 50 | warn |

### Scoring
- Penalty per issue: `info=0`, `warn=6`, `error=18`, `critical=40`.
- `qualityScore = clamp(100 − Σ penalties, 0, 100)`.
- `passed = true` only when no `error` or `critical` issues are present (`info`/`warn` do not block the gate).

## Usage

```typescript
import { analyzeVideo } from '@antigravity/sk-video-vision';

// Full analysis (container + frame flaws)
const report = await analyzeVideo('D:\\antigravity-renders\\clip.mp4', {
  sampleFps: 2,             // sample 2 frames per second of source
  analysisWidth: 320,       // downscale to 320px wide for speed
  expectedAspectRatio: 0.5625,  // 9:16
  expectedDurationSec: 23,
  durationTolerance: 0.05,
  checkTextLegibility: true,
});

if (!report.passed) {
  console.error('Render failed QA:', report.issues);
} else {
  console.log('Quality score:', report.qualityScore);  // 0-100
}

// Write a JSON report next to the video
import { analyzeAndReport } from '@antigravity/sk-video-vision';
await analyzeAndReport('D:\\clip.mp4', 'D:\\clip.vision.json');

// Lower-level: just probe metadata (cheap, no frame extraction)
import { probeVideo } from '@antigravity/sk-video-vision';
const meta = await probeVideo('D:\\clip.mp4');

// Lowest-level: raw per-frame stats (luma, std, 16-bin histogram, 4 edge bands)
import { extractFrameStats } from '@antigravity/sk-video-vision';
const frames = await extractFrameStats('D:\\clip.mp4', { sampleFps: 2, analysisWidth: 320 });
```

## MCP Tools

Run as an MCP server (stdio) for tool-using agents:

| Tool | Args | Returns |
|---|---|---|
| `analyze_video` | `{ path, options? }` | full `VisionReport` |
| `get_video_info` | `{ path }` | container metadata |
| `extract_frames_debug` | `{ path, sampleFps?, analysisWidth? }` | raw `FrameStats[]` |

## Dependencies

- `ffmpeg` + `ffprobe` on PATH (winget Gyan.FFmpeg build on this host)
- `@antigravity/security` — `safeExec` for ffprobe (text stdout)
- `@antigravity/utils` — `logger`, `writeFile`
- `@antigravity/config` — `validateDrivePath` (D: drive enforcement)

## Notes

- **No OpenCV / no native deps** — frame stats (luma, std, 16-bin histogram, 4-edge-band luma, saturation) are computed in pure JS from a raw `rgb24` stream piped from ffmpeg. The extractor spawns `ffmpeg` directly with a `Buffer`-accumulating stdout handler (NOT `safeExec`, which would UTF-8-corrupt the raw bytes — see `extractor.ts:133-184`).
- Sample rate is **2 fps by default** — detectors are tuned for that spacing (e.g. `freeze_frame` needs > 1.2 s of consecutive frozen samples).
- The `passed` gate is intentionally **soft on `warn`** — warnings nudge toward re-render without hard-failing the pipeline; only `error`/`critical` issues block.
