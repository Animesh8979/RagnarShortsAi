# GODMODEMAX ROADMAP v1.0

**Status**: Foundation Complete. Ready for Phase 0 Execution.  
**Date**: 2026-06-26  
**Agents**: MiMo (you), Kimi (agent AI)  
**Drive**: D: Only  
**Philosophy**: Veo generates raw footage. Remotion polishes. Partners, never competitors.  

---

## 🔥 WHERE WE ARE RIGHT NOW

First, the good news: your foundation is rock solid. I've just audited every line of code in your monorepo, and you have a cathedral, not a shack. Here's what we have already built:

### ✅ BUILDS COMPLETE (The Cathedral's Foundation):

*   **`@antigravity/security`** — A fortress. Full safeExec with shell injection prevention, PATH traversal guards, secret scrubbing, and SSRF protection. Your `ffmpeg` calls are bulletproof.
*   **`@antigravity/types`** — Write once, use everywhere. All TypeScript interfaces (Scripts, Videos, Captions, Analytics) are defined and ready.
*   **`@antigravity/config`** — D: drive enforcement with zero exceptions. Any attempt to write to `C:` is blocked and logged.
*   **`@antigravity/utils`** — The engine room. Logging, file ops (D:-only), retry logic, and path sanitization.
*   **`SKILL: ponytail`** — Governance linting. Already operational.
*   **`SKILL: video-watch`** — Auto-QA. Monitors rendered videos for size, duration, and audio issues.

### 🧙 THE SPELLBOOK (Skills We Will Forge):

| Spell | Status | Purpose |
|-------|--------|---------|
| `core-research` | 🟡 PARTIAL | Native web scraping and brave search |
| `core-thinking` | 🟡 PARTIAL | Sequential Ouroboros logic and reasoning loops |
| `core-memory` | 🟡 PARTIAL | Native sqlite and graph DB interactions |
| `core-design` | 🟡 PARTIAL | System design and prompt constraints |
| `core-execution` | 🟡 PARTIAL | Automation engine and browser interaction |
| `ai-scriptwriter` | 🟡 EMPTY | Ollama script generation |
| `veo-remotion-bridge` | 🟡 EMPTY | Connects Veo footage to Remotion timeline |
| `media-pipeline` | 🟡 EMPTY | FFmpeg post-processing |
| `voice-sync` | 🟡 EMPTY | Edge TTS + Whisper captioning |
| `upload-automation` | 🔴 DEPRECATED | Superseded by core-execution |

---

## 🗺️ THE CREATIVE ARCHITECTURE

I have reorganized your project into a **fictional world** to make navigation intuitive. We aren't just writing code; we are building a kingdom.

### 🏰 THE KINGDOM OF ANTIGRAVITY

```
antigravity-work/ (The Citadel)
│
├── apps/ (The Frontlines)
│   ├── pipeline/          → Main orchestrator. Runs the 4-phase pipeline.
│   │   ├── src/main.ts
│   │   └── src/phases/ (phase0.ts, phase1.ts, etc.)
│   ├── studio/            → Remotion Studio. Renders compositions.
│   │   ├── src/Root.tsx
│   │   └── src/templates/
│   └── web/               → Analytics dashboard.
│
├── packages/ (The Engine Room)
│   ├── security/          → DONE. Policy engine, safeExec.
│   ├── types/             → DONE. Shared TS interfaces.
│   ├── config/            → DONE. D: drive enforcement.
│   ├── utils/             → DONE. File ops, logging.
│   ├── ai/                → PARTIAL. Ollama client (needs skill wiring).
│   ├── media/             → EMPTY. Veo bridge, FFmpeg.
│   └── analytics/         → EMPTY. View tracking.
│
├── packages/skills/ (The Spellbook)
│   ├── core-research/     → PARTIAL. AI Web scraping & Search.
│   ├── core-thinking/     → PARTIAL. Sequential logic evaluation.
│   ├── core-memory/       → PARTIAL. Memory & Graph syncing.
│   ├── core-design/       → PARTIAL. System design prompts.
│   ├── core-execution/    → PARTIAL. Browser automation & actions.
│   ├── ponytail/          → DONE. Governance.
│   ├── video-watch/       → DONE. Auto-QA.
│   ├── ai-scriptwriter/   → ✅ FORGED. Script generation. Ollama client + batch runner ready.
│   ├── voice-sync/        → NEXT. Captions.
│   ├── veo-remotion-bridge/ → NEXT. Compositing.
│   └── media-pipeline/    → NEXT. Post-production.
│
└── reports/ (The Archives)
    ├── GODMODEMAX_PLAN.md         → The master strategy.
    ├── MCP_MARKET_INVENTORY.md    → 111 MCPs catalogued.
    ├── PLAN_v3.1_COMPLETE.md      → Previous iteration.
    └── CHANGELOG.md               → Iteration history.
```

