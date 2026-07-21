<RULE[workspace]>
=== ANITGRAVITY WORK — Workspace Rules ===

# Project Context
This workspace (`D:\anitgravity work`) contains the MCP tool logic, test scripts, and experimental code.
This is SEPARATE from `D:\mimo code`. Never merge them.

# Mandatory First Step
Before any work: read `CONTEXT.md` in this directory for current architecture state.

# Build & Test
- Node.js project. Run `npm test` if tests exist.
- MCP servers defined in `.mcp.json` — do not modify without explicit user approval.

# Architecture
- Monorepo: `apps/` for applications, `packages/` for shared code
- MCP config: `.mcp.json` at root
- TypeScript project: `tsconfig.json` at root

# Constraints
- Never combine this workspace with `D:\mimo code`. They are separate projects.
- Do not modify `.mcp.json` server entries without user approval.
- Keep test scripts (`test-*.js`) functional — they are verification tools.

# Code Style
- TypeScript strict mode. ESM imports with `.js` extensions.
- 2-space indent. No trailing commas in JSON.
</RULE[workspace]>
