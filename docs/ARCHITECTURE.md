# ARCHITECTURE — Ragnar autonomous Shorts/Reels factory

_Canonical map of the $0 / D:\-only / CPU-or-free-cloud / no-GPU pipeline.
Last updated 2026-06-02 (L112 shipped; L113 GODMODE planned)._

## System

A Node orchestrator produces a daily batch across **two isolated lanes** → **4
channels**, fully automated, $0 (no card). Hard constraints: **$0 / no-card · D:\
only (no C:\ writes except Claude memory) · CPU-only or free cloud API · NO
local-GPU generative model (ComfyUI/Forge PERMANENTLY BANNED) · Node orchestrator
· commercial-safe licenses · no silent fallbacks (JSONL every failure) ·
clipping↔organic isolation · never unlist/delete live good content.**

| Lane | YT channel | IG account | Content |
|---|---|---|---|
| **Organic** | RagnarShortsUltimate | @ragnar_ultimate007 | geopolitics (hard-locked) |
| **Clip** | RagnarShortsAI | @ragnarautomated | funny moments from high-end streamers |

Entry: `lib/daily-fresh-batch.js` runs both lanes in parallel (`Promise.allSettled`),
render-only by default; `lib/auto-upload-fresh.js` chains uploads (4h gaps,
4-channel routing, platform-unique masters). `--auto-upload` or a separate
`auto-upload-fresh` run fires the live uploads.

## Organic lane (geopolitics → RagnarShortsUltimate + IG)

1. **Topic**: `trend-finder.js` / `lib/trending-news.js` → niche-locked to
   geopolitics by `config/channel-niches.json` (`matchKeywords`); `lib/script-from-trending.js`
   writes the script (humanization gate + L108 virality gate), LLM via
   `provider-router` (nvidia-nemotron → groq → gemini-2.5-flash → …).
2. **Voice**: `lib/kokoro-tts.js` (Kokoro-82M, CPU, am_michael, speed 0.9), Edge TTS fallback.
3. **Hero visuals**: `lib/hero-visual.js` → FLUX still (NVIDIA NIM) → parallax;
   `lib/person-portrait.js` resolves REAL Wikimedia portraits for named leaders.
4. **Render — V9 story-motion (PRIMARY, L112)**: `lib/daily-auto-v8.js` builds a
   **director plan** (`lib/director-plan.js`) that reads each beat's words and
   routes it to a content-true scene, then renders `src/scenes/V9StoryMotionComposition.jsx`
   via `tools/v8-render-api.js` (Remotion + chrome-headless-shell). Gated by
   `ORGANIC_STORY` (default on; `=0` reverts to `V8OrganicComposition`).
   - **Scenes**: `RealMapScene` (real countries named in the line → labeled pins +
     animated strike-arc, region auto-zoom, via `lib/geo-coords.js`),
     `LeaderPortraitScene` (real portrait + news chyron), `PresenterScene`
     (talking-anchor "Ragnar", word-synced mouth), `EvidenceScene` (footage + a
     matched data board: `StakesMeter`/`DeathTollLedger`/`FundingFlow`/…).
   - Captions: per-word karaoke (yellow power-words, spring pop-in). `ProgressBar`.
5. **Post**: `lib/retention-postfx.js` (first-frame muted hook + seamless loop);
   audio mux + LUFS −14.

## Clip lane (funny streamers → RagnarShortsAI + IG)  — funny · trending-daily · no-repeat

1. **Discovery — trending dailies**: `lib/trending-clips.js:discoverHdClips`.
   `listPlaylistRecent(creator,n)` pulls each pool creator's **most-recent uploads**
   (`--playlist-end`), full-extracts real view counts, sorts **most-viewed-recent
   first = the trending pick**. HD/quality-gated.
2. **Funny creator ranking**: `lib/clip-creator-ranker.js` —
   `combined = perfWeight·(live AVD×views) + trendWeight·freshness + brainrotWeight·funnyScore`.
   `config/channel-niches.json:clip.brainrotScores` is the FUNNY prior (IShowSpeed/
   Kai/Adin/Moist/KillTony/TheoVon high; gossip/politics low). Self-converges on
   what gains views.
