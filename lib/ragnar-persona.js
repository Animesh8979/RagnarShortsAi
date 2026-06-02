/**
 * lib/ragnar-persona.js — L113 GODMODE Pillar 1 (Ragnar character) + Pillar 4
 * (engagement flywheel: debate-CTA + save prompt).
 *
 * Single source of truth for the channel's owned character "Ragnar" and the
 * engagement design the analytics demand (saves/shares/comments ≈ 0 is the wall).
 * Pure data + helpers, $0, no deps — consumed by:
 *   - lib/script-from-trending.js  → buildPersonaPromptBlock() into the system prompt
 *   - src/scenes/V9StoryMotionComposition.jsx → catchphrase + on-screen CTA (later)
 *   - lib/auto-upload-fresh.js / youtube-engagement.js → pinned debate question (later)
 */
'use strict';

const PERSONA = {
  name: 'RAGNAR',
  tagline: 'Neutral-but-sharp geopolitics, from the war room.',
  // Voice rules fed to the script LLM so every script sounds like one character.
  voice: [
    'You ARE Ragnar — a sharp, fast-talking geopolitics anchor broadcasting from a war room.',
    'Confident and opinionated but always sourced and defensible — never reckless or partisan-for-its-own-sake.',
    'Punchy short sentences. One clear ANGLE the mainstream is underplaying, not a neutral recap.',
    'Conversational, a little cocky, human — contractions, the occasional aside. Never robotic.',
  ],
  openers: [
    "From the war room — here's what actually just happened.",
    "Ragnar here. Forget the headline, watch the map.",
    "This is bigger than they're telling you. Here's why.",
  ],
  closers: [
    'From the war room — Ragnar out.',
    "That's the board. Your move.",
    "Ragnar out. Watch this space tomorrow.",
  ],
};

// Two-sided debate questions — the comment-driving payoff. Keyed by topic class
// (matches lib/director-plan.js classifyTopic) with a general fallback.
const DEBATE_CTAS = {
  energy_war: [
    'Should the West keep funding this war — or force the table? Comment YES or NO.',
    'Is energy the real weapon here? Tell me I\'m wrong in the comments.',
  ],
  maritime_strike: [
    'Justified strike or a line crossed? Drop your verdict below.',
    'Who really controls these waters in 5 years? Comment your call.',
  ],
  ai_race: [
    'Who wins the AI race — and should we be scared? Comment your pick.',
  ],
  general_news: [
    'Smart move or huge mistake? Comment your take — I read every one.',
    'Which side are you on? Tell me below and I\'ll pin the best argument.',
  ],
};

const SAVE_PROMPTS = [
  'SAVE this so you can explain it at dinner.',
  'Save this map — you\'ll want it when this blows up.',
  'Bookmark this — part 2 drops tomorrow.',
];

// Recurring segments (give the show structure + binge identity).
const SEGMENTS = ['ON THE BOARD TODAY', "RAGNAR'S CALL", 'THE PART NOBODY SAYS', 'WATCH THIS SPACE'];

function pick(arr, seed) {
  if (!arr || !arr.length) return '';
  const i = (typeof seed === 'number' ? seed : Math.floor(Math.random() * 1e9)) % arr.length;
  return arr[i];
}

function pickDebateCTA(topicClass, seed) {
  const pool = DEBATE_CTAS[topicClass] || DEBATE_CTAS.general_news;
  return pick(pool, seed);
}
function pickCatchphraseOpen(seed) { return pick(PERSONA.openers, seed); }
function pickCatchphraseClose(seed) { return pick(PERSONA.closers, seed); }
function pickSavePrompt(seed) { return pick(SAVE_PROMPTS, seed); }

/**
 * The block injected into the script system prompt so every script is
 * Ragnar-voiced AND ends with an engagement payoff (debate question + save).
 * Serves Pillar 1 (character) + Pillar 4 (engagement) in one.
 */
function buildPersonaPromptBlock(topicClass) {
  const cta = (DEBATE_CTAS[topicClass] || DEBATE_CTAS.general_news);
  return [
    '## CHARACTER & ENGAGEMENT (mandatory)',
    PERSONA.voice.map((v) => '- ' + v).join('\n'),
    `- OPEN with a Ragnar-style hook (e.g. "${PERSONA.openers[0]}").`,
    `- The FINAL beat MUST be an engagement payoff: a sharp two-sided DEBATE question that makes viewers argue in the comments (e.g. "${cta[0]}"), plus a quick "save this" line (e.g. "${SAVE_PROMPTS[0]}").`,
    `- CLOSE in character (e.g. "${PERSONA.closers[0]}").`,
    '- Goal: provoke a comment and a save — NOT a neutral recap. Saves + comments are what the algorithm rewards.',
  ].join('\n');
}

module.exports = {
  PERSONA, DEBATE_CTAS, SAVE_PROMPTS, SEGMENTS,
  pickDebateCTA, pickCatchphraseOpen, pickCatchphraseClose, pickSavePrompt,
  buildPersonaPromptBlock,
};

if (require.main === module) {
  const tc = process.argv[2] || 'energy_war';
  console.log('=== Ragnar persona (' + tc + ') ===');
  console.log('open  :', pickCatchphraseOpen(0));
  console.log('debate:', pickDebateCTA(tc, 0));
  console.log('save  :', pickSavePrompt(0));
  console.log('close :', pickCatchphraseClose(0));
  console.log('\n--- prompt block ---\n' + buildPersonaPromptBlock(tc));
}
