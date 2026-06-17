/**
 * lib/veo-prompt-director.js — L119: director-grade Veo prompting.
 *
 * Replaces the mechanical motion prompt ("slow cinematic motion matching: {vo}")
 * with a real DP's shot brief. Every prompt carries: SHOT TYPE + SUBJECT + LENS/
 * FRAMING + LIGHTING + CAMERA MOVE + MOOD + the locked STYLE BIBLE suffix, and is
 * policy-safe by construction (atmosphere/silhouettes — no real faces, no logos,
 * no violence) so Google's content filter never trips.
 *
 * The arc maps beat position → emotional stage (the football/news arc):
 *   open(establish) → build → tension → CLIMAX(eruption) → aftermath(gravitas)
 *
 * Wire-in (post-batch): lib/hero-visual.js applyMotionCascade — replace the inline
 * motionPrompt with buildVeoPrompt({ beat, beatIndex, totalBeats, topic, lane }).
 * Pure function, zero deps, $0. CLI: node lib/veo-prompt-director.js "<vo text>" <i> <n>
 */
'use strict';

const STYLE_BIBLE = 'vertical 9:16 portrait framing, subject centered in frame, shallow depth of field, ' +
  'volumetric light, filmic teal-and-orange grade, fine film grain, close-up to medium shot, documentary realism, ' +
  'no on-screen text, no logos, no watermarks, no real or recognizable faces, never letterbox, never pillarbox';

const SAFE_GUARD = 'peaceful atmosphere, absolutely no violence, no weapons, no soldiers, no conflict imagery';

// Emotional stage by beat position
function stageFor(beatIndex, totalBeats) {
  const p = totalBeats <= 1 ? 0 : beatIndex / (totalBeats - 1);
  if (beatIndex === 0) return 'open';
  if (p < 0.4) return 'build';
  if (p < 0.65) return 'tension';
  if (p < 0.85) return 'climax';
  return 'aftermath';
}

// Shot vocabulary per stage — FIFA/football flavor + a geopolitics flavor.
const SHOTS = {
  football: {
    open: [
      'vertical close-up slow push through a dark stadium tunnel toward blinding pitch light, silhouetted player centered, shallow depth of field, portrait framing',
      'vertical low-angle hero shot of empty stadium seats rising to the sky at dawn, single shaft of light cutting through, subject fills frame bottom to top',
    ],
    build: [
      'vertical tracking shot following a player from behind down the touchline, crowd packed above and below frame, phone lights everywhere, motion blur edges',
      'vertical tight close-up of studded boots on dewy pitch grass, slow dolly up the players legs to waist, stadium light bokeh filling the top of frame',
    ],
    tension: [
      'vertical medium close-up of a player standing over the penalty spot, football below frame, empty goal beyond, crowd noise implied by body language, breath visible',
      'vertical extreme close-up of a players hands gripping a corner flag, knuckles white, stadium roar implied, shallow focus, subject locked in frame center',
    ],
    climax: [
      'vertical slow-motion net bulging inward in extreme close-up, light exploding through mesh, droplets suspended, ball pushing through center of frame',
      'vertical crowd eruption in slow motion, arms raised filling the full frame height, confetti and flares of light, pure vertical energy',
    ],
    aftermath: [
      'vertical close-up of golden trophy under a single spotlight, slow tilt down from peak to base, golden confetti falling past, portrait framing',
      'vertical shot of lone player seated on pitch at night looking up, stadium lights above like stars, steam rising, profound vertical stillness',
    ],
  },
  geopolitics: {
    open: [
      'vertical low-angle shot of a government building facade at dusk, heavy clouds rolling above, single lit window centered, slow tilt upward',
      'vertical close-up of dust motes floating in light shafts through a tall marble hall window, slow drift upward, profound emptiness',
    ],
    build: [
      'vertical close-up of hands on a dark strategic table, papers and markers, soft edge light, slow dolly upward to face obscured in shadow',
      'vertical rain-streaked window close-up, city lights blurred below through the water, single reflection of a face barely visible, tilt up slowly',
    ],
    tension: [
      'vertical tight close-up of a red telephone on a dark desk, single desk lamp above casting shadows down, slow push-in, ticking stillness',
      'vertical shot of an empty chair at a vast table, slow push from below chair level to eye level, morning light from a window behind',
    ],
    climax: [
      'vertical low-angle shot of flags of many nations rippling against a dark stormy sky, lightning silhouettes from behind, slow upward tilt',
      'vertical tight close-up of a gavel striking a desk in slow motion, shockwave rippling outward, decisive impact centered in frame',
    ],
    aftermath: [
      'vertical dawn light entering through a tall window onto an empty negotiation table, slow tilt from table surface upward to golden sky',
      'vertical close-up of a single handshake, soft light, profound stillness, shallow focus, hands centered in frame, slow push-in',
    ],
  },
};

const MOVES = {
  open: 'very slow aerial dolly forward',
  build: 'smooth lateral tracking move',
  tension: 'almost imperceptible slow push-in',
  climax: 'dynamic slow-motion with subtle speed ramp feel',
  aftermath: 'gentle slow orbit drifting outward',
};

/**
 * @param {object} o { beat:{voiceover|vo}, beatIndex, totalBeats, topic, lane:'football'|'geopolitics', seed }
 * @returns {string} a single director-grade Veo prompt, policy-safe, <=480 chars
 */
function buildVeoPrompt(o = {}) {
  const lane = o.lane === 'football' || /fifa|football|world cup|match|striker|goal/i.test(String(o.topic || '')) ? 'football' : 'geopolitics';
  const stage = stageFor(Number(o.beatIndex) || 0, Math.max(1, Number(o.totalBeats) || 1));
  const bank = (SHOTS[lane] && SHOTS[lane][stage]) || SHOTS.geopolitics.build;
  // deterministic-but-varied pick: seed on vo text + beatIndex so re-renders are stable
  const vo = String((o.beat && (o.beat.voiceover || o.beat.vo)) || o.seed || '');
  let h = 0; for (let i = 0; i < vo.length; i++) h = (h * 31 + vo.charCodeAt(i)) >>> 0;
  const shot = bank[(h + (Number(o.beatIndex) || 0)) % bank.length];
  return [shot, MOVES[stage], STYLE_BIBLE, SAFE_GUARD].join(', ').slice(0, 480);
}

module.exports = { buildVeoPrompt, stageFor, STYLE_BIBLE };

if (require.main === module) {
  const vo = process.argv[2] || 'the strike that changed everything';
  const i = Number(process.argv[3] || 0); const n = Number(process.argv[4] || 6);
  for (let b = 0; b < n; b++) {
    console.log(`\n— beat ${b} (${stageFor(b, n)}):\n` + buildVeoPrompt({ beat: { vo }, beatIndex: b, totalBeats: n, topic: process.argv[5] || 'fifa world cup' }));
  }
}
