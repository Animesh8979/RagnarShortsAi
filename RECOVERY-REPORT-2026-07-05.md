# Recovery Report — 2026-07-05

_Session recovery + work resumed from the crashed 2026-07-04T14:10:27Z MiMo Code session._

---

## 0. Why the last session wasn't opening

**[VERIFIED]** The previous MiMo Code session (06-04 started ~9:36 AM local / `2026-07-04T14:10Z`) was not opening because the **`opencode` runtime** that hosts the session crashed with a `TypeError: A.replace is not a function` in its own internal bundle (`B:/~BUN/root/src/index.js:980`), not because of any corruption in your project or the session's saved state.

- The session's memory (`D:\mimo-sandbox\data\memory\sessions\ses_0d2889b71ffeawhUqn1IR69G3l\checkpoint.md`, 107 lines, 11.9 KB) was **intact and readable** — backup taken at `D:\mimo-sandbox\data\memory\sessions_backup_20260705132445`.
- The project folder **`D:\anitgravity work`** (spelled "anitgravity" — keep this spelling) was untouched on disk. Git branch `claude/god-tier-2026-05-22`, HEAD `b680e38 docs(phase-1): research complete`.

**[INFERRED, high]** The crash is in the opencode runtime's tool/formatter render path: code calls `str.replace(/\n$/,"")` on a token that wasn't a string (a number, `undefined`, or an object from a tool result). This lives inside the packed Bun bundle, which **cannot be patched from this project** — it's the opencode binary, not your code. The bug should be filed upstream. A clean restart of opencode resolves the immediate hang; the crash is intermittent and only triggered by a specific tool-result shape.

## 1. What the last session was actually doing

Quoted from `checkpoint.md` §1 Active intent:

> "now check the last session and tell me what we need to do. also make sure video-vision skill or mcp is ready to use so you can watch and upgrade the way it is used, because remotion studio renders are full of flaws"

Plan: recover prior Phase-1 work → build the `video-vision` skill to diagnose Remotion render flaws → continue into Phase 2 (Remotion Studio polish) per `ROADMAP.md`.

## 2. State found on disk today (vs. the stale checkpoint)

**IMPORTANT**: The checkpoint was written early. The disk state is far more advanced than the checkpoint's "needs building" framing suggested.

| Item | Checkpoint said | Disk reality (today) | Source |
|---|---|---|---|
| `video-vision` package | "EMPTY scaffolding, no `src/`" | **5 source files, 890 LOC, compiled to `dist/`** | `packages/skills/video-vision/src/` |
| `video-vision` MCP server | (not mentioned) | **Real MCP server** with 3 tools | `src/mcp-server.ts` |
| `reports/video-vision-mcp` prototype | "placeholder `analyzeFrameColors`, needs replacing" | Still has the hardcoded placeholder colors (lines 112-126) | `reports/video-vision-mcp/src/index.ts:119-125` |
| `video-watch` skill | "operational ffprobe QA" | Confirm still present, ffprobe-based | `packages/skills/video-watch/` |
| `dist/` of `video-vision` | (not mentioned) | Present but stale until rebuilt today | `dist/*.js` |
| `node_modules\@antigravity` (in skill dir) | (not mentioned) | Missing locally — but hoisted to repo root via npm workspaces | root `node_modules/@antigravity/*` |

## 3. The `video-vision` skill — architecture (verified by reading all 5 source files)

Five files in `packages/skills/video-vision/src/`:

