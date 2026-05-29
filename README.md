# Antigravity Daily Pipeline — L107

Autonomous YouTube Shorts + Instagram Reels pipeline. One command per day renders
4 outputs across 4 accounts; 0 paid services; trending-driven; self-optimizing.

```
ORGANIC LANE                                  CLIPPING LANE
─────────────                                 ─────────────
RagnarShortsUltimate (YT) + @ragnar_ultimate007 (IG)    RagnarShortsAI (YT) + @ragnarautomated (IG)
trending RSS → FLUX still → parallax → mux              yt-dlp HD source → cut moments → split-screen
```

## TL;DR — fire today's batch

```cmd
:: render + upload, 3-hour pacing between uploads
node lib/daily-fresh-batch.js --organic 2 --clips 2 --community 1 --auto-upload --upload-gap-min 180

:: render-only (no uploads); inspect renders/fresh-batch-{date}.json first
node lib/daily-fresh-batch.js --organic 2 --clips 2 --community 1

:: just kick the upload chain afterward (reads renders/fresh-batch-{date}.json)
node lib/auto-upload-fresh.js --gap-min 180
```

## Prereqs (one-time)

| Item | Notes |
|---|---|
| Node 18+ | `node --version` |
| `D:\anitgravity work\.env` | Required keys below. Never commit. |
| ffmpeg | bundled via `ffmpeg-static` |
| yt-dlp | `D:\anitgravity work\node_modules\.bin\yt-dlp` (clip lane) |
| Real-ESRGAN | `D:\AI_Tools\realesrgan\realesrgan-ncnn-vulkan.exe` (Phase 6.3 — optional) |
| GTX 1650 4GB | Vulkan only — no CUDA needed. ComfyUI/Forge/AnimateDiff are BANNED forever (crash on 4 GB). |

### Required `.env` keys (already configured)

```
# Provider API keys (all free tier)
NVIDIA_API_KEY=...        # FLUX.1-dev + Cosmos i2v
GEMINI_API_KEY=...        # script LLM
GROQ_API_KEY=...          # script LLM fallback
HUGGINGFACE_API_KEY=...   # FLUX + LTX-Video + Wan + CogVideoX

# Instagram — lane-aware (L107)
INSTAGRAM_ACCESS_TOKEN=...                       # long-lived, both pages
INSTAGRAM_USER_ID_ORGANIC=17841459516523004      # @ragnar_ultimate007
INSTAGRAM_USER_ID_CLIPS=17841440678659098        # @ragnarautomated
INSTAGRAM_USER_ID=...                            # default fallback (= CLIPS today)

# YouTube — auto-handled via OAuth credentials
# yt-credentials.json   → RagnarShortsUltimate (organic lane)
# yt-credentials-2.json → RagnarShortsAI       (clip    lane)
```

## What runs every day

```
                        ┌─────────────────────────────────────┐
                        │  lib/daily-fresh-batch.js           │
                        └──────────────┬──────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
       ORGANIC (×N)             CLIPPING (×M)            COMMUNITY (×C)
       trending-news.js         clip-source-fetcher.js   community-script-seed.js
       script-from-trending.js  cut split-screen         (top question comment → topic)
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       ▼
                              daily-auto-v8.js (FLUX still + parallax + Edge TTS + Karaoke)
                                       │
                                       ▼
                        renders/fresh-batch-{date}.json
                                       │
                          (when --auto-upload)
                                       ▼
                              auto-upload-fresh.js
                                       │
                                       ▼
                              ┌────────┴────────┐
                              ▼                 ▼
                       organic items     clip items
                       → YT Ultimate     → YT AI
                       → IG ultimate007  → IG automated
                       (3h gap between each item by default)
```

## L107 — What changed from L99/L100

L99 shipped the master rebuild (FLUX-parallax, Edge TTS @+15%, provider-router cascade, trending RSS, Phase B 14-day uniqueness, cloudflared IG hosting). L100 added suppression-recovery + 4-channel routing. L107 is the **self-optimizing media empire** layer.

