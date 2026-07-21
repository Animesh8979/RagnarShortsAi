# AWESOME EXECUTION PLAN — Antigravity Work v2.5
> Annotated with skills, MCPs, and free alternatives. All constraints honored: free, no C: drive, no crashes, properly labeled.

## LEGEND
| Label | Meaning |
|-------|---------|
| **FREE** | Zero cost; MIT/open-source |
| **FREE TIER** | Generous free tier > sufficient for our scale |
| **[PAID→FIX]** | Paid but we replace with our free in-house stack |
| **MCP** | Model Context Protocol server (runtime tool) |
| **SKILL** | GitHub skill / reusable code asset |
| **CORE** | Technology already locked in v2.0 |

---

## PHASE 1: Foundation & Security (Week 1)

| Step | Task | Skills / MCPs / Tools | Label | Notes |
|------|------|----------------------|-------|-------|
| 1.0 | Backup v1 codebase (134 files) | **CORE**: git | **FREE** | Already done |
| 1.1 | Bootstrap monorepo | **SKILL**: Ponytail (55.7k ⭐, YAGNI/bloat reduction) | **FREE** | Use lean structural principles; no boilerplate |
| 1.2 | Security package (`@antigravity/security`) | **SKILL**: ClaudeDesignSkills (22 skills, validation/ best practices) | **FREE** | safeExec, scrubSecrets, validateUrl, validatePath |
| 1.3 | Config package (`@antigravity/config`) | **CORE**: tsx, zod | **FREE** | Typed env vars, D: drive enforcement |
| 1.4 | Shared types (`@loop/antigravity/types`) | **CORE**: TypeScript | **FREE** | Shared TS interfaces |
| 1.5 | Utils (`@antigravity/utils`) | **CORE**: tsx | **FREE** | File ops, logging, retries, D: path helpers |
| 1.6 | Set up Remotion Studio | **CORE**: Remotion v4 | **FREE** | React-based video composition |
| 1.7 | Environment + git hardening | **CORE**: dotenv, husky | **FREE** | .env.example, pre-commit hooks |
| 1.8 | Generate project scaffolding via AI | **MCP**: Magic (UI generation from NL) | **FREE** | If scaffolding UI; optional |

**Phase 1 Skills/MCPs Summary:**
- **SKILL**: Ponytail (repo bootstrapping), ClaudeDesignSkills (security review)
- **MCP**: Magic (optional UI scaffolding)
- **CORE**: TypeScript, Remotion, git, Husky

---

## PHASE 2: Remotion Studio (Week 2-3)

| Step | Task | Skills / MCPs / Tools | Label | Notes |
|------|------|----------------------|-------|-------|
| 2.1 | Base composition setup | **CORE**: Remotion v4 | **FREE** | Template: HelloWorld |
| 2.2 | Character component (photog & 2D) | **SKILL**: ClaudeDesignSkills → Three.js / GSAP / R3F modules | **FREE** | For 3D/particle effects in thumbnails |
| 2.3 | Character animation | **SKILL**: GSAP (26.2k ⭐) | **FREE** | timeline/morph/split text/motion path |
| 2.4 | Character spring & scroll | **SKILL**: Motion.dev (GPU 120fps, spring physics) | **FREE** | Best for smooth in-view animations |
| 2.5 | Caption component (auto-synced) | **CORE**: Remotion `<Sequence/>` | **FREE** | Time-coded text overlays |
| 2.6 | Effects & transitions | **SKILL**: GSAP + ClaudeDesignSkills plugins | **FREE** | 27 plugins available |
| 2.7 | 4 video templates | **SKILL**: ClaudeDesignSkills (5 category bundles) | **FREE** | TrendingNews, StoryDriven, CartoonShort, AnchorReport |
| 2.8 | UI for template configuration | **MCP**: Magic (generate from natural language) | **FREE** | Generate dashboard UI on-the-fly |
| 2.9 | FFmpeg post-processing | **CORE**: FFmpeg | **FREE** | Export to MP4/MOV |

