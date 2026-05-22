# Next Batch Checklist — 2026-05-22

Branch: `claude/suppression-recovery-2026-05-22` (sibling of master-rebuild; no main commits).

## User constraint (verbatim, 2026-05-22)
> "dont delete or unlist just make changes from today's new batch with new scripts and all"
> "and start the batch after everything and make sure all the trending clips gets clipped and trending news gets good visualisation and captions with script"

**Interpretation:**
- Yesterday's V8 batch (4 URLs) stays live untouched. No unlist, no delete.
- Phases A–F + RealMotion ship as code changes only.
- A fresh batch fires from the repaired pipeline:
  - Trending news → fresh scripts via provider-router LLM cascade → FLUX+parallax visuals → ONE caption layer → upload.
  - All trending creator clips → split-screen with Subway Surfers b-roll → upload.

## What's already live (do not touch)
| Asset | YouTube | Instagram |
|---|---|---|
| A1 Pakistan-Iran V8 | https://www.youtube.com/shorts/F_kvfZJ0sk4 | https://www.instagram.com/reel/DYnWMXZj0Eu/ |
| A2 Saudi-Iraq V8 | https://www.youtube.com/shorts/dsfHx2l9vgA | https://www.instagram.com/reel/DYndNaEEq5_/ |
| B1 100-Pilots emotional | https://www.youtube.com/shorts/5dNOzIgN04s | https://www.instagram.com/reel/DYnkTxSkWv-/ |
| B2 100-Pilots final rounds | https://www.youtube.com/shorts/ieUJFlbixuQ | https://www.instagram.com/reel/DYnrSQiivKE/ |

YT `publicStatsViewable=false` is already set on all four (likes/views hidden). IG hide-engagement-counts requires `instagram_manage_comments` scope — current token doesn't have it; the next-batch path will retry with the upgraded scope when token is re-minted.

## Changes shipped this branch

### Phase A — Model cascade repair (✅ done)
- All hardcoded `gemini-2.5-*` references replaced with `gemini-1.5-flash` defaults in `v12-factory.js`, `story-engine.js`, `script-providers.js`, `hook-optimizer.js`, `lib/aesthetic-qa.js`, `image-providers.js`, `lib/provider-router.js`.
- `.env` adds: `AESTHETIC_QA_MODEL`, `GEMINI_VISION_JUDGE_MODEL`, `GEMINI_STORY_QUALITY_MODEL`, `GEMINI_STORY_SECONDARY_MODEL`, `GEMINI_SCRIPT_SECONDARY_MODEL`, `GEMINI_SCRIPT_QUALITY_MODEL` — all defaulted to 1.5 family.
- `v12-factory.js` `createFallbackPayload` path is **HARD-BLOCKED** when `HALT_ON_PROVIDER_EXHAUSTION=1` (set in `.env`). The factory throws `script_providers_exhausted_halted` instead of emitting near-identical metadata — eliminates the #1 root cause of YouTube Repetitive Content suppression.

### Phase B — Duplicate-content guard (✅ done)
- `content-dedupe.js` lookback widened to 14 days via `CONTENT_DEDUPE_DAYS=14`. Jaccard threshold lowered to `CONTENT_DEDUPE_JACCARD_MIN=0.6` (configurable).
- New `lib/metadata-uniqueness.js`:
  - `recordUploadedMetadata({ videoId, channel, platform, title, description, tags })` writes to `renders/analytics/uploaded-metadata-ledger.json`.
  - `assertMetadataUnique({ title, description, tags })` blocks uploads whose Levenshtein-normalized title or first-sentence-description similarity is ≥ (1 − `METADATA_UNIQUENESS_MIN`), defaulting to 0.6 — title/description/tags must differ ≥40% from any upload in the last 14 days.
- `yt-uploader.js` and `ig-uploader.js` call `assertMetadataUnique` **before** any API call and `recordUploadedMetadata` on success.

### Phase C — Instagram hosting via cloudflared tunnel (✅ done)
- New `lib/local-media-server.js` — token-gated MP4 server on port `LOCAL_MEDIA_SERVER_PORT=4733`. `mintShareUrl(absPath)` registers an absolute path under a sha1 token. Supports byte-range requests (Meta requires this).
- New `lib/cloudflared-tunnel.js` — wraps `cloudflared.exe tunnel --url http://localhost:4733`. Retries up to 3× with exponential backoff. Returns `{ url, child, close }`.
- New `lib/cloudflared-tunnel-singleton.js` — per-process singleton wrapping the two; auto-cleans on exit.
- `ig-uploader.js` prefers cloudflared tunnel when `INSTAGRAM_PUBLIC_HOST_MODE=cloudflared` (default). Catbox/Litterbox/Gofile path now requires explicit opt-in via `options.allowAnonymousHostFallback = true` — Meta's anonymous-host downrank is bypassed.

