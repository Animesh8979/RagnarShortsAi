/**
 * lib/virality-score.js — L108 P2
 *
 * Score a generated script 0-100 across 8 axes via one LLM call. Reject low
 * scores BEFORE we waste a render. Inspired by SamurAIGPT/AI-Youtube-Shorts-
 * Generator's virality scorer (2026-Q1 state of the art for Shorts gating).
 *
 * Axes (each 0-10, summed to 0-80, normalized to 0-100):
 *   hook         — opening line stops the scroll
 *   emotion      — visceral feeling (surprise / fear / outrage / awe)
 *   opinion      — clear point of view (not neutral wire copy)
 *   revelation   — viewer learns something they didn't know
 *   conflict     — tension / stakes / opposing forces
 *   quotable     — one line that could be screenshotted
 *   peak         — single highest moment lands in beat 2-4 (not end)
 *   value        — viewer leaves with something useful or memorable
 *
 * Provider cascade: Groq llama-3.3-70b → Gemini 1.5-flash → NVIDIA Nemotron.
 *
 * Persists every scorecard to renders/analytics/virality-scores-{date}.jsonl
 * so we can correlate with retention later.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');

function buildPrompt(script) {
  const opt = (script && script.optimized) || script || {};
  return `You are a viral-content judge for YouTube Shorts / Instagram Reels.
Score this script across 8 axes (each 0-10). Be honest — most generated scripts
score 4-6 on most axes; only truly viral scripts score 8+.

SCRIPT:
  Title: ${opt.title || '(no title)'}
  Full voiceover: "${(opt.fullVoiceover || '').replace(/"/g, "'")}"
  Power words: ${JSON.stringify(opt.powerWords || [])}

AXES:
  hook       — does the first 8 words make a scroller stop?
  emotion    — does it produce a visceral feeling (surprise / fear / outrage / awe)?
  opinion    — is there a clear POV, or is it neutral wire copy?
  revelation — does the viewer learn something they didn't know?
  conflict   — is there tension / stakes / opposing forces?
  quotable   — is there one line worth screenshotting?
  peak       — does the single highest moment land in beat 2-4 (not the end)?
  value      — does the viewer leave with something useful or memorable?

Return STRICT JSON. No markdown. Schema:
{
  "scores": {
    "hook": 0,
    "emotion": 0,
    "opinion": 0,
    "revelation": 0,
    "conflict": 0,
    "quotable": 0,
    "peak": 0,
    "value": 0
  },
  "weakest_axis": "name",
  "fix_advice": "≤30-word actionable rewrite hint (e.g. 'open with a stat instead of context — replace beat 1')",
  "verdict_short": "ship | rewrite"
}
`;
}

async function callGroq(prompt) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error('groq_http_' + r.status + ': ' + (await r.text()).slice(0, 200));
  return (await r.json()).choices[0].message.content;
}

async function callGemini(prompt) {
  // L114 — Gemini MODEL LADDER (no single-model 503 "Gemini down").
  const { geminiGenerate } = require('./gemini-call');
  const g = await geminiGenerate({ text: prompt, json: true, temperature: 0.2 });
  if (!g.ok) throw new Error('gemini_ladder_failed:' + g.reason);
  return g.text;
}

function extractJson(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch (_) { return null; }
}

/**
 * @param {object} script  full script JSON OR script.optimized object
 * @returns {Promise<{ok, score, scores, weakest_axis, fix_advice, verdict, provider}>}
 */
async function score(script) {
  const prompt = buildPrompt(script);
  let raw = null;
  let provider = null;
  const providers = [
    { name: 'groq-llama-3.3-70b', fn: () => callGroq(prompt) },
    { name: 'gemini-1.5-flash', fn: () => callGemini(prompt) },
  ];
  for (const p of providers) {
    try {
      raw = await p.fn();
      provider = p.name;
      break;
    } catch (e) {
      console.log('[virality] provider ' + p.name + ' failed: ' + (e && e.message || '').slice(0, 120));
    }
  }
  if (!raw) return { ok: false, reason: 'all_providers_failed' };

  const obj = extractJson(raw);
  if (!obj || !obj.scores) return { ok: false, reason: 'malformed_json', provider, raw: raw.slice(0, 200) };

  const s = obj.scores;
  const sum = ['hook', 'emotion', 'opinion', 'revelation', 'conflict', 'quotable', 'peak', 'value']
    .reduce((acc, k) => acc + Math.max(0, Math.min(10, Number(s[k]) || 0)), 0);
  const normalized = Math.round(sum / 80 * 100);

  // Persist scorecard.
  try {
    const dir = path.join(ROOT, 'renders', 'analytics');
    fs.mkdirSync(dir, { recursive: true });
    const ledgerPath = path.join(dir, 'virality-scores-' + new Date().toISOString().slice(0, 10) + '.jsonl');
    fs.appendFileSync(ledgerPath, JSON.stringify({
      ts: new Date().toISOString(),
      scriptId: script.scriptId || (script.optimized && script.optimized.title) || null,
      title: (script.optimized || script || {}).title || null,
      score: normalized,
      scores: s,
      weakest: obj.weakest_axis,
      provider,
    }) + '\n');
  } catch (_) {}

  return {
    ok: true,
    score: normalized,
    scores: s,
    weakest_axis: obj.weakest_axis,
    fix_advice: obj.fix_advice,
    verdict: obj.verdict_short || (normalized >= 70 ? 'ship' : 'rewrite'),
    provider,
  };
}

module.exports = { score };

if (require.main === module) {
  require('./env-d-drive-only');
  const argPath = process.argv[2];
  if (!argPath) {
    // Test with a baked example
    const fixture = {
      optimized: {
        title: "Vance Just Said The Quiet Part Out Loud About Iran",
        fullVoiceover: "Okay so — Vance just flew to Doha at 3am. He sat across from Iran's foreign minister for fourteen hours. He walked out and said the words America hasn't said about Tehran in forty years: 'we are very close.' But here's the wild part… one tweet from either guy and the whole framework combusts. Watch crude Monday. That's your answer.",
        powerWords: ['Vance', 'Doha', 'Iran', 'Tehran'],
      },
    };
    score(fixture).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
  } else {
    const j = JSON.parse(fs.readFileSync(argPath, 'utf8'));
    score(j).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
  }
}
