/**
 * lib/reaction-caption.js — L110 T1.3
 *
 * The "editorial soul" layer. 2026 research: reaction/commentary captions are
 * (a) the most effective retention format for clip channels AND (b) the
 * "transformative added value" that keeps clip uploads safe under YouTube's
 * reused-content policy. Since the user chose full-auto (no human hot-take),
 * this LLM-authored reaction line is our synthetic substitute for human opinion.
 *
 * Generates 1-2 punchy reaction lines for a clip and renders them as a DISTINCT
 * ASS caption style (top third, bold yellow box) that rides ABOVE the karaoke
 * transcript at chosen beats — clearly an added commentary layer, not the
 * source audio.
 *
 * $0 (Groq/Gemini), D:\ only. Disable via SKIP_REACTION_CAPTION=1.
 */

'use strict';

const fetch = require('node-fetch');

let detectContentType;
try { ({ detectContentType } = require('./clip-metadata-regen')); }
catch (_) { detectContentType = () => 'general'; }

const REACTION_STYLE_BY_TYPE = {
  horror:    'a hyped horror-reaction take (e.g. "nobody was ready for this part", "watch his hands at the jump")',
  podcast:   'a witty setup/payoff tease for a comedy or hot-take moment (e.g. "wait for the turn", "this is the line that broke the room")',
  reaction:  'a deadpan current-events take (e.g. "he is NOT wrong though", "the internet lost it over this")',
  challenge: 'a stakes-raising line (e.g. "the twist nobody saw coming", "watch what he does at the end")',
  streamer:  'a chaotic hype line (e.g. "chat was not ready", "this is why the clip went viral")',
  general:   'a curiosity-gap tease (e.g. "the part everyone replays", "you will want sound on for this")',
};

function buildPrompt(spec, type) {
  return `You write ONE short reaction-commentary caption (a hot take / curiosity tease) that overlays on top of a 28-second ${type} clip by ${spec.sourceCreator || 'a creator'}.

Source: ${spec.sourceTitle || ''}
Style for this type: ${REACTION_STYLE_BY_TYPE[type] || REACTION_STYLE_BY_TYPE.general}

Rules:
- 3-7 words, ALL-CAPS-ish punchy, ≤40 chars. No hashtags, no emoji, no angle brackets.
- It must add an OPINION/ANGLE that is NOT just describing the audio (this is the transformative layer).
- It teases without spoiling.

Return STRICT JSON: { "reaction": "..." }`;
}

async function callLLM(prompt) {
  // Groq first, Gemini fallback.
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.9, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (r.ok) return (await r.json()).choices[0].message.content;
  } catch (_) {}
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } }), signal: AbortSignal.timeout(30_000) });
    if (r.ok) { const j = await r.json(); return j.candidates[0].content.parts[0].text; }
  } catch (_) {}
  return null;
}

function sanitize(s) { return String(s || '').replace(/[<>]/g, '').replace(/["#]/g, '').replace(/[\x00-\x1F]/g, '').trim().slice(0, 42); }

/**
 * Generate a reaction line for a clip spec.
 * @returns {Promise<{ok, reaction?, type?, reason?}>}
 */
async function generateReaction(spec) {
  if (process.env.SKIP_REACTION_CAPTION === '1') return { ok: false, reason: 'disabled' };
  const type = detectContentType(spec);
  const raw = await callLLM(buildPrompt(spec, type));
  if (!raw) return { ok: false, reason: 'llm_failed', type };
  try {
    const obj = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, ''));
    const reaction = sanitize(obj.reaction);
    if (!reaction || reaction.length < 3) return { ok: false, reason: 'empty', type };
    return { ok: true, reaction, type };
  } catch (_) { return { ok: false, reason: 'parse_failed', type }; }
}

/**
 * Build an ASS Dialogue line for the reaction, shown over a time window in the
 * top third (y≈360) in a bold yellow-box style distinct from the karaoke.
 * fmtAssTime is borrowed from caption-builder via the caller, or inline here.
 */
function buildReactionAssLine(reaction, startSec, endSec) {
  const fmt = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), cs = Math.round((s - Math.floor(s)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const txt = String(reaction || '').replace(/\{/g, '(').replace(/\}/g, ')');
  // Top third, big, yellow fill, black box scrim, slight pop.
  return `Dialogue: 2,${fmt(startSec)},${fmt(endSec)},Default,,0,0,0,,{\\pos(540,360)\\c&H0000F0FF&\\fs72\\bord6\\3c&H00000000&\\blur0.8\\fscx104\\fscy104}${txt.toUpperCase()}`;
}

module.exports = { generateReaction, buildReactionAssLine };

if (require.main === module) {
  require('./env-d-drive-only');
  const spec = { sourceCreator: 'KillTony', sourceTitle: 'KT #768 - SHANE GILLIS + JAMES MCCANN' };
  generateReaction(spec).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    if (r.ok) console.log('ASS:', buildReactionAssLine(r.reaction, 0.5, 3.5));
    process.exit(r.ok ? 0 : 1);
  });
}
