# D:\anitgravity work — Living Architecture State
> Last updated: 2026-07-05

## Purpose
MCP tool logic, test scripts, and experimental code for the Antigravity ecosystem.
This workspace is SEPARATE from `D:\mimo code`. Do not combine them.

## Architecture
- MCP server configs: `.mcp.json` (filesystem, fetch, sequential-thinking, memory, brave-search, tavily, video-vision)
- Monorepo structure: `apps/` and `packages/` directories
- Node.js project with `package.json` at root

## Key Files
| File | Purpose |
|------|---------|
| `.mcp.json` | MCP server definitions |
| `CLAUDE.md` | Claude-specific instructions |
| `CODEBASE.md` | Codebase overview |
| `PLAN-AWESOME.md` | Feature roadmap |
| `apps/` | Application code |
| `packages/` | Shared packages |

## MCP Servers Configured
- `filesystem` — Read/write to reports and workspace dirs
- `fetch` — HTTP requests
- `sequential-thinking` — Structured reasoning
- `memory` — Persistent memory
- `brave-search` — Web search
- `tavily` — Alternative web search
- `video-vision` — Video analysis

## Constraints
- This is a SEPARATE workspace from `D:\mimo code`
- Do not merge configs or confuse project boundaries