3. **No repeats**: `loadAlreadyClippedUrls()` (reads `renders/fresh-batch-*.json`)
   → any already-clipped video URL is skipped (`[dedupe] skipping already clipped…`).
4. **Funny moment selection (L112)**: `lib/clip-moment-selector.js` transcribes
   candidate windows (local faster-whisper) and LLM-scores each on **viral + humor**;
   `CLIP_HUMOR_TARGETING` (default on) weights humor 55% so the **funny** moment is
   picked, not just the loudest. Audio peaks (`lib/peak-detector.js`) seed candidates.
5. **Cut**: `lib/cut-and-stack.js` (L109 cut-on-peak; podcast = 4–6 gentle cuts,
   chaos/horror = 8–14; ≤1 vine-boom on the loudest peak). Coherence gate.
6. **Compose**: `lib/split-screen.js:compose(mode)`:
   - `full_frame_reframe` (L112, talking podcasts) → **active-speaker auto-reframe**
     (`tools/speaker-reframe.py`, OpenCV Haar face-track → smoothed 9:16 crop that
     follows the talker; `CLIP_SPEAKER_REFRAME`, default on; center-crop fallback).
   - `full_frame_horror` (gameplay/horror) → center-crop.
   - `split_screen` (legacy) → a-roll + subway-surfers b-roll.
   - All get brain-rot grade + karaoke + reaction-commentary caption track.

## Upload (`lib/auto-upload-fresh.js`)

4-channel routing (organic→RagnarShortsUltimate+@ragnar_ultimate007;
clip→RagnarShortsAI+@ragnarautomated), 4h gaps (`--gap-min 240`), platform-unique
masters (`lib/platform-variant.js`), IG carousels (`lib/carousel-formats.js`).
`--organic-only` / `--clips-only` run lanes independently. **L112 fix**: when
`ORGANIC_STORY≠0` the V9 render IS the primary, so the motion-sidecar requirement
is auto-satisfied (no `-v9-motion` sidecar needed) — fixed in the
`requireOrganicMotion` gate.

## Key env flags
`ORGANIC_STORY=1` (V9 organic primary) · `CLIP_SPEAKER_REFRAME=1` (reframe) ·
`CLIP_HUMOR_TARGETING=1` (funny moments) · `L109_CUT_ON_PEAK=1` · `L109_SFX_LAYER=1` ·
`L110_MOMENT_SELECTOR=1` · `L110_WHISPER_LOCAL=1`. QA tool: `tools/render-still.js`.

## Analytics + learning
`refresh-youtube-analytics.js` + `lib/ig-metrics.js` → `lib/analytics-feedback.js`
(`predictPerformance`) → `lib/prompt-evolution.js` (evolves STYLE_NOTES).
`lib/velocity-watch.js` spike detection → `lib/priority-batch.js`.
`lib/comment-harvester.js` + `youtube-engagement.js` (community loop).

## L113 GODMODE (planned — see `docs/GODMODE-PLAN-L113.md`)
The data wall is **engagement** (saves/shares/comments ≈ 0), not quality. Committed bets:
1. **Ragnar = ownable CARTOON character / serialized show** — `PresenterScene` →
   Rive cartoon rig (`assets/ragnar.riv`, `@remotion/rive`) + FLUX war-room + Rhubarb
   lip-sync (`D:\AI_Tools\rhubarb`); `lib/ragnar-persona.js` + `lib/story-thread.js`.
2. **Simulation flagship** — `lib/scenario-writer.js` → `SimulationScene` (animated
   geopolitical "what-if" maps). Category-of-one.
3. **Self-improving bandit** — `lib/variant-bandit.js` (K hook/title/thumbnail
   variants → first-hour retention+saves → auto-evolve).
4. **Engagement flywheel** — debate-CTA + "save this" + auto-comment-reply loop.
Foundation fixes: V9→V8 render fallback (never drop an organic), bake upgrade envs
into the scheduled run, purge Hindi-horror diaries off the geopolitics channel.
