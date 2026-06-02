# FIFA World Cup 2026 — content niche plan (L115)

_2026-06-02. Kickoff ≈ June 11 2026 (USA/CAN/MEX, 48 teams, 104 matches → ~July 19).
~9 days to be live + classified. Next niche to target — before / on / after / highlights._

## Decisions (locked)
- **Footage**: mostly graphics, BUT layer commentary over **short (<10s) fair-use clips**
  for highlights (user accepted the reach-vs-risk trade) → requires the survival kit below.
- **Channel**: **test on the existing clip channel (RagnarShortsAI + @ragnarautomated)** first
  — it already runs reused-clip content, so football clips fit its risk profile and the
  geopolitics organic channel stays clean/classified. Spin a dedicated football channel once validated.
- **Launch**: **all four phases day-one** for June 11.

## The 4-phase engine (reuses our pipeline; football = the same maps/data/portrait engine)
| Phase | Format | Built on |
|---|---|---|
| **Before** | Previews, predictions, "X vs Y who wins", group/bracket graphics, host-city map, player stat-cards, formation diagrams | V9/V10 graphics, `geo-coords` (host cities), `person-portrait` (players), Ragnar→pundit voice |
| **On (live)** | Score/"GOAL ⚽" data cards, live text reactions (NO footage live) | data-board scenes |
| **After** | Reaction/analysis, player ratings, "what we learned", tactical breakdown | graphics + data + pundit |
| **Highlights** | (a) **animated goal-recap** (goal re-drawn on a pitch diagram — category-of-one, copyright-proof) + (b) commentary over <10s fair-use clips | new `SimulationScene`-style pitch animator + clip lane reframe |
| **Clip lane** | React to football streamers/creators (watch-alongs, funny bits) | existing clip lane (reframe + humor) |

## Copyright SURVIVAL KIT (mandatory — clips are in play)
1. **<10s clips only**, never a full goal sequence; always **heavily transformed**: commentary VO + on-screen analysis graphics + zoom/reframe + our grade → a *new work*, not a repost.
2. **Prefer low-protection footage**: crowd/celebration/manager reactions, fan-cam, post-match pressers, training — not the clean broadcast goal feed.
3. **Lean on the safe formats** (graphics/recaps/predictions) for the bulk; clips are seasoning, not the meal.
4. **Quarantine to RagnarShortsAI only** — never the geopolitics organic channel (protects classification + monetization there).
5. **Strike monitor**: a daily check for copyright claims/strikes; on first strike, auto-fall-back to graphics-only for that match and log it. Hard rule: **never re-upload a struck clip**.
6. Platform-unique masters (already built) + heavy edit reduce Content-ID match rate.

## Fixture-driven content calendar (the unfair advantage — the schedule is KNOWN)
A `lib/fifa-schedule.js` pulls the fixture list (free tier: football-data.org / API-Football,
or `crawl4ai` scrape) → a per-match calendar the orchestrator pre-schedules:
- **T-24h**: preview + prediction (safe graphics).
- **T-0**: matchday card / "who wins" (safe).
- **T+1h**: instant reaction + player ratings (graphics; optional <10s reaction clip).
- **T+24h**: analysis + animated goal-recap.
Velocity-watch already exists → trend-jack upsets/red-cards within minutes.

## New bits vs reuse
- **New**: `config/channel-niches.json` football section (keywords + sources); `lib/fifa-schedule.js`
  (fixtures/lineups/stats via free API); a **pitch-diagram goal-recap** scene (extends the V9/V10
  `SimulationScene` pattern — players as dots, pass/shot arcs via `geo-coords`-style projection on a
  pitch); a Ragnar **football-pundit persona** variant (`ragnar-persona.js` add a `football` voice + CTAs).
- **Reuse**: the entire V9/V10 graphics engine, portraits, clip reframe + humor, the bandit + reward loop
  (it'll find which football formats pop), auto-upload (route to RagnarShortsAI + @ragnarautomated),
  carousels (bracket/stat decks — big on IG saves).

## ~9-day build order (to be live + classified before June 11)
1. **Data**: `lib/fifa-schedule.js` + confirm a free fixtures/stats source. (day 1–2)
2. **Niche config + pundit persona** + football debate-CTAs. (day 2)
3. **Pre-match graphics** (preview/prediction/stat-card/host-city map/bracket) via V9 + test-render. (day 3–4)
4. **Pitch-diagram goal-recap** scene + render-test. (day 4–5)
5. **Clip lane** football-creator reactions + the survival-kit guardrails (<10s, transform, strike monitor). (day 5–6)
6. **Calendar orchestrator** wires T-24h/T-0/T+1h/T+24h per fixture. (day 6–7)
7. **Ship 2–3 test videos on RagnarShortsAI**, read the reward loop, fix, then full group-stage coverage at kickoff. (day 7–9)

## Constraints + gate
$0 / no-card · D:\ · CPU/no-GPU · free football API tier · no raw-footage reposts · strike monitor on.
**Gate**: a pre-match preview + an animated goal-recap render clean and pass the hook/resonance bar;
the first 3 test uploads draw zero copyright claims and a positive reward trend before scaling.