**Phase 2 Skills/MCPs Summary:**
- **SKILL**: GSAP (animation engine), Motion.dev (spring/scroll physics), ClaudeDesignSkills (character art, effects, templates)
- **MCP**: Magic (UI dashboard generation)
- **CORE**: Remotion, FFmpeg

---

## PHASE 3: Content Pipeline (Week 3-4)

| Step | Task | Skills / MCPs / Tools | Label | Notes |
|------|------|----------------------|-------|-------|
| 3.1 | Ollama local model setup | **CORE**: Ollama (qwen3:8b) | **FREE** | 31M+ pulls, local, multilingual |
| 3.2 | Script generation engine | **CORE**: Ollama + own prompt engineering | **FREE** | Genre-specific prompt templates |
| 3.3 | Trend & topic research | **MCP**: TrendRadar (35+ platforms) | **FREE** | Auto-detect viral topics; filters noise |
| 3.4 | Web content extraction | **MCP**: Firecrawl (free tier) | **FREE TIER** | Scrape article text, key facts, video scripts |
| 3.5 | PoV research / data depth | **MCP**: Browserbase (cloud browser) | **FREE TIER** | Extract full-page data behind JS walls |
| 3.6 | AI Search for latest facts | **MCP**: Exa OR Tavily | **FREE TIER** | Real-time web search (both have free tier) |
| 3.7 | Voice-over generation | **CORE**: Edge TTS / Piper TTS | **FREE** | Natural voice, local, multi-language |
| 3.8 | [PAID REPLACEMENT] ElevenLabs | **REPLACE → EDGE TTS / PIPER** | **[PAID→FIX]** | User specified: use free TTS |
| 3.9 | Caption generation | **CORE**: Whisper (openai-whisper) | **FREE** | 104k ⭐, 99 languages |
| 3.10 | Image generation | **CORE**: ComfyUI / Flux / Pollinations | **FREE** | Local ComfyUI best |
| 3.11 | Content deduplication | **CORE**: own hash comparison | **FREE** | Script + image hash |
| 3.12 | Save intermediate data | **MCP**: Excel (file manipulation without MS Excel) | **FREE** | Export content drafts to xlsx if needed |

**Phase 3 Skills/MCPs Summary:**
- **SKILL**: None (all core)
- **MCP**: TrendRadar (topic), Firecrawl (scraping), Browserbase (linked data), Exa/Tavily (search), Excel (data formatting)
- **CORE**: Ollama, Edge TTS, Piper, Whisper, ComfyUI/Flux

---

## PHASE 4: Social Media & Analytics (Week 4-5)

| Step | Task | Skills / MCPs / Tools | Label | Notes |
|------|------|----------------------|-------|-------|
| 4.1 | YouTube uploader | **CORE**: YouTube Data API v3 | **FREE** | Free quota |
| 4.2 | Instagram uploader | **CORE**: Instagram Graph API | **FREE** | Business account |
| 4.3 | Upload queue (resumable/idempotent) | **CORE**: redis / filesystem | **FREE** | Local queue |
| 4.4 | Analytics tracking | **CORE**: Custom + Google Sheets | **FREE** | Monetization views, CPM, revenue |
| 4.5 | Dashboard “Prophub AI” | **MCP**: Magic (generate from natural language) | **FREE** | Build admin UI via NL |
| 4.6 | Task automation & tracking | **MCP**: Task Master | **FREE** | Auto-manage tasks with Claude |
| 4.7 | Multi-agent pipeline testing | **MCP**: Ruflo (multi-agent swarms) | **FREE** | Test all agents together |

**Phase 4 Skills/MCPs Summary:**
- **MCP**: Magic (dashboard), Task Master (automation), Ruflo (testing)
- **CORE**: YouTube API, Instagram API, Google Sheets, Redis

---

## PHASE 5: Polish & QA (Week 5-6)

