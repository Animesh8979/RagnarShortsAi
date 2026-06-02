/**
 * lib/variant-bandit.js — L113 GODMODE Pillar 3 (self-improving learning loop).
 *
 * A multi-armed bandit over creative "arms" (hook style, title style, thumbnail
 * style, format). Per video we PICK an arm per dimension (epsilon-greedy with a
 * cold-start prior); after the first-hour metrics land we RECORD the reward
 * (retention + saves), and the factory biases toward winners automatically — the
 * one edge no manual creator matches.
 *
 * Pure JSON state at renders/analytics/bandit-state.json. $0, no deps. The reward
 * feed (refresh-youtube-analytics first-hour AVP + saves) wires in next; the
 * algorithm + state are complete and unit-testable now.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE = path.join(ROOT, 'renders', 'analytics', 'bandit-state.json');

// The arms per dimension. Extend freely — winners surface on their own.
const ARMS = {
  hookStyle: ['bold_claim', 'curiosity_gap', 'pattern_interrupt', 'question'],
  titleStyle: ['number', 'colon_topic', 'vs_conflict', 'what_if'],
  thumbnailStyle: ['face_closeup', 'map_arrows', 'big_number', 'two_flags'],
  format: ['news_explainer', 'simulation', 'data_board'],
};
const EPSILON = Number(process.env.BANDIT_EPSILON || 0.2); // explore rate

function load() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) { return { dims: {}, picks: {} }; }
}
function save(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}
function ensureArm(s, dim, arm) {
  s.dims[dim] = s.dims[dim] || {};
  s.dims[dim][arm] = s.dims[dim][arm] || { n: 0, reward: 0, mean: 0 };
  return s.dims[dim][arm];
}

/** Epsilon-greedy pick per dimension. Returns { hookStyle, titleStyle, ... }. */
function pickArms(seed) {
  const s = load();
  const chosen = {};
  for (const dim of Object.keys(ARMS)) {
    const arms = ARMS[dim];
    for (const a of arms) ensureArm(s, dim, a);
    if (Math.random() < EPSILON) {
      chosen[dim] = arms[Math.floor(Math.random() * arms.length)]; // explore
    } else {
      // exploit: highest mean reward (cold-start ties broken randomly)
      let best = arms[0]; let bestMean = -Infinity;
      for (const a of arms) { const m = s.dims[dim][a].mean; if (m > bestMean || (m === bestMean && Math.random() < 0.5)) { bestMean = m; best = a; } }
      chosen[dim] = best;
    }
  }
  // remember the pick keyed by seed (videoId/scriptId) for later attribution
  if (seed) { s.picks[seed] = chosen; save(s); } else { save(s); }
  return chosen;
}

/**
 * Record the outcome for a previously-picked seed.
 * @param {string} seed videoId/scriptId used at pickArms time
 * @param {number} reward 0..1 (e.g. normalized first-hour retention*0.6 + saves-rate*0.4)
 */
function recordOutcome(seed, reward) {
  const s = load();
  const chosen = s.picks && s.picks[seed];
  if (!chosen) return { ok: false, reason: 'unknown_seed' };
  const r = Math.max(0, Math.min(1, Number(reward) || 0));
  for (const dim of Object.keys(chosen)) {
    const a = ensureArm(s, dim, chosen[dim]);
    a.n += 1; a.reward += r; a.mean = a.reward / a.n;
  }
  delete s.picks[seed];
  save(s);
  return { ok: true, reward: r };
}

/** Current winners per dimension (for prompt-evolution to bias generation). */
function winners() {
  const s = load();
  const out = {};
  for (const dim of Object.keys(ARMS)) {
    const arms = s.dims[dim] || {};
    let best = null; let bestMean = -Infinity; let total = 0;
    for (const a of Object.keys(arms)) { total += arms[a].n; if (arms[a].n > 0 && arms[a].mean > bestMean) { bestMean = arms[a].mean; best = a; } }
    out[dim] = { arm: best, mean: best ? Number(bestMean.toFixed(3)) : null, samples: total };
  }
  return out;
}

module.exports = { ARMS, pickArms, recordOutcome, winners };

if (require.main === module) {
  require('./env-d-drive-only');
  const cmd = process.argv[2];
  if (cmd === 'pick') console.log(JSON.stringify(pickArms(process.argv[3]), null, 2));
  else if (cmd === 'reward') console.log(JSON.stringify(recordOutcome(process.argv[3], Number(process.argv[4])), null, 2));
  else console.log(JSON.stringify(winners(), null, 2));
}