- **`types.ts`** (83 LOC) — shared interfaces: `FrameStats`, `VideoMeta`, `FlawIssue`, `VisionReport`, `AnalyzeOptions`, `IssueSeverity`.
- **`extractor.ts`** (277 LOC) — `probeVideo()` runs `ffprobe` via `safeExec` (injection-safe, no shell). `extractFrameStats()` probes dims then spawns `ffmpeg` to downscale to `analysisWidth` (default 320) and stream raw `rgb24`; a `Buffer`-based path (`extractFrameStatsBinary`) captures binary stdout because `safeExec` `.toString()`s it. `computeFrameStats()` computes per-frame mean/std luma, 16-bin luma histogram, HSV saturation, edge-band luminance — **pure JS, no native OpenCV**.
- **`analyzer.ts`** (314 LOC) — `analyze()` runs 12 detectors (black-frame open/close, freeze frames, letterbox/pillarbox, aspect ratio, duration mismatch, brightness drift, clipping, low saturation, text legibility, flicker) and yields a `VisionReport` with a `passed` boolean + 0–100 `qualityScore`. Penalties: info=0, warn=6, error=18, critical=40.
- **`index.ts`** (75 LOC) — public API: `analyzeVideo()`, `analyzeAndReport()`, plus typed re-exports.
- **`mcp-server.ts`** (143 LOC) — exposes 3 MCP tools over stdio: `analyze_video`, `get_video_info`, `extract_frames_debug`.

It correctly imports the workspace deps:
- `@antigravity/security` → `safeExec`, `SafeExecOptions` ✓ verified in source
- `@antigravity/config` → `validateDrivePath` (enforces D: drive only) ✓
- `@antigravity/utils` → `logger`, `writeFile` ✓

## 4. Verification done today (all [VERIFIED])