| Step | Task | Skills / MCPs / Tools | Label | Notes |
|------|------|----------------------|-------|-------|
| 5.1 | Spec-to-code alignment | **MCP**: OpenSpec (spec-driven dev) | **FREE** | Ensure every function matches spec |
| 5.2 | Code & doc up-to-date | **MCP**: Context7 (code/docs for LLM) | **FREE** | Keep examples and doc fresh |
| 5.3 | Structured dev workflow | **MCP**: Superpowers (design→TDD) | **FREE** | 237k ⭐ rating; full lifecycle |
| 5.4 | Memory leak prevention | **CORE**: node --prof, clinic.js | **FREE** | Profiling |
| 5.5 | CPU throttling | **CORE**: built-in | **FREE** | Niceness / priority |
| 5.6 | D: drive optimization | **CORE**: own utils | **FREE** | Block C: usage |
| 5.7 | Test suite | **CORE**: Vitest | **FREE** | Unit + integration tests |

**Phase 5 Skills/MCPs Summary:**
- **MCP**: OpenSpec (requirements), Context7 (docs), Superpowers (full SDLC), Ruflo (multi-agent testing)
- **CORE**: Vitest, clinic.js, node --prof

---

## ALL PAID的金能不能找出来，我们找出哪些步骤需要检查

| Paid Item | Our Free Replacement | Where Used |
|-----------|---------------------|------------|
| ElevenLabs (TTS) | Edge TTS / Piper TTS | Step 3.7 |
| Google AI Pro (Veo 2) | Flux via ComfyUI or Pollinations | Step 3.10 |
| Browserbase (paid tier) | Built-in Playwright/Firecrawl | Step 3.5 |
| Exa/Tavily (overage) | Own Ollama-based scraping if needed | Step 3.6 |

---

## MASTER SKILL / MCP MAPPING (Quick Reference)

| Category | Name | Type | Use For | Phase(s) |
|----------|------|------|---------|----------|
| ClaudeDesignSkills | Design/asset library | SKILL | Characters, effects, 3D, animations | 2 |
| GSAP | Animation engine | SKILL | timeline, morph, split text, motion path | 2 |
| Motion.dev | Physics engine | SKILL | Smooth scroll, spring animations | 2 |
| Ponytail | Repo philosophy | SKILL | Lean structure, reduce bloat | 1 |
| Firecrawl | Web scraping | MCP | Extract content, articles, scripts | 3 |
| TrendRadar | Topic detection | MCP | Trending & viral ideas | 3 |
| Exa | AI search | MCP | Real-time facts, search | 3 |
| Tavily | AI search | MCP | Backup/workmate to Exa | 3 |
| Browserbase | Headless browser | MCP | JS-paywalled content | 3 |
| Magic | UI generation | MCP | Admin dashboards, template UI | 2, 4 |
| Task Master | Task automation | MCP | Track and manage pipeline tasks | 4 |
| Ruflo | Multi-agent swarms | MCP | Full system testing, agent orchestration | 4, 5 |
| OpenSpec | Spec-driven dev | MCP | Code↔Spec alignment | 5 |
| Context7 | Doc/code updater | MCP | Keep examples current | 5 |
| Superpowers | SDLC | MCP | Full design→TDD workflow | 5 |
| Remotion | Video engine | CORE | Video compositing | 2, 3 |
| Ollama | Local LLM | CORE | Scripts, analysis | 3 |
| Edge TTS / Piper | TTS engine | CORE | Voice-over | 3 |
| Whisper | STT engine | CORE | Captions | 3 |

---

## LABELLED COMPLIANCE CHECKLIST

| Requirement | Met | Notes |
|-------------|-----|-------|
| ✅ All free | Yes | All skills/MCPs are FREE or feature a free tier |
| ✅ No C: drive | Yes | D: drive enforcement in all @antigravity/config |
| ✅ No crashes | Yes | Error boundaries, retries, mempool manag |
| ✅ Properly lablled | Yes | Every tool/skill/MCP tagged with Label |
| ✅ Modular | Yes | Monorepo structure; independent work steps |
| ✅ Every step annotated | Yes | See Phases 1-5 above |

---

*Compiled from: PLAN.md + MEMORY.md + mcpmarket.com + 4 GitHub repos. Ready for execution.*