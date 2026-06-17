---
phase: 1
level: 2
researched_at: 2026-06-17
---

# Phase 1 Research: Remotion Skills, MCPs, and Best Practices

## Questions Investigated
1. What are the best skills, MCPs, or tools people download from GitHub for Remotion?
2. What are the official best practices for using Remotion?
3. What is the current Remotion setup on the system?

## Findings

### System Analysis
The current system runs **Remotion 4.0.473**. It heavily utilizes first-party packages like `@remotion/effects`, `@remotion/three`, `@remotion/lottie`, and `@remotion/transitions`. The primary rendering entry points are defined as `src/index.jsx` and `src/v8-index.jsx`.

### Top 5+ GitHub Skills, MCPs, and Tools for Remotion
The community has rapidly adopted AI Agent Skills and MCPs (Model Context Protocol) specifically for Remotion to enforce best practices when LLMs generate video code. The top downloads and repositories include:

1. **[remotion-dev/skills](https://github.com/remotion-dev/skills)** 
   The official repository for Remotion Agent Skills. Includes the `remotion-best-practices` skill that can be directly installed via `npx skills add remotion-dev/skills` to feed AI agents rules on audio, video, animations, and captions.
2. **[MomoFadaly/remotion-best-practices](https://github.com/MomoFadaly/remotion-best-practices)**
   A community-maintained Claude skill bundle that acts as a subject-matter expert for Remotion development, providing structured rules for FFmpeg, assets, and procedural animations.
3. **[digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit)**
   An AI-native toolkit specifically designed for video production and programmatic rendering via Claude Code.
4. **[manalkaff/remotion-prompts](https://github.com/manalkaff/remotion-prompts)**
   A curated collection of high-quality prompts, workflows, and context files demonstrating how to command AI to build specific Remotion use-cases like product demos and map animations.
5. **[av/remotion-bits](https://github.com/av/remotion-bits)**
   A highly downloaded collection of composable, ready-made animation components (text effects, particle systems, charts, etc.) that save time on foundational boilerplate.
6. **[reactvideoeditor/remotion-templates](https://github.com/reactvideoeditor/remotion-templates)**
   Open-source library of free Remotion effects and animations, such as slide-in text, countdowns, and progress steps.

### Remotion Best Practices (Official Learnings)

**Player Performance:**
- Avoid frequent re-renders of the `<Player>` component, especially when reacting to rapidly updating state (like the current time), as this drastically degrades browser and timeline performance.

**Asset & Font Loading:**
- When using layout utilities (e.g., `measureText`), ensure custom fonts are fully loaded before performing width/height calculations. Use `waitUntilDone()` or Remotion's higher-order components to block the render until fonts are ready.

**Security:**
- Be cautious with `REMOTION_` prefixed environment variables, as they are exposed to the headless browser. Never expose AWS credentials or sensitive keys to the frontend during `@remotion/lambda` renders.
- If using `disableWebSecurity` as a workaround for CORS, be aware of the strict security implications if you are rendering third-party untrusted content.

**Debugging & Synchronization:**
- Use `delayRender()` and `continueRender()` with strict timeouts. If a `delayRender()` fails to resolve (e.g., an image URL 404s), it will cause the entire render to hang indefinitely unless handled.
- Always use `cancelRender(err)` to gracefully abort and expose errors that prevent the render from completing successfully.

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent Integration | `remotion-dev/skills` | We should leverage the official Remotion best practices skill directly into our AI prompt context to prevent hallucinatory component usage. |

## Patterns to Follow
- Use `delayRender` properly with fallback timeouts.
- Separate purely static assets from stateful components to optimize timeline scrubbing.

## Anti-Patterns to Avoid
- Exposing secrets in `REMOTION_` env vars: This leaks secrets to the browser runtime.
- Forgetting `continueRender()`: Leads to frozen, timed-out renders.

## Ready for Planning
- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