1. **Backup**: Full session-memory backup at `D:\mimo-sandbox\data\memory\sessions_backup_20260705132445` (10 files).
2. **Compile**: `npx tsc` in `packages/skills/video-vision/` → **exit 0, zero type errors**. `dist/*.js` regenerated.
3. **MCP smoke test 1**: Server boots → "video-vision-mcp running on stdio", stays alive.
4. **MCP smoke test 2**: `initialize` JSON-RPC round-trip → server replied with `{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"video-vision-mcp","version":"1.0.0"}}}`.
5. **MCP smoke test 3**: `tools/list` after `initialize` → returned all 3 tools with correct schemas.
6. **Runtime deps**: `ffmpeg` and `ffprobe` are on PATH (`C:\Users\shukl\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg...\bin\`).

## 5. Work completed this recovery session

| Task | Status | File |
|---|---|---|
| Defensive backup of all 5 sessions | ✅ done | `D:\mimo-sandbox\data\memory\sessions_backup_20260705132445\` |
| Identify crashed session + cause | ✅ done | session `ses_0d2889b71ffeawhUqn1IR69G3l`, opencode runtime crash |
| Read all `video-vision` source | ✅ done | 5 files / 890 LOC reviewed |
| Rebuild stale `dist/` | ✅ done | `tsc` clean |
| MCP server smoke test | ✅ done | `initialize` + `tools/list` round-trip |
| Create `SKILL.md` (was the only missing piece) | ✅ done | `packages/skills/video-vision/SKILL.md` |
| Real-render `analyze_video` end-to-end run | ⏳ blocked | No render file exists yet — `D:\antigravity-renders` and `apps/studio/out/` both don't exist |

## 6. Where to start (next concrete work)

In priority order:

### A. Trigger the first real Remotion render so `video-vision` has something to chew on
The skill is built and compiles, but has **never been run against a real video**. The blocker is that no render output exists:
- `D:\antigravity-renders\` — does not exist.
- `D:\anitgravity work\apps\studio\out\` — does not exist.

→ Go into `apps/studio`, run `npm install` if needed, then `npm run render` (or invoke Remotion's render CLI) to produce at least one `.mp4` in `D:\antigravity-renders\`. **Then** run:
```powershell
node -e "import('./packages/skills/video-vision/dist/index.js').then(m => m.analyzeVideo('D:\\antigravity-renders\\<file>.mp4', { expectedDurationSec: <N>, expectedAspectRatio: 0.5625 })).then(r => console.log(JSON.stringify(r, null, 2)))"
```
If `passed = false`, inspect `r.issues` → those are the visual defects that need fixing in `apps/studio/src/compositions/ExplainerVideo.tsx` and components.

### B. Discard or fix the `reports/video-vision-mcp` prototype
`reports/video-vision-mcp/src/index.ts:119-125` still returns **hardcoded placeholder colors** instead of decoding the image. Per checkpoint §10, the decision is: promote `packages/skills/video-vision` as the canonical skill and either:
- (option 1, recommended) **delete** `reports/video-vision-mcp/` entirely — `packages/skills/video-vision` is strictly more capable, and the reports/ folder is the prototype that should now retire, OR
- (option 2) port `video-vision`'s `computeFrameStats` into the prototype and update it. But this duplicates the package — prefer option 1.

### C. Resume `ROADMAP.md` Phase 2 (Remotion Studio polish)
Once `video-vision` flags concrete flaws in a real render, fix them in Studio components: `Root.tsx`, `ExplainerVideo.tsx`, `LottieCharacter.tsx`, `AuroraBackground.tsx`. Common pitfalls the detectors target:
- Composition `width/height` ≠ 1080×1920 (aspect `0.5625`) → `aspect_ratio_wrong` / letterbox.
- Sequence missing `durationInFrames` → `freeze_frame`.
- Fade overlay never lifts → `black_frame_opening`.
- Aurora gradient too dark / never brightens → `too_dark`.

### D. Commit the recovered work
Nothing has been git-committed since `b680e38`. After step A produces its first `passed` verdict, stage and commit:
```powershell
Set-Location D:\anitgravity work
git add packages/skills/video-vision/ RECOVERY-REPORT-2026-07-05.md
git commit -m "feat(video-vision): operational pixel-level render diagnostics skill"
```
Leave the v1-codebase deletions (the hundreds of `D` entries) to be addressed separately — they're a deliberate cleanup, not part of this recovery.

## 7. The opencode crash — should be filed upstream

The URL you pasted prefilled a bug report for the `anomalyco/opencode` repo (which I did NOT file, since that needs `gh auth` and is an outward-facing action I won't take without confirmation). A real bug report should include:

- **opencode version**: `0.0.0-prod-202607011042` (from the URL).
- **Stack**: dozens of frames all in `B:/~BUN/root/src/index.js` — frames `PY0` at `:980:3648` then `SY0:981:30`, `Im/h9/r/b8` (render-stream writer), `Nm` (`:59098`), `rB2` (`:973:737`, crypto helper), `bB2` (`:983:1365`). The recursion through `Im/h9/r/b8/Nm` repeating indicates a render/stream-stack walking tool results.
- **Symptom**: `TypeError: A.replace is not a function. (In 'A.replace(/\n$/,"")', 'A.replace' is undefined)` — runtime calls `.replace()` on a non-string token during stream rendering.
- **Likely root cause**: a tool result (or stream chunk) is being passed into the opentui text-render path as a non-string (number, undefined, object). The renderer assumes `string` and calls `.replace(/\n$/,"")` without coercing.
- **Minimal repro path needed**: a tool call that returns a non-string chunk (e.g. a numeric or `undefined` field) into a streaming render surface.

Until a patched opencode build ships, the workaround is to **restart the opencode session** — the project files and session memory are not corrupted.

---

## Appendix — file map of work touched

| Path | Action | LOC |
|---|---|---|
| `D:\mimo-sandbox\data\memory\sessions_backup_20260705132445\` | Backup | (full session memory) |
| `D:\anitgravity work\packages\skills\video-vision\dist\*.js` | Recompiled | 5 files |
| `D:\anitgravity work\packages\skills\video-vision\SKILL.md` | **Created** (was missing) | 96 lines |
| `D:\anitgravity work\RECOVERY-REPORT-2026-07-05.md` | **Created** (this file) | — |

No other project files were modified. Project git working tree left exactly as the 4-July session left it.