---

## 🛡️ PHASE 0: CONTENT VALIDATION (The Gatekeeper)

### Goal
Generate 10 scripts for short-form video. Validate their quality. Pick the one that will actually go viral, not just exist.

### Execution Flow
1.  **Brain** (`@timmeck/brain` or local memory): Recall past performance. What topics hit? What died?
2.  **Think** (`sequential-thinking` MCP): Connect disparate trends.
3.  **Scout** (`brave-search` + `fetch` MCPs): Dig into what's actually trending. No guesswork.
4.  **Write** (`ai-scriptwriter` skill): Ollama `qwen3:1.7b` generates 10 scripts.
5.  **Store** (`@mycobrain/mcp-server`): Save to knowledge graph.
6.  **Gate** (HUMAN): You review `reports/script-batch-<date>/`. Pick the best. Approve or reject.
7.  **BLOCK**: No Phase 1 without explicit human approval.

### Success Criteria
*   [ ] 10 scripts generated in `reports/script-batch-YYYY-MM-DD/`.
*   [ ] Each script has: title, segments (speaker, text, mood, visualCue), metadata (topic, duration, tone).
*   [ ] Human selects 1 script and provides a thumbs-up.

---

## ⚔️ PHASE 1: AUDIO & VOICE (The Voice)

### Goal
Take the approved script and turn it into audio + timed captions.

### Execution Flow
1.  **Speak** (`node-edge-tts`): Script text → MP3/WAV① audio file.
2.  **Hear** (`faster-whisper`): Audio file → timed SRT/JSON caption file.
3.  **Cache**: Both files saved to `D:/antigravity-renders/<job-id>/`.
4.  **Output**: `{ audioFile, captionFile }`.

### Success Criteria
*   [ ] Audio file duration matches script estimate ±5%.
*   [ ] SRT file has captions for every spoken segment.
*   [ ] Lip-sync is verified by `video-watch` QA.

---

## 🎨 PHASE 2: VISUALS (The Forge)

### Goal
Generate raw footage and composite it into a final MP4.

### Execution Flow
1.  **Plan** (`veo-remotion-bridge`): Read the script. Map shot types (establishing, b-roll, reaction, close-up).
2.  **Generate** (Veo): Ask Veo for raw footage based on shot list. Store in `renders/veo-raw/`.
3.  **Compose** (`apps/studio` → Remotion): Import audio, captions, and raw footage into a template.
4.  **Animate** (`@remotion/mcp`): Add hooks, transitions, text overlays, effects.
5.  **Render**: Remotion renders the composition to `D:/antigravity-renders/<job-id>/raw.mp4`.

### Success Criteria
*   [ ] Final MP4 is 9:16 aspect ratio (short-form).
*   [ ] Audio and visuals are in sync (verified by `video-watch`).
*   [ ] File size is under 50MB for fast upload.

---

## ⚒️ PHASE 3: POST-PRODUCTION (The Polish)

### Goal
Finalize the video. Add intro/outro, normalize audio, run quality checks.

### Execution Flow
1.  **Normalize** (`media-pipeline` + `ffmpeg`): Normalize audio levels. Add intro/outro (if available).
2.  **Check** (`video-watch` skill): Validate duration, size, resolution, audio track presence.
3.  **Stamp**: Save final as `D:/antigravity-renders/<job-id>/final.mp4`.

### Success Criteria
*   [ ] Video passes all `video-watch` QA checks.
*   [ ] `qa-report.json` is generated with green status.

---

## 📢 PHASE 4: DISTRIBUTION (The Herald)

### Goal
Get the video in front of eyes.

### Execution Flow
1.  **Queue** (`upload-automation`): Add to human-approval queue.
2.  **Approve** (HUMAN): Review final video. Confirm upload.
3.  **Post** (`@playwright/mcp`): Browser automation handles the upload to YouTube/Instagram.
4.  **Track** (`@vercel/analytics`): Log views, likes, comments.

### Success Criteria
*   [ ] Video is uploaded successfully.
*   [ ] Analytics data is being tracked.

