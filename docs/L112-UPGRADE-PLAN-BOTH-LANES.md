# L112 — Out-of-the-box upgrade plan (organic + clipping) + upload sequence

_2026-06-02. Brief: "research more upgrades, out-of-the-box, make it the best —
same planning for the clipping batch — then upload both batches with every
upgrade done." This is the ranked plan; ✅ = shipped/verified this session,
▶ = applied now, ⏭ = next verified upgrade (ranked by views-per-effort)._

## Research levers (sources)
- **Pattern interrupts** — a visual reset (zoom-punch, flash, freeze-frame) every scene/cut
  keeps attention; rapid zooms + color changes beat static openings ([JoinBrands](https://joinbrands.com/blog/youtube-shorts-best-practices/), [OpusClip hooks](https://www.opus.pro/blog/youtube-shorts-hook-formulas)).
- **Curiosity gap / open loop** — 0.3s flash of the payoff up front, then cut back ([virvid](https://virvid.ai/blog/first-3-seconds-hook-faceless-shorts-2026)).
- **Mute-legible** — 3–6 words on-screen + constant movement triggers peripheral attention.
- **Clips: active-speaker auto-reframe + viral-moment scoring** are the category standard
  (OpusClip/Choppity/Reap) — face-tracking vertical crop that follows whoever's talking ([Choppity](https://www.choppity.com/blog/best-ai-podcast-clip-makers-generators/), [reap](https://reap.video/blog/ai-video-editing-for-podcasters)).
- **First-30s test audience decides reach** — % viewed is the only metric that matters.

## ORGANIC lane (RagnarShortsUltimate — geopolitics)
- ✅ **V9 director-routed scenes** — real-name maps (geo-coords), real Wikimedia portraits +
  chyron, talking-presenter stickman (word-synced lip-flap), content-matched data boards
  (gauges/counters/flows), per-word karaoke. Each beat shows what the line says. Render-verified.
- ✅ V9 is now the **primary** organic look (`ORGANIC_STORY` default-on, V8 fallback).
- ⏭ **Scene zoom-punch** pattern-interrupt on each beat entry (spring scale 1.04→1.0).
- ⏭ **`@remotion/transitions`** TransitionSeries crossfade/whip between beats (more produced).
- ⏭ **MapLibre real-coastline maps** (upgrade `RealMapScene`, free tiles) — current is a clean labeled-grid.
- ⏭ Target **45–55s** length (50–60s = 76% completion) + guaranteed 0.3s cold-open payoff flash.

## CLIPPING lane (RagnarShortsAI — performance-weighted creators)
- ✅ **cut-on-peak** multi-cut, podcast-aware density (4–6 cuts, ≤1 SFX — fixed the "sound every
  5–6s" + "cuts mid-joke" complaints), **ML viral moment-selector**, **reaction-commentary
  captions**, brain-rot grade, karaoke, coherence gate. (L108–L110, verified.)
- ⏭ **Active-speaker auto-reframe** (THE differentiator): per-keyframe face detect (OpenCV Haar,
  CPU/$0/no-GPU) → dynamic 9:16 crop that follows the speaker. In `split-screen.js`. Biggest jump.
- ⏭ **Zoom-punch on cuts** (in the crop stage) — visual reset per cut, mute-friendly.
- ⏭ **Emoji/sticker accents** on power words in the caption track.
- ⏭ **Most-replayed heatmap → clip-window targeting** (clip the segment the original audience re-watched).

## Execution + upload sequence (this is the plan being run)
1. **Render-only batch** — organics auto-render via V9 (maps/faces/presenter); clips via the
   upgraded L108–L110 pipeline. No `--auto-upload`.
2. **QA** — pull frames from each rendered organic + clip; confirm maps show real names, portraits
   are real, captions track, no dead-tail. Reject + re-roll any failure.
3. **Upload** — 4h gaps, 4-channel routing (organic → RagnarShortsUltimate + @ragnar_ultimate007;
   clip → RagnarShortsAI + @ragnarautomated), platform-unique masters, then verify live URLs.

Constraints honored throughout: **$0 / no card · D:\ only · CPU/Chromium, no GPU · no silent
fallbacks · clip↔organic isolation · never unlist/delete live good content.**
