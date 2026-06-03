# V10 → 95/100 QA — the execution-ready plan (L114)

**Bar (user, 2026-06-03):** every batch render must score **95/100** on the Gemini-vision
art-director QA. "Brutal deep changes as needed." Research GitHub + HF for the best $0
resources each time.

## The single most important finding this session (don't relearn it)

**Single-still QA is UNRELIABLE — use the VIDEO-QA loop.**
- Isolated scene stills score **25–38** no matter how good, because: (a) a still caught
  mid-`TransitionSeries` shows TWO scenes' text dissolving over each other ("overlapping
  text glitches"), and (b) a still can't see motion / depth-through-parallax.
- The **moving video** of the same V9 content scored **60**. The video is the truth.
- ⇒ Verify V10 by rendering a SHORT VIDEO (e.g. 4–6 s) and running `lib/render-qa.js` on
  the MP4 (it samples 4 frames across motion), NOT by scoring single stills. Pick QA
  frames at scene CENTERS (away from transition boundaries) if sampling stills at all.

## What's already built (the V10 foundation — committed)

`src/scenes/V10CinematicComposition.jsx` (registered behind `ORGANIC_CINEMATIC=1`,
V10→V9→V8 fallback). Consumes the SAME props as V9 (`directorPlan.beats` +
`wordBoundaries`). Has: inlined design tokens (color/type/spacing/motion), Anton+Oswald
google-fonts, a layered z-stack (`CinematicPlate` depth bg + director-driven `cameraFor`
moves + `Atmosphere` grain/vignette/light-leak/grade), `TransitionSeries` (no hard cuts,
cutType→presentation), 4 scenes (threat-map / portrait / data / presenter), clean layout
zones (headline top-third, content mid, captions lower-third), token caption glass-pill.
Deps installed: `@remotion/transitions|motion-blur|noise|google-fonts` @4.0.436.

## The 95 lever — REAL cinematic imagery + compositing (not layout tweaks)

The QA rewards photographic depth + atmosphere + a designed system. The procedural plate
scores low ("generic background"); hero footage renders (3.18 MB frames) but reads flat.
The gap to 95 is a real cinematic PLATE behind every scene + the subject composited INTO
it. All $0/CPU or free-API:

1. **FLUX cinematic background per scene** (NVIDIA NIM, already wired in `lib/hero-visual.js`).
   Use each beat's `directorPlan.beats[i].backgroundWorld` as the prompt (e.g. "situation
   room, satellite war map, cinematic teal-orange, volumetric light"). Stage to
   `.runtime-cache/v8-public/v10-bg/` and pass as `beat.bgImage` → `CinematicPlate`.
2. **RMBG-1.4 subject cutout** (HF, CPU onnx) — `lib/rmbg-cutout.js` + `tools/rmbg.py`,
   model to `D:/AI_Tools/rmbg`. Leader portrait → transparent PNG → parallax foreground.
3. **Relight the cutout to match the bg** (the "shot-in-place" cue the QA loves) — free HF:
   **IC-Light** / **jasperai LBM_relighting** / **Flux-Kontext-Relight** Spaces, or a CPU
   color-transfer + contact-shadow + atmospheric-haze pass between depth planes.
4. **True 2.5D depth motion** — reuse `lib/parallax-generator.js` (Depth-Anything V2 +
   multi-plane displacement, RealMotion Tier-1): FLUX still → depth map → 3–5 displaced
   planes → camera moves THROUGH the scene (not Ken-Burns on a flat plate). #1 "dump" fix.
5. **Beat-synced edit + sound design** — `lib/peak-detector.js` to land cuts/transitions on
   a free cinematic music bed's beats; risers into hooks; impacts on cuts; sidechain-duck
   under VO (`lib/sfx-library.js`, ffmpeg).
6. **Choreographed kinetic type** — key phrases scale/track/mask-reveal synced to VO word
   timings (beyond karaoke). Selective `@remotion/three` 3D globe on hook+payoff only.

## Build/verify order (each step VIDEO-QA-verified, target ≥ the prior score)

1. Wire FLUX `bgImage` per scene into `CinematicPlate` + stage from `backgroundWorld`.
   Render a 5-s V10 video of one organic → `node lib/render-qa.js <mp4>`. Expect the
   biggest jump here (procedural→photographic).
2. Add RMBG cutout + relight + contact shadow on portrait scenes. Re-QA.
3. Wire 2.5D depth-plane camera move into `CinematicPlate` (reuse parallax-generator). Re-QA.
4. Beat-synced music edit + sound design. Re-QA.
5. Kinetic type + selective 3D hero. Re-QA.
6. When a full V10 organic video scores ≥ target on the wired QA, gate `ORGANIC_CINEMATIC=1`
   in the batch (V10→V9→V8 fallback stays). 95 is the bar; iterate the QA loop to it.

## $0 resources (verified this session)

- Remotion: `remotion-best-practices` skill (skills.sh/remotion-dev), `@remotion/transitions`,
  cinematic-tech-intro prompt (spring physics, glassmorphism, grain, accent palette, depth stack).
- HF relight: IC-Light, `jasperai/LBM_relighting`, Flux-Kontext-Relight (Spaces, free).
- HF depth: Depth-Anything V2 (already local via parallax-generator). RMBG-1.4 (cutouts, CPU).
- Images: NVIDIA NIM FLUX (free, wired). LLM: Gemini ladder (`lib/gemini-call`) + Groq + Nemotron.

## Hard lessons (don't repeat)

- **NEVER `npm install` or edit pipeline files while a batch is rendering** — it rewrote
  node_modules under the live process and KILLED the 2026-06-03 batch mid-clips. Do dep/
  pipeline changes only when no batch is running. (V10 files are safe to edit during a
  batch ONLY because the batch renders organics on V9, not V10 — but heavy concurrent
  RENDERS still contend for CPU/GPU, so defer V10 video-QA until the batch is idle.)
- Transient RSS "0 trending" → organic 0/0. FIXED: `daily-fresh-batch` now retries 3× +
  curated geopolitics seed fallback.