---

## 🗓️ THE PRIORITIZED BATTLE PLAN

### Sprint 1 (Next): Ignite Phase 0
*   [ ] Forge the `ai-scriptwriter` skill. Connect it to Ollama `qwen3:1.7b`.
*   [ ] Create the script generation prompt (tuned for virality, storytelling, and short-form).
*   [ ] Create the `report-store` utility (save scripts to `reports/script-batch-<date>/`).
*   [ ] Generate 10 scripts. You review. Pick 1.
*   [ ] Update this ROADMAP with results.

### Sprint 2: Sound the Alarm (Phase 1)
*   [ ] Forge the `voice-sync` skill. Integrate `node-edge-tts` + `faster-whisper`.
*   [ ] TTS output caching.
*   [ ] Generate captions for the approved script.
*   [ ] Integrate with `video-watch` for QA.

### Sprint 3: Enter the Forge (Phase 2)
*   [ ] Set up Remotion Studio (`apps/studio`).
*   [ ] Create 1 base template (e.g., `TrendingNews`).
*   [ ] Forge the `veo-remotion-bridge` to composite Veo footage.
*   [ ] Render 1 test video. Iterate.

### Sprint 4: The Final Polish (Phase 3)
*   [ ] Forge the `media-pipeline` skill.
*   [ ] Add intro/outro generation or selection.
*   [ ] Run full QA pass. Green light everything.

### Sprint 5: Unleash the Herald (Phase 4)
*   [ ] Forge the `upload-automation` skill.
*   [ ] Integrate `@playwright/mcp` for browser automation.
*   [ ] Set up analytics dashboard (`apps/web`).
*   [ ] Execute the first automated upload. Celebrate.

---

## 🧙‍♂️ MCP REGISTRY & FREE TOOLS

### MCPs (Already configured in `.mcp.json`)
| Name | Purpose | Status |
|------|---------|--------|
| `filesystem` | D: drive operations | Ready |
| `fetch` | Web scraping | Ready |
| `sqlite` | Analytics DB | Ready |
| `sequential-thinking` | Complex reasoning | Ready |
| `memory` | Knowledge graph | Ready |
| `brave-search` | Trend research | Needs `BRAVE_API_KEY` |

### Free Local Tools (No API Keys)
| Tool | Purpose |
|------|---------|
| `node-edge-tts` | Free text-to-speech |
| `faster-whisper` | Free speech-to-text/captions |
| `@timmeck/brain` | Adaptive memory |
| `@mycobrain/mcp-server` | Postgres + pgvector memory |
| `comfyui-client` | Local image generation |
| `automatic1111` | Local Stable Diffusion |

### Assumed External (Requires Setup)
| Tool | Purpose | Setup Notes |
|------|---------|-------------|
| Ollama | Local LLM | Install model `qwen3:1.7b` |
| Veo | Video generation | Semi-automated with quota guards |
| Remotion | Video composition | `npx create-video` in `apps/studio` |

---

## ✅ HOW TO KNOW WE ARE WINNING

1.  **Phase 0 is the ONLY phase that matters right now.** If the script sucks, the video sucks. No exceptions.
2.  **Quality over quantity.** We are building 1 perfect video, not 10 mediocre ones.
3.  **Human gate at every phase.** Automation is a tool, not a master. You have a veto at every step.
4.  **D: drive or die.** Any tool trying to write elsewhere is a bug.
5.  **Free tools first.** If a paid API is suggested, we default to the free local alternative unless you explicitly approve it.

---

## 🚀 FIRST BLOOD: OUR IMMEDIATE NEXT STEP

The `ai-scriptwriter` skill is now **forged and ready**. The Ollama client, prompt builder, JSON parser, and batch runner are all in place at `packages/skills/ai-scriptwriter/src/`.

**What I need from you to execute Phase 0:**
1.  **Topic**: What genre do you want the first batch of 10 scripts to be about? (e.g., "Mystery History," "Tech Explainer," "Conspiracy Theories").
2.  **Style**: What tone and pacing do you want? (e.g., "Narrator voice, fast cuts, hook in first 3 seconds").
3.  **Start Ollama**: Run `D:\Ollama\start_ollama.bat` in a terminal and make sure `qwen3:1.7b` is pulled.

Once you confirm these, the batch runner will generate 10 scripts and save them to `reports/script-batch-YYYY-MM-DD/` on your D: drive for your review.

**Are you ready to begin Phase 0?**