### Phase 1 — Self-optimization loop (was 70 % built, now 100 %)
- `lib/script-from-trending.js` — calls `predictPerformance(topic)` before LLM, drops topics scoring <30, sorts by predicted score.
- `lib/prompt-evolution.js` — every day reads the last 14 d of YT analytics, asks the LLM to rewrite the `STYLE_NOTES` system prompt based on top-10 vs bottom-10 AVD%. Writes `renders/analytics/evolved-prompt-{date}.md`. The next batch loads it automatically.
- `lib/ig-metrics.js` — pulls `views,reach,saved,shares,likes,comments,total_interactions` from Graph API for every shipped IG media in the last 24 h. (`plays` dropped — deprecated in Meta v22+.)
- `lib/channel-cluster-router.js` — builds a (channelLabel × topic-cluster) AVD matrix. When a cluster has ≥3 samples on both channels AND one outperforms by ≥30 %, future routing picks the winner.

### Phase 2 — Community-driven content
- `lib/comment-harvester.js` — pulls top comments from every video uploaded in the last 48 h (YT + IG). Spam filter + likes+0.5×replies ranking.
- `lib/community-script-seed.js` — `pickSeed()` returns the top engagement-ranked question comment. Auto-routed into the organic lane via `--community N`.

### Phase 3 — Velocity spike detection (15-min news cycle)
- `lib/topic-velocity.js` — append-only ledger of every topic mention across 5 sources.
- `lib/velocity-watch.js` — every 10 min: poll Reddit /new (4 subs), HN topstories, Google News RSS, Google Trends RSS, Wikipedia recentchanges. Detects ≥2× spike across ≥3 sources within 1 h.
- `lib/priority-batch.js` — short-circuit orchestrator: urgent-hook STYLE (4 beats, ~60 s budget), skips i2v, skips Phase B uniqueness if topic <6 h old.

### Phase 4 — Cloud generative motion (wires the i2v stubs)
- `lib/i2v-cloud.js` — POSTs to `router.huggingface.co/{Lightricks/LTX-Video, Wan-AI/Wan2.1-T2V-1.3B, THUDM/CogVideoX-2b}`. Provider cascade: NVIDIA Cosmos → HF LTX → Wan → CogVideoX → FAL (only if `FAL_DAILY_BUDGET_CENTS` budget remaining).
- Used for hook beat + climax only (1 – 5 min per clip vs 8 – 12 s for Tier-1 parallax).

### Phase 5 — Omnipresence (X thread + IG Carousel)
- `lib/platform-fanout.js` — single LLM call returns `{ytShort, igReel, xThread[5], igCarousel[5], tiktok}`. Cached per script.
- `twitter-uploader.js#uploadThread(tweets[])` — posts tweet 1, chains rest as `in_reply_to_tweet_id`, 800 ms pause.
- `ig-uploader.js#uploadCarousel({slides, caption})` — FLUX still per slide → drawtext overlay → 1080×1080 → host → child IMAGE containers → parent CAROUSEL_ALBUM → publish.

### Phase 6 — Infra
- `.github/workflows/daily-batch.yml` — self-hosted runner cron `0 */6 * * *`.
- `.github/workflows/velocity-watch.yml` — cron `*/10 * * * *`.
- `lib/github-releases-host.js` — GH Releases as IG public-host primary (no cloudflared dependency, 2 GB/file unmetered).
- `lib/esrgan-upscaler.js` — wraps Real-ESRGAN Vulkan binary for sub-720 p clip rescue.
- `lib/cost-ledger.js` — every external API call writes `{ts, provider, endpoint, cost: 0}` JSONL. CI gate fails if any row > 0.
- `lib/checkpoint.js` — `open(outDir).step(name, fn)` wraps each long step. Re-running skips completed steps. Used by `daily-auto-v8.js` + `daily-clip-v8.js`.

### Phase 0 — D-drive enforcement
- `lib/env-d-drive-only.js` — required at the top of every entry point. Forces `TEMP/TMP/HF_HOME/HUGGINGFACE_HUB_CACHE/TRANSFORMERS_CACHE/TORCH_HOME/NPM_CONFIG_CACHE/YTDLP_CACHE_DIR/CLOUDFLARED_CONFIG_DIR/GH_CONFIG_DIR` under `D:\anitgravity work\.runtime-cache\`. THROWS if any critical env var still points to C:\.

### 4-channel routing fix (today)
- `ig-uploader.js` — `getInstagramUserId(options)` is now threaded through every Graph call site (was being defeated by 7 bare `getInstagramUserId()` calls). `graphRequest` accepts a 4th `callOptions` arg that flows `getAccessToken` per-lane.
- Removed `process.env` mutation in `uploadToInstagram` that cross-contaminated sequential lane uploads.
- `lib/auto-upload-fresh.js` — corrected misleading comments + performance-ledger label swap. Actual YT credentials routing was already correct.

## Verifying the pipeline

```cmd
:: 66-check self-test (modules, env, routers, secrets, phase wiring)
node tools/l107-selftest.js

