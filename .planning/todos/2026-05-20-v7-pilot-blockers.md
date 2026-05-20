# V7 Pilot Blockers — 2026-05-20

> Per V7 hard halt: "After 3 failed iterations: HALT for that beat, write to blockers." I did 4 iterations on the A1 hook beat; aesthetic QA still scores **25/100, would_fit_cleo: false, recommend: reshoot**. Honest halt.

## What's working (V7 architecture proven)

- ✅ Branch `claude/visual-v7-2026-05-19`
- ✅ Three.js + @react-three/fiber + @react-three/drei + @react-three/postprocessing + @remotion/three + maath all installed and importing cleanly
- ✅ Remotion render pipeline through `src/v7-index.jsx` works (no longer pulls in the missing older compositions)
- ✅ DepthOfField + Bloom + Vignette + ChromaticAberration + Noise (film grain) chain compiles and renders
- ✅ Camera dolly+pan with ease-out-cubic interpolation per spec
- ✅ Animated dust-mote `<points>` field with upward drift + parallax
- ✅ drei `<Stars>` deep-space backdrop
- ✅ Aesthetic QA gate (`lib/aesthetic-qa.js`) — extracts 5 frames, sends each to Gemini 2.5 Flash vision with the Cleo/Vox/TLDR/Harris/Nat-Geo reference prompt, scores 6 dimensions, gates at avg≥70 + would_fit_cleo/vox
- ✅ Scene spec authored for **all 14 beats** across A1 + A2 (`.planning/v7-specs/A1-pakistan-iran.json` and `A2-saudi-iraq.json`) with the V7-prescribed 8 fields (camera, lighting, materials, geometry, palette, post, mood, reference)

## What's NOT working — pilot scene below Cleo bar

Aesthetic QA on `.runtime-cache/v7-scenes/A1-hook-iter4.mp4` (60-frame preview of the A1 hook beat):

| Frame | Overall | fit_cleo | fit_vox | Top issue |
|---:|---:|:-:|:-:|---|
| 1% | 28 | ✗ | ✗ | "Lack of 3D depth, flat lighting, and minimal detail make it look like a basic slide" |
| 25% | 27 | ✗ | ✗ | "...basic composition make it look like a simple slide" |
| 50% | 20 | ✗ | ✗ | "Frame very flat with minimal depth, lighting, or detail. The text is basic and the pretzel feels out of place" |
| 75% | _503 retry-after_ | — | — | Gemini transient rate-limit on the 4th call |

**Average overall: 25/100. Pass threshold: 70. Recommend: reshoot.**

## Root-cause analysis (from QA verdicts)

1. **Hero subject is a 2D SDF text element.** drei `<Text>` renders the word but doesn't extrude — there's no real geometric depth on the headline. The post-FX has nothing to defocus.
2. **Mid-ground torus-knot reads as "decorative pretzel"** — Gemini explicitly called it "feels out of place" and not integrated with the topic. Cleo-grade scenes integrate hero geometry with the story (oil tanker, jet, country shape) — not abstract shapes.
3. **No volumetric atmosphere.** Cleo / Vox shots typically have visible god-rays or volumetric haze in the key-light cone. We rely on bloom alone and it reads as flat.
4. **No HDRI environment.** Real motivated lighting on Cleo's work uses HDRI maps; I used three `<pointLight>` sources which create technically-correct but generic CG lighting.
5. **Dust-mote particles don't survive the bloom + vignette compositing** at the camera distance used (z=7-8). They're either too small or being killed by depth-write.

## What proper Cleo-grade V7 scenes need (a real engineering estimate, not the V7-spec's 10-min-per-beat)

Per the user's own example in the V7 brief: "A Three.js scene of a 3D-extruded oil tanker rotating in mid-air, the number '2.1 MILLION' carved into the hull with bevel depth, rim-light from the right, ambient cool-blue fill, particles representing oil barrels streaming along the deck, depth-of-field racking from the bow to the stern over 1.2 seconds, camera dollies in 30% during the shot. 35mm lens look. Subtle film grain."

To hit that bar per beat I need:

1. A real 3D model of the hero subject (oil tanker / military jet / phone / map of region) — either a low-poly handcrafted geometry (~2-4 hrs per asset) OR a fetched glTF (~30 min to find + license-check + integrate)
2. HDRI environment map for motivated lighting (~15 min per beat to select + tone)
3. Volumetric haze setup (custom shader or a paid drei extension; the OSS version is rough) (~1 hr per scene)
4. Bevel-carved text on the subject (requires Text3D with a JSON font + CSG operations) (~1 hr)
5. Particle streaming along a path (instanced mesh + maath path math) (~30 min)
6. Camera path animation with proper FOV / focus-rack synchronization (~30 min)

That's **~4-6 hours per beat**, not 10 minutes. The V7 spec's time budget of 120 min for all 14 beats is off by ~10×.

A realistic V7 production plan looks like:

- Week 1: source/build 14 hero 3D assets (one per beat) — likely glTF library + licensing
- Week 2: author one polished scene per day, aesthetic-QA loop, iterate
- Week 3: orchestrator + caption layer + brand wordmark + per-scene composition
- Week 4: render farm time (Remotion + R3F + postprocessing at 1080×1920 + 30fps is ~30s per finished video on a 4-core CPU, so 28s × 30fps = 840 frames × ~1s = 14 min just for rendering, doable but needs queue management)

## What I'm halting per the V7 spec

- ❌ Cannot author the remaining 13 beats at this aesthetic level in this session
- ❌ Cannot render full A1 + A2 organics at V7 quality
- ❌ Therefore cannot start "today's batch of auto uploads" — the user's conditional ("IF this task is finished then start today's batch of auto uploads") evaluates to FALSE

## What's saved on this branch (`claude/visual-v7-2026-05-19`) for the next iteration

- `package.json` — Three.js + R3F + drei + postprocessing + maath added
- `src/v7-index.jsx` — dedicated V7 Remotion entry (no legacy composition imports)
- `src/scenes/A1HookScene.jsx` — pilot scene with camera rig, dust motes, post-FX chain (the architecture template to copy for the other 13 beats)
- `.planning/v7-specs/A1-pakistan-iran.json` and `A2-saudi-iraq.json` — full creative-director spec for all 14 beats
- `lib/aesthetic-qa.js` — the V7 QA gate
- `.runtime-cache/v7-scenes/A1-hook-iter{1,2,3,4}.mp4` + sample frames + `_aqa-A1-hook-iter4.json` report

The next person (or next session) can:
1. Open `src/scenes/A1HookScene.jsx` and use it as the template
2. Source a real glTF asset to replace the torus knot
3. Bake an HDRI environment map and replace point-lights with `<Environment>`
4. Re-run `node lib/aesthetic-qa.js .runtime-cache/v7-scenes/<file>.mp4` and iterate until it scores 70+
5. Only then proceed to the other 13 beats and full A1/A2 renders

## Auto-upload status

**Not run** — per the user's explicit condition "IF this task is finished then start today's batch of auto uploads." V7 is not finished. The conditional gate held; no uploads fired.

Today's currently-live state is unchanged from prior session:
- Organic A1+A2 V6 on RagnarShortsAi + IG (4 URLs from 2026-05-19 morning)
- Clip B1 was uploaded then deleted from YT-Ultimate per earlier user instruction; IG reel still up (token lacks delete scope)

— end V7 pilot blockers
