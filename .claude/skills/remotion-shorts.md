---
name: remotion-shorts
description: Remotion 4 composition + render knowledge for vertical 9:16 Shorts on a 4GB GPU box. Use when editing src/scenes/V8OrganicComposition.jsx, src/Root.jsx, or tools/v8-render-api.js — for caption animation, audio-reactive layers, beat transitions, grain, or render settings. Verified against remotion.dev 2026.
allowed-tools:
  - Read
  - Edit
  - Bash
---

You are the Remotion specialist for this pipeline. The organic visual is rendered via Remotion 4.0.436 + chrome-headless-shell through `tools/v8-render-api.js` (Node `renderMedia()` API, NOT the CLI). Composition: `src/scenes/V8OrganicComposition.jsx`, registered in `src/Root.jsx`.

## Official Remotion MCP (docs retrieval)
`@remotion/mcp` v1.0 (2026-01-21) indexes Remotion docs into a vector DB for accurate API answers. It does NOT render. To add for this machine (optional, operator runs once):
```
claude mcp add remotion-documentation -- npx @remotion/mcp@latest
```

## 4GB-safe renderMedia() options (apply to tools/v8-render-api.js)
```js
await renderMedia({
  composition, serveUrl, codec: 'h264', outputLocation: outFile, inputProps,
  concurrency: 1,                 // 1 tab = lowest RAM — REQUIRED on 4GB
  imageFormat: 'jpeg',            // jpeg << png memory
  jpegQuality: 80,
  videoBitrate: '5M',             // use videoBitrate OR crf, never both
  x264Preset: 'faster',
  offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024, // cap frame cache
  chromiumOptions: { gl: 'angle' },   // safest on GTX 1650 headless; 'swangle' if crashes
  timeoutInMilliseconds: 180_000,
});
```

## Retention techniques (all $0, Remotion 4 verified)
1. **spring() caption pop** (overshoot, replaces linear scale):
   `const pop = spring({ frame: frame - chunkStart, fps, config: { damping: 9, mass: 0.6, stiffness: 180 } });` then `scale(0.6 + 0.4*pop)`
2. **interpolate() camera punch** synced to beat boundaries:
   `interpolate(frame,[s,s+4,s+10],[1.0,1.12,1.05],{extrapolateRight:'clamp',easing:Easing.out(Easing.ease)})`
3. **Audio-reactive glow** (`@remotion/media-utils` already installed):
   `const bins = visualizeAudio({fps,frame,audioData,numberOfSamples:16,optimizeFor:'speed'});` low-freq energy drives shake/glow.
4. **@remotion/transitions** (install `@remotion/[email protected]`): TransitionSeries + slide()/wipe()/clockWipe() at linearTiming({durationInFrames:6}) = whip-pan cuts. NOTE: total duration = sum(sequences) - sum(transitions); pad beats by 6f/cut.
5. **@remotion/noise** grain (install `@remotion/[email protected]`): noise3D('grain', i*0.1, f*0.08, 0) drives low-opacity dots. NEVER use Math.random() in Remotion — use `random()` from remotion (deterministic across render).
6. **Story-dot progress bar** (no package): `interpolate(frame,[0,durationInFrames],[0,100])` width %.
7. **OffthreadVideo > Video** for embedded hero clips in render — FFmpeg frame extraction, frame-perfect, lower browser RAM. Use `trimBefore`/`trimAfter` (not deprecated startFrom/endAt).

## Hard rules
- $0, D:\ only (NPM_CONFIG_CACHE forced to D: via lib/env-d-drive-only.js).
- Always verify a composition change with ONE test render before a live batch:
  `node tools/v8-render-api.js <props.json> <out.mp4> <publicDir>`
- Never raise scale above 1 on the 4GB box.
- Match any new @remotion/* dep to the installed remotion version (4.0.436).
