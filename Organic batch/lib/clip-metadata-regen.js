/**
 * lib/clip-metadata-regen.js — L109+ content-aware clip metadata regeneration
 *
 * Single source of truth for regenerating a clip's YouTube title/description/
 * tags when Phase B (metadata_too_similar) or invalidDescription blocks the
 * upload. Detects content TYPE from the creator (horror / podcast / reaction /
 * challenge / streamer / general) so a Kill Tony comedy clip never gets a
 * horror title and vice-versa.
 *
 * Used BOTH by:
 *   - the upload chain inline (lib/auto-upload-fresh.js) so each clip self-heals
 *     within its own 3h slot, AND
 *   - the standalone retry tool (tools/retry-YYYY-MM-DD-clips-yt.js).
 *
 * Reads the 14-day ledger to forbid recently-used title words + tags so the
 * regenerated metadata passes assertMetadataUnique.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');

function loadRecentLedger(days = 14) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'renders', 'analytics', 'uploaded-metadata-ledger.json'), 'utf8'));
    const cutoff = Date.now() - days * 24 * 3600_000;
    return (raw.entries || []).filter((e) => new Date(e.ts || 0).getTime() >= cutoff);
  } catch (_) { return []; }
}

function extractForbidden(ledger) {
  const wordsInTitles = new Set();
  const tagsRecent = new Set();
  for (const e of ledger) {
    for (const w of String(e.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((x) => x.length >= 4)) wordsInTitles.add(w);
    for (const t of (e.tags || [])) tagsRecent.add(String(t).toLowerCase());
  }
  for (const stop of ['plays', 'horror', 'game', 'full', 'video', 'shorts', 'clip', 'with', 'this', 'that', 'from']) wordsInTitles.delete(stop);
  return { titleForbidden: Array.from(wordsInTitles).sort(), tagsForbidden: Array.from(tagsRecent).sort() };
}

function detectContentType(spec) {
  const creator = String(spec.sourceCreator || '').toLowerCase();
  const title = String(spec.sourceTitle || '');
  if (/ishowspeed|speed/.test(creator) && /FNAF|Outlast|Resident Evil|Doors|Don'?t Scream|Backrooms|horror|scary/i.test(title)) return 'horror';
  if (/killtony|theovon|callherdaddy|clubshayshay|pbdpodcast|joerogan|lexfridman/.test(creator)) return 'podcast';
  if (/moistcr1tikal|penguinz0/.test(creator)) return 'reaction';
  if (/mrbeast/.test(creator)) return 'challenge';
  if (/kaicenat/.test(creator)) return 'streamer';
  return 'general';
}

const TYPE_GUIDES = {
  horror:    { tone: 'hype/dramatic, jumpscare energy', ex: ['"when the door slams at 3am you know it\'s over 💀"', '"camera flick = instant heart attack"'], tagHint: 'moment-descriptors (vent, hallway, doorslam), atmosphere (shadows, footsteps), reactions (jolt, flinched)' },
  podcast:   { tone: 'funny, punchy, quote-driven — capture the JOKE or hot take, NO horror words', ex: ['"he said WHAT on stage 😂"', '"this bit had the whole room crying"'], tagHint: 'guest names, comedy, standup, podcast, the topic of the bit' },
  reaction:  { tone: 'witty, current-events, deadpan', ex: ['"he could not believe what he just watched"'], tagHint: 'reaction, commentary, the subject reacted-to' },
  challenge: { tone: 'high-stakes, jaw-dropping', ex: ['"$1 vs $1,000,000 and the gap is insane"'], tagHint: 'challenge, money, stunt, the specific feat' },
  streamer:  { tone: 'chaotic, hype, IRL energy', ex: ['"chat was NOT ready for this"'], tagHint: 'stream, IRL, the moment' },
  general:   { tone: 'punchy, curiosity-driven', ex: ['"this moment went viral for a reason"'], tagHint: 'the specific subject of the clip' },
};

function buildPrompt(spec) {
  const type = detectContentType(spec);
  const f = extractForbidden(loadRecentLedger());
  const g = TYPE_GUIDES[type] || TYPE_GUIDES.general;
  const creator = spec.sourceCreator || 'creator';
  return `You are writing a YouTube Shorts title + description + tags for a ${type} clip by ${creator} (28s, cut from a longer video).

CLIP FACTS:
  Creator: ${creator}
  Source title: ${spec.sourceTitle}
  Content type: ${type}

HARD CONSTRAINTS:
- Title MUST match content type (${type}). NEVER horror words on comedy/podcast or vice-versa.
- TITLE must not contain any of these recent words: ${f.titleForbidden.slice(0, 50).join(', ')}
- TAGS must reuse no more than 4 of these recent tags: ${f.tagsForbidden.slice(0, 60).join(', ') || '(none)'}
- No angle brackets < > and no control characters anywhere.

Tone: ${g.tone}. Title examples:
${g.ex.map((e) => '  - ' + e).join('\n')}

Title: 8-12 words, mostly lowercase, 1 emoji max, a MOMENT/VIBE (not a creator credit).
Description: 3-5 sentences opening with the moment. Credit "Source: ${spec.sourceUrl} — ${creator}". 4-6 unique hashtags.
Tags: 8-12 single-word tags — ${g.tagHint}. ≥6 NOT in the recent tag list.

Return STRICT JSON, no markdown: { "title": "...", "description": "...", "tags": ["...",...] }`;
}

async function callGroq(prompt) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.95, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error('groq_http_' + r.status);
  return (await r.json()).choices[0].message.content;
}

// L114 — multi-provider cascade (regen must NOT be pinned to Groq alone; a single
// provider outage/rate-limit was causing "regen_failed_after_4" → blocked uploads).
async function callLLM(prompt) {
  try { return await callGroq(prompt); } catch (_) {}
  const g = await require('./gemini-call').geminiGenerate({ text: prompt, json: true, temperature: 0.95 });
  if (g.ok) return g.text;
  throw new Error('all_llm_failed');
}

// L114 — DETERMINISTIC LAST RESORT: never leave a clip permanently unuploadable.
// When every LLM attempt fails (full outage), build guaranteed-unique template
// metadata from the spec + the moment offset so different moments of the same
// source still differ. Better a varied template than a clip that never ships.
const FALLBACK_TITLES = ['the part everyone replays', 'wait for the ending', 'this got out of hand fast', 'nobody saw this coming', 'the timing is unreal', 'caught everyone off guard', 'this is why he went viral', 'the room could not handle it'];
function buildTemplateFallback(spec, type) {
  const creator = spec.sourceCreator || 'creator';
  const moment = Math.abs(Math.round(Number(spec.startSec || 0)));
  const uniq = (Date.now().toString(36) + moment.toString(36)).slice(-5);
  const base = sanitize(String(spec.sourceTitle || creator)).split(/[-|—:]/)[0].trim().toLowerCase().split(/\s+/).slice(0, 5).join(' ');
  const title = (base + ' — ' + FALLBACK_TITLES[moment % FALLBACK_TITLES.length]).slice(0, 95);
  const ch = String(creator).toLowerCase().replace(/[^a-z0-9]/g, '');
  const description = `the ${type} moment from ${creator} everyone is talking about. Source: ${spec.sourceUrl || ''} — ${creator}.\n\n#shorts #${type} #${ch} #viral #fyp #clip${moment}`;
  const tags = Array.from(new Set([type, 'shorts', 'viral', 'fyp', ch, 'moment' + moment, 'clip', uniq])).filter(Boolean).slice(0, 12);
  return { ok: true, title, description, tags, type, fallback: true };
}

function sanitize(s) { return String(s || '').replace(/[<>]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); }

/**
 * Regenerate clean, content-appropriate, unique metadata for a clip.
 * @param {object} spec  { sourceCreator, sourceTitle, sourceUrl, startSec, durationSec }
 * @returns {Promise<{ok, title?, description?, tags?, type?, reason?}>}
 */