:: smoke-test both IG accounts via lane-aware auth
node -e "const ig=require('./ig-uploader'); (async()=>{await ig.testInstagramAuth({channelLabel:'organic'}); await ig.testInstagramAuth({channelLabel:'clip'});})();"

:: probe the IG token for both pages
node tools/probe-ig-token.js

:: dry-run the daily batch (no renders, no uploads — just plan)
node lib/daily-fresh-batch.js --organic 2 --clips 2 --community 1 --dry-run

:: verify cost-ledger has zero non-zero rows for the last 7 days
node lib/cost-ledger.js --verify --days 7
```

## Hard constraints (do not break)

1. **$0 recurring cost.** Every external call appends `cost=0` to `renders/analytics/cost-ledger-{date}.jsonl`. CI gate fails otherwise.
2. **D drive only for all project artifacts.** No writes to C: except the Claude Code memory dir.
3. **Node-only orchestrator.** No new Python in the pipeline (Python is OK as a subprocess host for Real-ESRGAN / LivePortrait, never imported).
4. **GTX 1650 4 GB VRAM ceiling honored.** ComfyUI, Forge, AnimateDiff are BANNED — all motion gen via cloud i2v.
5. **Commercial-safe licenses only** for default upload paths. CC-BY-NC / "research-only" → guarded behind explicit env flag.
6. **No silent fallbacks.** Every provider failure logs a JSONL row.
7. **Clipping ↔ Organic isolation** preserved (queues, history, dedup, channels).
8. **Idempotent checkpoints.** Every long step writes `<outDir>/checkpoint.json`. Re-running resumes from the last successful step.
9. **Quality auto-veto + auto-reroll.** Aesthetic QA score < 60 → re-roll FLUX seed (max 2 re-rolls per beat).
10. **No-suppression hard guards.** Phase B 14-day metadata-uniqueness gate, `HALT_ON_PROVIDER_EXHAUSTION=1`, no anonymous-host IG default.

## Failure recovery

| Symptom | First check |
|---|---|
| Render crashes mid-batch | `node lib/daily-fresh-batch.js --resume <runId>` reads `checkpoint.json` and skips completed steps |
| IG container goes ERROR | retry once via `node lib/auto-upload-fresh.js --start-at N` where N = index in `renders/fresh-batch-{date}.json` |
| YT upload returns 401/403 | re-mint OAuth via `node yt-uploader.js --reauth` |
| IG token rejected | `tools/probe-ig-token.js` — if `expires_at != "never"`, run `node ig-uploader.js --rotate-token` |
| Provider cascade exhausted | check `renders/analytics/circuit-breakers.json`; provider re-enables after cooldown |
| Cost-ledger has non-zero row | grep `renders/analytics/cost-ledger-*.jsonl` for the offending provider; investigate before next batch |

## Maintenance

```cmd
:: refresh analytics every 6h (the GH Action does this automatically)
node refresh-youtube-analytics.js
node lib/ig-metrics.js --since 24h

:: harvest comments daily
node lib/comment-harvester.js --window 48h

:: rotate evolved prompts every 24h (called automatically by daily-fresh-batch)
node lib/prompt-evolution.js --refresh
```

## Repository map (high-level)

- `lib/` — all orchestration code (40+ modules, all Node)
- `tools/` — operator utilities (probes, smoke tests, retry helpers)
- `src/` — Remotion composition (organic visual)
- `renders/` — output + analytics + checkpoints (D:\ only)
- `.planning/` — daily artifacts, scripts, growth strategy notes
- `.github/workflows/` — self-hosted runner crons
- `image-providers.js`, `provider-router.js` — provider cascade
- `yt-uploader.js`, `ig-uploader.js`, `twitter-uploader.js`, `facebook-uploader.js`, `tiktok-uploader.js` — surface adapters

## Sources & links

- Daily artifacts: `.planning/growth-strategy/daily/{date}/`
- Render manifest: `renders/fresh-batch-{date}.json`
- Upload manifest: `renders/fresh-batch-upload-{date}.json`
- Self-test: `node tools/l107-selftest.js`
- Architecture map: `.gsd/ARCHITECTURE.md`
