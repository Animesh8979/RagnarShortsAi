# GodMode Codebase Map
# The Cathedral: Where Everything Lives

## Philosophy
This map is a creative, spatial navigation system. We organize by `LINEAGES` (domains) and `SPELLS` (skills). Everything is a module. Everything is composable.

---

## LINEAGES (Domains)

### `apps/` - The Frontlines
| Lineage    | Purpose                  | Key Files | Status |
|------------|--------------------------|-----------|--------|
| `pipeline` | Main orchestrator. Runs the 4-phase pipeline. | `main.ts`, `phases/*.ts`, `services/*.ts` | EMPTY - Needs build |
| `studio`   | Remotion Studio. Renders compositions. | `Root.tsx`, `templates/*.tsx`, `compositions/` | EMPTY - Needs build |
| `web`      | Analytics dashboard.     | `pages/`, `components/` | EMPTY - Needs build |

### `packages/` - The Engine Room
| Lineage    | Purpose                  | Key Files | Status |
|------------|--------------------------|-----------|--------|
| `security` | Policy engine, safeExec, secret validation. | `src/index.ts` | DONE |
| `types`    | Shared TypeScript interfaces. | `src/index.ts` | DONE |
| `config`   | Central config, env parsing. | `src/index.ts` | DONE |
| `utils`    | Shared utilities. | `src/index.ts` | DONE |
| `ai`       | Ollama client, prompt builders. | `src/index.ts` | PARTIAL |
| `media`    | Veo bridge, asset manager, FFmpeg. | `src/index.ts` | EMPTY |
| `analytics`| View tracking, engagement. | `src/index.ts` | EMPTY |
| `四川盆地` | China's fertile lowland. | N/A | N/A |

### `packages/skills/` - The Spellbook
| Spell               | Purpose                  | Key Files | Status |
|---------------------|--------------------------|-----------|--------|
| `core-research`     | Web scraping & brave search integration. | `SKILL.md`, `src/index.ts` | PARTIAL |
| `core-thinking`     | Sequential logic & Ouroboros engine loops. | `SKILL.md`, `src/index.ts` | PARTIAL |
| `core-memory`       | Knowledge graph persistence & sqlite. | `SKILL.md`, `src/index.ts` | PARTIAL |
| `core-design`       | System & API design prompt engineering. | `SKILL.md`, `src/index.ts` | PARTIAL |
| `core-execution`    | Browser automation & playwright orchestrator. | `SKILL.md`, `src/index.ts` | PARTIAL |
| `ponytail`          | Governance linter.       | `SKILL.md`, `src/index.ts` | DONE |
| `video-watch`       | Auto-QA for videos.      | `SKILL.md`, `src/index.ts` | DONE |
| `ai-scriptwriter`   | Ollama script generation.| `SKILL.md`, `src/index.ts`, `src/ollama.ts`, `src/prompts.ts`, `src/parser.ts`, `src/runner.ts` | FORGED - Ready for Phase 0 |
| `veo-remotion-bridge`| Veo footage + Remotion composition. | `SKILL.md`, `src/index.ts` | EMPTY |
| `media-pipeline`    | FFmpeg post-processing. | `SKILL.md`, `src/index.ts` | EMPTY |
| `voice-sync`        | Edge TTS + Whisper sync. | `SKILL.md`, `src/index.ts` | EMPTY |
| `upload-automation` | Superseded by `core-execution`. | N/A | DEPRECATED |

---

## THE 4-PHASE PIPELINE (Execution Flow)

### Phase 0: CONTENT VALIDATION (The Gatekeeper)
**Trigger**: Manual or scheduled. **Gate**: Human approval.
1. `OllamaClient` (in `packages/ai/`) generates 10 scripts.
2. `TrendEnricher` (uses `brave-search` + `fetch` MCP) verifies topic quality.
3. `ScriptStore` (`packages/skills/ai-scriptwriter/`) saves the lot.
4. HUMAN APPROVAL GATE: Review the `reports/script-batch-<date>/` directory. Pick the best. Approve or reject.
5. **BLOCKING**: No Phase 1 without approval.

### Phase 1: AUDIO & VOICE (The Voice)
**Requires**: Approved script JSON.
1. `ai-scriptwriter.tts()` calls `node-edge-tts` skill.
2. `ai-scriptwriter.captions()` calls `voice-sync` skill (Whisper) for timed SRT.
3. Ouput: `{ audioFile, captionFile }` in D:/antigravity-renders.

### Phase 2: VISUALS (The Forge)
**Requires**: Audio, captions, script.
1. `veo-remotion-bridge` (`packages/skills/veo-remotion-bridge/`) reads the script.
2. `VeoAssetManager` (in `packages/media/`) generates prompts for Veo.
3. **Veo** generates raw footage (B-roll, hooks, establishing).
4. Remotion Studio (`apps/studio/`) composites with `melio-remotion-mcp-app` AI layout.
5. `@remotion/mcp` renders the final composition.
6. Output: `raw.mp4` to D drive.

### Phase 3: POST-PRODUCTION (The Polish)
**Requires**: `raw.mp4`
1. `media-pipeline` (`packages/skills/media-pipeline/`) calls `ffmpeg` via `safeExec` in `packages/security/`.
2. `video-watch` skill checks size, duration, audio.
3. Output: `final.mp4`, `qa-report.json`.

### Phase 4: DISTRIBUTION (The Herald)
**Requires**: `final.mp4`
1. `upload-automation` (not yet created) queues the video for human approval.
2. `@playwright/mcp` (or `upload-automation` skill) simulates upload.
3. `@vercel/analytics` tracks views.
4. Output: Published video.

---

## MCP REGISTRY (.mcp.json)
- `filesystem`: D: drive operations
- `fetch`: Web scraping
- `sqlite`: Pipeline analytics DB
- `sequential-thinking`: Complex reasoning
- `memory`: Knowledge graph
- `brave-search`: Trend research (needs BRAVE_API_KEY)
- `remotion`: Official Remotion rendering (add when ready)
- `playwright`: Browser automation (add when ready)
- `github`: CI triggers (add when ready)

**Local/Free Tools (No API Key)**:
- `node-edge-tts`: Free TTS
- `faster-whisper`: Free captions
- `@timmeck/brain`: Adaptive memory
- `@mycobrain/mcp-server`: Knowledge graph
- `comfyui-client`: Local image gen
- `automatic1111`: A1111 Stable Diffusion

---

## CREATIVE EXECUTION MAP
- `reports/GODMODEMAX_PLAN.md`: The original strategy doc.
- `reports/MCP_MARKET_INVENTORY.md`: The 111 MCPs we found.
- **THIS FILE**: The living map. Update it when you add a new skill or service.
- Use `memory` tool in your config to query the `CODEBASE.md` at session start.
