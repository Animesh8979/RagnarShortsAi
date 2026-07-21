# RagnarShortsAi

An autonomous, agentic video production system designed to generate publishable, high-retention short-form video content programmatically. Built with Remotion, React, and an ensemble of specialized AI subagents for scriptwriting, asset generation, voiceover, and rendering.

## Architecture

This is a monorepo consisting of:
- \pps/\ - Core applications including the Remotion-based video rendering studio (\pps/studio\), and the pipeline orchestrator (\pps/pipeline\).
- \packages/core/\ - Shared core logic (AI, config, media, security, types, utils).
- \packages/skills/\ - Specialized AI skills for agents (scriptwriter, ponytail, video-vision, etc.).

## Key Infrastructure

- **Video Generation**: Programmatically generated using [Remotion](https://remotion.dev/). Uses SVG manipulations and carefully orchestrated keyframes for character animation.
- **AI Router**: An AI router service provides inference for agents (NVIDIA and Nara models).
- **Scripts and Story**: Handled by AI scriptwriter skills using an OllamaClient with OpenAI-compatible fallbacks.

## Development Constraints and Guidelines

- **Zero-Cost Principle**: All processes and tools must be strictly free.
- **Hardware Profile**: Optimized for low-end GPUs (e.g., GTX 1650 4GB). Hardware acceleration is carefully managed to prevent OOM errors.
- **TypeScript & ESM**: Strict TypeScript mode. Uses Node16 module resolution. Relative imports require \.js\ extensions.

## Build and Test

- Install dependencies: \
pm install\
- Build all packages: \
pm run build\
- Run tests: \
pm test\

*Note: Remotion projects should use \emotion bundle\ instead of \emotion build\ for compilation.*

## Security

- All API keys and credentials must be stored in \.env\ files.
- \.env\ files are ignored by git to ensure secrets are not compromised.
- Do not modify \.mcp.json\ server entries without explicit authorization.