### Phase D — `provider-access.js` adapter (✅ done)
- New `provider-access.js` is a **thin adapter** over `lib/provider-router.js` + `circuit-breaker.js`. Exports `getProviderState`, `recordProviderFailure`, `recordProviderSuccess`, `buildProviderReachabilityReport`.
- Family → router-providers map (huggingface, gemini, nvidia, groq, pollinations, etc.) so legacy callers (`image-providers.js`, `cartoon-factory.js`) work unchanged.
- Circuit-breaker state persists to `renders/analytics/circuit-breakers.json` (shared across Node processes — verified: failure in one process is visible to a fresh process).

### Phase E — `hero-visual.js` wired into live render path (✅ done — V8 path)
- `lib/daily-auto-v8.js` (the next-batch orchestrator) already calls `hero.heroVisual()` per beat — every organic short gets NVIDIA FLUX still → parallax animate.
- `lib/daily-clip-v8.js` uses `lib/split-screen.js` with the new A-roll permanent fixes (blurred-fill + adaptive EQ + unsharp, b-roll untouched).
- v12-factory.js legacy news lane is NOT wired — tomorrow's batch goes through V8 only.

### Phase F — Next-batch checklist (this file, ✅ done)
- This document captures the no-unlist constraint + next-batch plan.
- No uploads from this build other than the explicit next-batch run.

### RealMotion Tier-1 — Depth-Anything V2 parallax (pending)
- Replace 1%-strength parallax with multi-plane depth-displacement (8–15% camera move, target frame-diff 8–25/255).
- Status: PENDING — `lib/parallax-generator.js` rewrite incoming.

### RealMotion Tier-2 — Cloud i2v on hero beats (pending)
- For beat 0 + climax beat per video: NVIDIA Cosmos → HF LTX → HF Wan → FAL i2v via `route('motion_video')`.
- Status: PENDING — provider wiring incoming.

## Next-batch run plan (after RealMotion ships)

```
# Trending news lane (organic, → RagnarShortsAi)
node lib/trending-fetch.js              # fetch RSS + rank topics
node lib/script-from-trending.js        # write ~80-word scripts via provider-router
node lib/daily-auto-v8.js               # render with FLUX+parallax+RealMotion
node upload-v8-organic.js A1
node upload-v8-organic.js A2

# Trending clipping lane (creators, → RagnarShortsUltimate)
node lib/trending-creator-fetch.js      # discover trending creator videos (yt-dlp)
node lib/daily-clip-v8.js               # split-screen all candidates with A-roll fixes
node upload-v8-clip.js B1
node upload-v8-clip.js B2
node upload-v8-clip.js B3               # if more than 2 viable clips ranked
```

`upload-v8-batch.js` can serialize all of the above with the 1h gap (or skip the gap by `--gap-min 10` once Phase B uniqueness gates are exercised).

## TTS pace
- Edge TTS rate is now **+15%** (was +25% in the just-shipped fresh batch). At GuyNeural this lands ~140 wpm — natural newscast cadence, not rushed. Captions auto-sync because they read from Edge's word-boundary events (slower rate → wider boundary spacing).
- Script target word count was lowered from 78-82 → **72-76 words** so total video duration stays ~31s at the slower pace.
- To slow further: set `ttsRate` to `+10%` (≈132 wpm) or `+5%` (≈125 wpm) in `lib/daily-fresh-batch.js`.

## Gates to pass before tomorrow's run
1. ✅ `grep -rn 'gemini-2\.5' --include='*.js'` returns only comments (no live calls).
2. ✅ `node -e "require('./lib/metadata-uniqueness')._testReset(); ..."` confirms duplicates block.
3. ✅ Local media server returns 206 partial content for range requests.
4. ✅ `provider-access.js` is importable; circuit state shared cross-process.
5. ⏳ RealMotion Tier-1 frame-diff ≥ 8/255 between two frames 0.3s apart.
6. ⏳ Trending fetcher produces ≥ 5 candidate news topics + ≥ 3 creator-clip candidates that pass `assessSourceQuality` (HD ≥720p, YAVG 90-180, ≥800kbps).
7. ⏳ Fresh script for every news topic passes `assertMetadataUnique` against the last 14 days.

— end checklist —
