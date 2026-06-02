# L112 — GitHub "means" triage (deep + careful sweep)

_2026-06-02. Brief: "research deeply through GitHub for all the means that can
help us." Every candidate filtered through the HARD constraints: **$0 / no card ·
D:\ only · CPU-only or free cloud API · NO local-GPU generative model
(ComfyUI/Forge/Wav2Lip/etc. PERMANENTLY BANNED) · Node orchestrator · commercial-
safe license · no silent fallbacks.** Verdict = USE / MINE / SKIP, with the reason._

## TIER 1 — build next (biggest jump, all pass constraints)

| Repo | License | GPU? | What it gives us | Integration |
|---|---|---|---|---|
| **gauravzazz/smart-reframe** | MIT | **No** (MediaPipe+OpenCV+ffmpeg, CPU) | **Active-speaker auto-reframe** 16:9→9:16 — face detect + audio activity, OneEuro-smoothed pan that follows whoever's talking. THE clip-lane differentiator (OpusClip's core trick). | Python (`D:\python_env`) subprocess from `split-screen.js`, before grade/captions. |
| **degueba/onda** | MIT | No (pure `useCurrentFrame()`) | **70 copy-paste Remotion components** + 18 transitions: lower thirds, stat cards, quote cards, counters, Ken Burns, parallax. Drop-in polish for the V9 organic scenes + real **scene transitions** (we hard-cut today). | `npx ondajs add <name>` → owns the .tsx in `src/`. |
| **DanielSWolf/rhubarb-lip-sync** | OSS CLI | **No** (built-in PocketSphinx, no model dl) | WAV→**viseme JSON** (mouth shapes A–X w/ timings). Upgrades the presenter's crude sine lip-flap to **phoneme-accurate** mouth shapes. | Windows binary on D:\, child-process from the V9 prop-builder; map visemes→8 mouth SVGs in `PresenterScene`. |

## TIER 2 — high value, moderate effort

| Repo | License | GPU? | What it gives us | Verdict |
|---|---|---|---|---|
| **unclecode/crawl4ai** | Apache-2.0 | No (undetected-Chromium) | LLM-friendly crawler that **bypasses Cloudflare/Akamai** + clean markdown extraction → better trending/news + clip-source discovery (the "scraping cluster" lever; covers scrapling's cloudflare-bypass too). | **USE** to harden `trend-finder`/`velocity-watch` topic detection. Python subprocess. |
| **SamurAIGPT/AI-Youtube-Shorts-Generator** | open | No (LLM+Whisper) | LLM highlight-detection prompts + auto-crop. We already ported its moment-selection; cross-check its prompt for better viral-window picks. | **MINE** (we have the core; lift prompt ideas). |
| **rushindrasinha/youtube-shorts-pipeline** | open | No | Reference architecture (news→script→visuals→VO→captions→upload) — sanity-check our flow + analytics ideas. | **MINE** ideas only (ours is more advanced). |

## TIER 3 — polish / reach / optional

| Repo | License | Note | Verdict |
|---|---|---|---|
| **rhasspy/piper** | MIT | CPU-only TTS, minimal | MINE as an extra TTS fallback (Kokoro stays primary — already best CPU naturalness). |
| **hosuaby/PupCaps** / captacity-style presets | open | CSS karaoke + Hormozi/MrBeast presets + emoji | MINE caption **style presets** (emoji accents, thicker stroke) into `caption-builder`. |
| **av/remotion-bits** / reactvideoeditor templates | MIT/open | charts, transitions, text reveals (81 templates) | MINE specific chart/transition components if onda lacks one. |
| social-media-schedulers (1 API → X/Threads/Bluesky/LinkedIn) | MIT | free reach expansion | BACKLOG (omnipresence) — Threads/Bluesky/X are free extra surfaces. |

## REJECTED — violate a hard constraint (do not build)

- **Wav2Lip · MuseTalk · SadTalker · NVIDIA Audio2Face · LivePortrait** — GPU/CUDA. 🚫 (Rhubarb + vector rig is the $0/CPU path instead.)
- **XTTS v2** (CPML, commercial-restricted) · **F5-TTS** (CC-BY-NC, non-commercial) — license blocks our monetized uploads. 🚫
- **ClipsAI reframe** — needs WhisperX + Pyannote + a HuggingFace token (+torch). Heavier than smart-reframe for the same result. 🚫 (superseded)
- **met4citizen/TalkingHead** — 3D WebGL avatar; CPU render-speed risk (we dropped Three.js in V7 for this reason). ⏸ (revisit only if Rhubarb path underwhelms)
- **OpenShorts / YumCut** — full Docker SaaS stacks; we already have a more advanced Node orchestrator. MINE ideas, don't adopt the stack.
- **ai-clipping-comfyui** — ComfyUI dependency. 🚫 PERMANENT BAN.

## Recommended integration order (views-per-effort)
1. **smart-reframe** → clip lane (the single biggest clip-quality jump). 
2. **onda** transitions + lower-thirds → organic V9 (kills the hard-cuts, pro chyrons).
3. **Rhubarb** visemes → presenter actually talks.
4. **crawl4ai** → trending hardening (more on-niche, higher-velocity topics).
5. MINE: caption emoji presets, SamurAIGPT prompt, Piper fallback.

All Tier-1/2 confirmed installable on Windows/D:\, CPU-only, commercial-safe.
