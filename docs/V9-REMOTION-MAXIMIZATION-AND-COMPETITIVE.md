# V9 Story-Motion — Remotion maximization + competitive check

_Built 2026-06-02. Answers the brief: "research every way to maximise Remotion's
use, check other YT/Insta reels and prove what we do is better, with proper maps
(real names from the script), real faces, a talking-motion presenter, everything
content-driven."_

## 1. What the research said (sources)

**Remotion is a generative engine, not just an overlay layer.** Official + community references:
- [Remotion maps doc](https://www.remotion.dev/docs/maps) — animated maps via MapLibre GL JS + Turf.js (real coastlines). For renders: `interactive:false`, `fadeDuration:0`, drive everything from `useCurrentFrame()` (its own animations cause render flicker).
- [Remotion charts rules](https://github.com/remotion-dev/skills/blob/main/skills/remotion/rules/charts.md) — bar/line/pie via SVG/D3; **disable all library animations, drive from `useCurrentFrame()`**.
- [@remotion/transitions](https://www.remotion.dev/docs/transitions/) + [springTiming](https://www.remotion.dev/docs/transitions/timings/springtiming) — `TransitionSeries` crossfade/slide/wipe between scenes.
- [@remotion/paths](https://www.remotion.dev/docs/paths), [@remotion/lottie](https://www.remotion.dev/docs/lottie), [@remotion/three](https://www.remotion.dev/docs/three), [@remotion/gif], [@remotion/skia], [@remotion/google-fonts], [visualizeAudio()](https://www.remotion.dev/docs/visualize-audio) — the full toolkit.

**What top faceless geopolitics channels actually do (and what wins):**
- [Maps are the powerhouse of geopolitics YouTube](https://rizzle.com/blog/post/maps-are-the-powerhouse-of-youtube-success-for-geopolitics-daily) — animated maps with bold country names/outlines are THE format ([World Wide View](https://www.youtube.com/@TheWorldWideVieww), Geopolitics Daily).
- [FlowShorts / Miraflow 2026](https://flowshorts.app/blog/best-video-ideas) — the cited #1 viral format is literally **"surprising fact + map animation"**; **dynamic pulsing captions → +40% faceless success**; 50–60s sweet spot (76% completion); trending audio in first 5s → +21% reach; every winner follows hook → tension → payload → CTA.
- Most faceless channels are AI-voice + one repeated visual template. Their weakness: **one style applied to every beat**, generic stock, no real geography, no presenter.

## 2. What we now do — and why it beats the template approach

The differentiator is the **director plan** (`lib/director-plan.js`): it reads each beat's
actual words and routes that beat to a **content-true scene** — instead of one template
stamped over the whole video. Each beat shows what the line literally says.

| Capability | Typical faceless geopolitics short | **Ragnar V9 (now)** |
|---|---|---|
| Maps | generic stock globe / none | **real countries named in the script** as labeled pins + animated strike-arc, region auto-zoom (`lib/geo-coords.js` → `RealMapScene`) |
| Faces | none, or a stock photo | **real Wikimedia portrait** of the named leader + red news chyron (`person-portrait` → `LeaderPortraitScene`) |
| Presenter | none (faceless = no host) | **talking-motion anchor** whose mouth lip-flaps to the word timings + rotating-globe set (`PresenterScene`) |
| Per-beat visual | one template, repeated | **different scene per beat**, chosen from the line: map / portrait / data-gauge / presenter |
| Data moments | static text | animated gauges, counters, funding-flow, escalation ladders (`StakesMeter`, `DeathTollLedger`, `FundingFlow`, …) driven by `useCurrentFrame()` |
| Captions | (the +40% lever) | per-word karaoke, yellow power-word swap, spring pop-in |
| Hook structure | hook→tension→payload→CTA | director assigns `hook / evidence / turn / cost / payoff` purposes |
| Cost / GPU | paid SaaS (Pictory/Runway/etc.) | **$0, CPU + Chromium, no GPU**, fully local |

**Verdict:** on the two proven levers — *real maps* and *dynamic captions* — we now match or
beat the category, and the **per-beat content-matched routing + a real presenter** are things
most faceless competitors don't do at all. The honest edge isn't "more gimmicks"; it's that
the visual is *true to the sentence* on every beat.

## 3. Honest gaps + roadmap (so we keep climbing)

1. **MapLibre real-coastline maps** — our map is a clean labeled-pin/arc grid (reads clearly,
   $0, zero deps). The next tier is `@remotion/maps` (MapLibre) for actual coastlines with a
   free tile source. Upgrade path is isolated to `RealMapScene`.
2. **Scene transitions** — scenes hard-cut today. `TransitionSeries` + `springTiming` would
   crossfade/whip-pan between beats for a more produced feel.
3. **Length + trending audio** — we run ~35s; the data favors 50–60s and trending audio in the
   first 5s (+21%). Script-length target + an audio lane are separate, cheap wins.
4. **Presenter polish** — the anchor is a clean vector stickman (suit, tie, globe, lip-flap).
   A Lottie/Rive rig or a Wikimedia-portrait-as-anchor are later options.

## 4. How it's wired (so it's reproducible)

- `lib/geo-coords.js` — place-name → lon/lat + display label (geopolitics keyword set); `placesInText()`.
- `lib/director-plan.js` — per beat attaches `places` (real geography) + `person` (leader) and
  routes modules: ≥2 places → `crisis_map`; a leader w/ no place → `leader_portrait`; one
  abstract beat → `presenter_brief` (guaranteed once).
- `src/scenes/V9StoryMotionComposition.jsx` — `StoryScene` router → `RealMapScene` /
  `LeaderPortraitScene` / `PresenterScene` / `EvidenceScene` (footage + data board).
- `tools/render-organic-v9-sidecars.js` — builds the plan, **stages real Wikimedia portraits**
  into the render public dir, renders `V9StoryMotionComposition`.
- `tools/render-still.js` — one-frame QA (catches scene bugs in ~1 min, not a 500s render).

All within the hard constraints: **$0, D:\ only, CPU/Chromium, no GPU, no silent fallbacks.**