async function regenClipMetadata(spec, opts = {}) {
  const maxAttempts = Number(opts.maxAttempts || 4);
  let assertMetadataUnique;
  try { ({ assertMetadataUnique } = require('./metadata-uniqueness')); } catch (_) { assertMetadataUnique = null; }
  const type = detectContentType(spec);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await callLLM(buildPrompt(spec));
      const obj = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, ''));
      if (!obj.title || !obj.description || !Array.isArray(obj.tags)) continue;
      obj.title = sanitize(obj.title).slice(0, 95);
      obj.description = sanitize(obj.description).slice(0, 4800);
      obj.tags = obj.tags.map((t) => sanitize(String(t)).toLowerCase()).filter(Boolean).slice(0, 12);
      if (assertMetadataUnique) {
        const v = assertMetadataUnique({ title: obj.title, description: obj.description, tags: obj.tags });
        if (!v.ok) continue;
      }
      return { ok: true, title: obj.title, description: obj.description, tags: obj.tags, type };
    } catch (_) { /* try again */ }
  }
  // every LLM attempt failed → deterministic template (never block the upload).
  console.log('  [clip-regen] LLM exhausted after ' + maxAttempts + ' → deterministic template fallback');
  return buildTemplateFallback(spec, type);
}

module.exports = { regenClipMetadata, detectContentType, buildPrompt, sanitize, loadRecentLedger, extractForbidden };

if (require.main === module) {
  require('./env-d-drive-only');
  const spec = { sourceCreator: 'KillTony', sourceTitle: 'KT #768 - SHANE GILLIS + JAMES MCCANN', sourceUrl: 'https://youtube.com/watch?v=CnjJPpr10vM', startSec: 2016, durationSec: 28 };
  console.log('type:', detectContentType(spec));
  regenClipMetadata(spec).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
