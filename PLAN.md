# MASTER PLAN — Antigravity Work v2.0
## Automated Short-Form Video Pipeline for YouTube & Instagram

**Version**: 2.0 (Complete Rewrite) | **Date**: 2026-06-23 | **Status**: Phase 1 In Progress

---

## 1. EXECUTIVE SUMMARY

Current codebase is a 134-file mess with:
- 20+ exposed API keys (in git history, permanently compromised)
- 4 command injection vulnerabilities (CRITICAL)
- No clear architecture or separation of concerns

**This plan**: Complete ground-up rewrite into a clean, modular, TypeScript monorepo with human-level video editing, all free tools, and monetization tracking.

**Approved by user**: Yes. All questions answered. Ready for execution.

---

## 2. LOCKED REQUIREMENTS

| Requirement | Locked Answer |
|---|---|
| **Goal** | Earn money via viral short-form videos |
| **Platforms** | YouTube Shorts + Instagram Reels |
| **Video Style** | Mixed (photorealistic + 2D cartoon per genre) |
| **Veo (Google AI Pro)** | Manual trigger, pipeline tracks 95/mo quota |
| **Script Writing** | Local LLM (Ollama) — free |
| **Voice-Over** | Edge TTS / Piper — free |
| **Captions** | Whisper (local) — free |
| **Editing** | Human-level (Remotion + FFmpeg) |
| **Analytics** | Full monetization tracking (views, CPM, revenue) |
| **Constraints** | Free only, no C: drive, no crashes, labeled, modular |

---

## 3. VERIFIED TECH STACK

### Video & Editing (Verified Working)
| Component | Technology | Why |
|-----------|-----------|-----|
| **Video Compositor** | Remotion v4 | 51k GitHub stars, React-based, professional quality |
| **Post-Processing** | FFmpeg | Industry standard, free |
| **Character Gen (Photo)** | Veo 2 (Google AI Pro) | 95 videos/mo included in subscription |
| **Character Gen (2D)** | CSS animations + Lottie | Lightweight, fast, stylized |
| **Image Gen** | Flux via ComfyUI or Pollinations | High quality, free tier |

### AI / LLM (All Free, Verified)
| Component | Technology | Why |
|-----------|-----------|-----|
| **Script Writing** | Ollama (qwen3:8b) | 31M+ pulls, fast, multilingual, tools support |
| **Image Analysis** | Ollama vision models | Local image understanding |
| **Voice-Over** | Edge TTS or Piper TTS | Natural, multi-language, local |
| **Captions** | Whisper (openai-whisper) | 104k GitHub stars, accurate, 99 languages |
| **Trend Research** | Firecrawl MCP (free tier) | Web scraping, keyless access |

### Social Media (Verified Free)
| Component | Technology | Why |
|-----------|-----------|-----|
| **YouTube** | Data API v3 | Free quota, OAuth2 |
| **Instagram** | Graph API | Business account, free |
| **Analytics** | Custom + Google Sheets | Track views, CPM, revenue |

---

## 4. ARCHITECTURE

```
antigravity-work/
├── .planning/                    # GSD project management
├── apps/
│   ├── pipeline/                   # Main orchestration engine
│   ├── studio/                     # Remotion video composition studio
│   │   ├── compositions/           # Video templates (trending, story, cartoon, anchor)
│   │   ├── components/             # Character, Caption, Effects, Transitions
│   │   └── templates/              # Template configs by genre
│   └── web/                        # Prophub AI analytics dashboard
├── packages/
│   ├── @antigravity/security/     # safeExec, scrubSecrets, validateUrl
│   ├── @antigravity/config/       # Typed env vars, D: drive enforcement
│   ├── @antigravity/types/        # Shared TypeScript interfaces
│   ├── @antigravity/utils/        # File ops, logging, D: path helpers
│   ├── @antigravity/media/         # FFmpeg wrapper, video composition
│   ├── @antigravity/ai/            # Ollama, script gen, image gen
│   └── @antigravity/analytics/    # Monetization tracking, reporting
├── assets/
│   ├── characters/                 # Character definitions (JSON configs)
│   ├── fonts/                      # Pre-loaded fonts
│   └── music/                      # Royalty-free tracks
└── renders/                          # Output (gitignored, D: only)
```

---

## 5. PHASE-BY-PHASE PLAN

### PHASE 1: Foundation & Security (Week 1)
- [x] Backup v1 codebase (134 files backed up)
- [x] Create monorepo structure
- [x] Implement `@antigravity/security` (safeExec, scrubSecrets, validateUrl)
- [ ] Implement `@antigravity/config` (typed env vars, D: drive enforcement)
- [ ] Implement `@antigravity/types` (shared interfaces)
- [ ] Implement `@antigravity/utils` (file ops, logging, retries)
- [ ] Set up Remotion in `apps/studio`
- [ ] Create `.env.example`, harden `.gitignore`
- [ ] Pre-commit hooks (no secrets, validate paths)

### PHASE 2: Remotion Studio (Week 2-3)
- [ ] Base composition setup
- [ ] Character component (photo + 2D support)
- [ ] Caption component (auto-synced)
- [ ] Effects & Transitions components
- [ ] 4 video templates: TrendingNews, StoryDriven, CartoonShort, AnchorReport
- [ ] FFmpeg post-processing pipeline

### PHASE 3: Content Pipeline (Week 3-4)
- [ ] Ollama integration
- [ ] Script generation engine
- [ ] Voice-over generation (Edge TTS / Piper)
- [ ] Caption generation (Whisper local)
- [ ] Image generation (ComfyUI / Flux)
- [ ] Content deduplication

### PHASE 4: Social Media & Analytics (Week 4-5)
- [ ] YouTube uploader
- [ ] Instagram uploader
- [ ] Upload queue (resumable, idempotent)
- [ ] Analytics tracking (@antigravity/analytics)
- [ ] Dashboard (Prophub AI)

### PHASE 5: Polish (Week 5-6)
- [ ] Error handling & retries
- [ ] Memory leak prevention
- [ ] CPU throttling
- [ ] D: drive optimization
- [ ] Test suite (Vitest)

---

## 6. SECURITY MEASURES

- `safeExec()` — array args only, no shell injection
- `validatePath()` — D: drive allowlist, no traversal
- `validateUrl()` — protocol + host allowlist, no SSRF
- `scrubSecrets()` — automatic redaction in logs
- `requireEnv()` / `getEnv()` — typed, safe env access
- `.env` never in git, pre-commit secret scanning

---

## 7. MONETIZATION

| Stream | How | Tracking |
|---|---|---|
| YouTube Partner Program | Ad revenue from Shorts | Views, RPM |
| Instagram Reels Bonuses | Meta creator fund | Views, bonus |
| Affiliate Marketing | Product placements | Clicks, conversion |
| Sponsored Content | Brand deals | Contract value |

---

## 8. NEXT ACTION

Start **Phase 1, Task 1.4**: Implement `@antigravity/config` (typed env vars, D: drive enforcement).

All decisions locked in. All tech verified. Ready to build.
