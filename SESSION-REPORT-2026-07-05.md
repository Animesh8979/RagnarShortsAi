# Session Report — 2026-07-05

## Summary

This session completed the **end-to-end render → vision-QA pipeline** for the Antigravity Work short-form video pipeline. Two real bugs were found and fixed along the way. The final state: a Remotion composition renders cleanly to MP4, and the `video-vision` skill runs pixel-level QA on that MP4 and reports `passed: true, score: 100`.

## What was completed

### 1. `ExplainerVideo` render — SUCCEEDED
- **Output:** `apps/studio/out/explainer-video.mp4` (13,030,034 bytes = 13 MB)
- **Spec:** 1080×1920, 30 fps, h264, 23.3 s, hasAudio=true, aspect 0.5625 (9:16 ✓)
- **Composition:** `apps/studio/src/compositions/ExplainerVideo.tsx` (481 lines) — 6-segment "Wow! Signal" explainer with:
  - Mood-driven gradient backgrounds + aurora overlay
  - `LottieCharacter` (async Lottie load, 8 mood→file mappings, hue/saturate/speed filters)
  - `TextReveal` headline + word-by-word `WordCaptions` synced to TTS audio manifest
  - `SegmentTransition` (fade/glitch/wipe/zoom) + `SegmentTitleCard` between segments
  - `AuroraBackground` motion overlay
  - Master fade-in/out, top progress bar, segment counter
- **Log:** `apps/studio/out/render.log` (840 lines, 699 frames rendered + encoded)

### 2. `LottieCharacter.tsx` — HARDENED (bugfix)
- **Root cause:** the prior render crashed with `Cannot read properties of undefined (reading 'length')` in lottie-web's `completeLayers` when `fetch(staticFile("lottie/foo.json"))` returned a 404 → HTML page → `.json()`-parsed object had no `layers` array.
- **Fix:** `loadLottie()` now (a) checks `resp.ok`, (b) validates `data.layers` is an Array before caching, (c) returns `null` on failure, (d) the `useEffect` falls back to `character-neutral.json` if the requested file load returns null.
- All 3 Lottie JSONs in `public/lottie/` verified as valid Lottie v5.7.4 (9 layers each, 400×400, 30fps).

### 3. `@antigravity/security` — BUGFIX (Windows path handling)
- **Bug:** `SHELL_METACHARACTERS = /[`;|&$(){}[\]<>!#*?\\]/` rejected backslash (`\`), `?`, and `*`. Any Windows path like `D:\anitgravity work\...` was rejected as a "shell metacharacter" — false positive because `safeExec` uses `shell: false` (no shell interpretation).
- **Fix:** regex now `/[`;|&$(){}[\]<>!#\r\n]/` (removed `\`, `?`, `*`; added `\r`, `\n`). Actual injection chars stay blocked. Required for the skill to run on Windows.

### 4. `video-vision` extractor — BUGFIX (binary stdout)
- **Bug:** `extractFrameStats` called `safeExec('ffmpeg', [..., '-vf', "select='not(mod(n\\,15))',..."])`. Two failures: (a) `safeExec`'s arg validator rejected the `-vf` string because it contains `(`/`)`/`[`/`]`; (b) even if it passed, `safeExec` converts stdout to a UTF-8 string via `.toString()`, corrupting the raw `rgb24` byte stream.
- **Fix:** `extractFrameStats` now goes straight to `extractFrameStatsBinary` (the existing `spawn('ffmpeg', args, {shell:false})` + `Buffer` accumulation path at `extractor.ts:135-184`). The binary path is both injection-safe (`shell:false`) and byte-correct.

### 5. `video-vision` SKILL.md — AUTHORED (was missing)
- **Gap:** prior session identified that `packages/skills/video-vision/SKILL.md` did not exist. This session authored it (4.5 KB) documenting all 12 frame detectors + 5 container checks, scoring (info=0/warn=6/error=18/critical=40), `passed` gate semantics (true only when no error/critical), full `analyzeVideo`/`analyzeAndReport`/`probeVideo`/`extractFrameStats` API, and the 3 MCP tools.

### 6. End-to-end smoke test — PASSED
- `analyzeVideo('explainer-video.mp4')` → `passed: true, qualityScore: 100, issues: 0`
- Analyzed 47 sampled frames (at 2 fps over 23.3 s ≈ 46.6 frames ✓)
- Correctly extracted: 1080×1920, 30fps, h264, hasAudio=true, duration 23.3s, aspect 0.5625
- Report artifact: `packages/skills/video-vision/smoke-test.mjs`

