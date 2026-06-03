/**
 * lib/gemini-call.js — the fix for "Gemini always down".
 *
 * Root cause (diagnosed 2026-06): the API key is healthy (models.list = 200), but
 * every call was pinned to the single busiest free-tier model (gemini-2.5-flash),
 * which frequently returns 503 "experiencing high demand". With no fallback, one
 * congested model = the whole pipeline thinks Gemini is down.
 *
 * Fix: a MODEL LADDER. On 503/429/500/UNAVAILABLE, cascade to the next (lighter,
 * less-congested) model — 2.5-flash → 2.0-flash → flash-latest → *-lite. The lite
 * / 2.0 models almost always answer, so "Gemini down" effectively disappears.
 *
 * One shared helper so EVERY caller (script-from-trending, virality-score,
 * clip-moment-selector, scenario-writer, hook-lab, render-qa, …) gets the ladder.
 * $0, free tier. Supports text + vision (pass `parts` with inline_data).
 */
'use strict';

const fetch = require('node-fetch');

const DEFAULT_LADDER = (process.env.GEMINI_MODEL_LADDER
  || 'gemini-2.5-flash,gemini-2.0-flash,gemini-flash-latest,gemini-2.5-flash-lite,gemini-2.0-flash-lite')
  .split(',').map((s) => s.trim()).filter(Boolean);

/**
 * @param {object} opts
 *   text | parts   the prompt (parts supports vision: [{text},{inline_data:{mime_type,data}}])
 *   json           default true → responseMimeType application/json
 *   temperature    default 0.4
 *   models         override the ladder
 * @returns {Promise<{ok, text?, model?, reason?}>}
 */
async function geminiGenerate(opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };
  const parts = Array.isArray(opts.parts) ? opts.parts : [{ text: String(opts.text || '') }];
  const models = Array.isArray(opts.models) && opts.models.length ? opts.models : DEFAULT_LADDER;
  const generationConfig = { temperature: opts.temperature != null ? opts.temperature : 0.4 };
  if (opts.json !== false) generationConfig.responseMimeType = 'application/json';
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig });

  let lastReason = 'unknown';
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(45_000),
        });
        if (r.status === 503 || r.status === 429 || r.status === 500) { // transient/overload → retry then next model
          lastReason = 'busy_' + r.status + '@' + model;
          await new Promise((s) => setTimeout(s, 700 * (attempt + 1)));
          continue;
        }
        if (!r.ok) { lastReason = 'http_' + r.status + '@' + model; break; } // hard error on this model → next model
        const j = await r.json();
        const text = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
        if (text) return { ok: true, text, model };
        lastReason = 'empty@' + model; break;
      } catch (e) { lastReason = (e && e.message || e).toString().slice(0, 50) + '@' + model; await new Promise((s) => setTimeout(s, 700)); }
    }
  }
  return { ok: false, reason: 'all_models_failed:' + lastReason };
}

module.exports = { geminiGenerate, DEFAULT_LADDER };

if (require.main === module) {
  require('./env-d-drive-only');
  geminiGenerate({ text: 'Return JSON {"ok":true,"msg":"ladder works"}', json: true })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
