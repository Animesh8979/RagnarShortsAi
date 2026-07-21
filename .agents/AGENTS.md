<RULE[workspace]>
=== ANTIGRAVITY WORK — Workspace Rules ===

# Project Context
This workspace (`D:\anitgravity work`) is a TypeScript monorepo for the Antigravity
short-form video generation pipeline.

# Build & Test
- Build all: `npm run build` (runs `npm run build --workspaces`)
- Build single: `npm run build -w @antigravity/<package-name>`
- Studio: uses `remotion bundle` (not `remotion build`)
- All workspaces use `tsc` for compilation

# Architecture
- `apps/pipeline` — Video generation pipeline orchestrator
- `apps/studio` — Remotion-based video rendering studio
- `packages/core/*` — Shared core: ai, config, media, security, types, utils
- `packages/skills/*` — AI skills: scriptwriter, ponytail, video-vision, etc.
- Module system: ESM with Node16 resolution. All relative imports require `.js` extensions.

# Key Infrastructure
- AI Router: `D:\ai-router/server.mjs` on port 8765
- OllamaClient in `packages/skills/ai-scriptwriter/src/ollama.ts` has OpenAI-compatible fallback
- Router provides NVIDIA (key1/key2) and Nara (key3) model access

# Constraints
- Never combine this workspace with `D:\mimo code`. They are separate projects.
- Never modify the router `.env` file without explicit user approval.
- ESM compliance: always use `.js` extensions in relative imports.
- After any code change: run `npm run build` and verify exit code 0 before reporting success.
- Remotion: use `remotion bundle`, not the deprecated `remotion build`.

# Code Style
- TypeScript strict mode
- 2-space indent
- Explicit return types on public functions
- JSDoc on all exported symbols
- No `any` without inline justification comment
</RULE[workspace]>