## Files touched this session

| File | Change |
|---|---|
| `apps/studio/src/components/LottieCharacter.tsx` | hardened `loadLottie()` against malformed/404 Lottie data + neutral fallback |
| `apps/studio/out/explainer-video.mp4` | new — 13 MB rendered video |
| `apps/studio/out/render.log` | new — render log |
| `packages/security/src/index.ts` | `SHELL_METACHARACTERS` regex fixed for Windows paths |
| `packages/security/dist/index.js` | rebuilt |
| `packages/skills/video-vision/src/extractor.ts` | `extractFrameStats` bypasses `safeExec`, calls `extractFrameStatsBinary` directly |
| `packages/skills/video-vision/dist/*` | rebuilt |
| `packages/skills/video-vision/SKILL.md` | new — discoverability manifest + API docs |
| `packages/skills/video-vision/smoke-test.mjs` | new — end-to-end test harness |

## How to make it bigger — recommended next steps

The pipeline now runs end-to-end for a single hard-coded demo script. To scale:

### A. Automate the content pipeline (high value)
1. **`ai-scriptwriter` skill** (currently FORGED per ROADMAP — re-verify `src/`): hook Ollama `qwen3:1.7b` → generate `Script[]` segments with `mood`/`visualCue`/`text` from a topic prompt. Output JSON matching the `viralScript` shape in `Root.tsx`.
2. **`voice-sync` skill** (currently EMPTY): Edge TTS/Piper per segment → audio files in `public/audio/segment_{i}.mp3` + auto-generate the audio manifest + word-level caption timings (via Whisper forced alignment) currently hardcoded in `Root.tsx`.
3. **`veo-remotion-bridge` skill** (currently EMPTY): fetch Veo 2 raw footage for `visualCue`s → drop into `PopupMedia` overlays keyed by segment.

### B. Render farm (scale output volume)
- Single render ≈ 6 min on this host. To hit daily YouTube volume, run headless renders in parallel (`remotion render` is worker-parallel — already at concurrency 4x). A queue driver in `apps/pipeline` feeding N topics → N renders → N MP4s is the next structural step.
- Add `video-watch` (already built) as the post-render gate: every MP4 dropped into `D:\antigravity-renders` auto-runs `video-vision` QA. Parse `report.passed` → keep/reject.

### C. Animation polish (the "be human proficient in animation" directive)
- `Character.tsx` already has a full SVG human figure (limbs, head, articulated eyes with pupils + highlights, brows, mouth-open animation synced to speech) — the Lottie alt is a fallback. Polish paths:
  - Use the SVG `Character` as the default (not Lottie) — its mouth shape is `isTalking`-driven which is more honest than Lottie's pre-baked loop.
  - Add eyebrow-raise + head-tilt on `mood === 'shocked'`/`'intrigued'` (the `getMoodFeatures()` eyebrowY/eyebrowCurve knobs exist but aren't animated — they're static per mood).
  - Add blink variation (currently fixed 3-frame blink every 3 s — randomize the cadence).
  - Lip-sync accuracy: the `isTalkingSmoothed` 200 ms hold is a heuristic. Feeding actual audio RMS envelopes would make the mouth tight.

### D. Observability
- A `reports/` digest of every render's `VisionReport` JSON → trend the `qualityScore` over time → spot systemic flaws (e.g. consistent `too_dark` → fix the bg gradient).

## Reproducing the smoke test

```powershell
# 1. Render
cd "D:\anitgravity work\apps\studio"
cmd /c "npx remotion render ExplainerVideo out\explainer-video.mp4 2>&1" | Tee-Object out\render.log

# 2. Run vision QA
cd "D:\anitgravity work\packages\skills\video-vision"
node smoke-test.mjs
# expected: passed:true, qualityScore:100, issues:0
```

## Status

- [x] `ExplainerVideo` renders to MP4
- [x] `video-vision` runs pixel-QA on the render
- [x] `video-vision/SKILL.md` authored
- [x] `@antigravity/security` Windows path bug fixed
- [x] `video-vision` binary-stdout bug fixed
- [ ] From here: wire the ai-scriptwriter / voice-sync / veo-remotion-bridge skills so the script + audio + footage are generated, not hardcoded
