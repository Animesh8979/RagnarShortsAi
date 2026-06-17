/**
 * lib/hook-lab.js — L114 lever A: the Hook Lab (the #1 retention lever).
 *
 * The first ~1.5 seconds decides ~80% of a Short's retention, which decides
 * distribution. This generates N distinct "stop-the-scroll" hook variants per
 * video — each a {firstLine (the spoken/0.5s on-screen opener), frameText
 * (muted-readable big text), style} — so the bandit (lib/variant-bandit.js) can
 * A/B them on first-hour retention and keep the winner.
 *
 * $0: LLM via Groq → Gemini-2.5 (same cascade as the pipeline). Standalone +
 * verifiable now; wiring into daily-auto-v8 (pick a hook → burn frameText on the
 * first frame, open the script with firstLine) + the bandit reward feed is next.
 */
'use strict';

const fetch = require('node-fetch');

const HOOK_STYLES = ['bold_claim', 'curiosity_gap', 'pattern_interrupt', 'shocking_stat', 'question'];

async function llm(prompt) {
  async function groq() {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.85, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!r.ok) throw new Error('groq_' + r.status);
    return (await r.json()).choices[0].message.content;
  }
  async function gemini() {
    // L114 — Gemini MODEL LADDER (no single-model 503 "Gemini down").
    const g = await require('./gemini-call').geminiGenerate({ text: prompt, json: true, temperature: 0.85 });
    if (!g.ok) throw new Error('gemini_ladder_failed:' + g.reason);
    return g.text;
  }
  for (const fn of [groq, gemini]) { try { return await fn(); } catch (_) {} }
  return null;
}

/**
 * @param {object} opts { topic, n=4 }
 * @returns {Promise<{ok, hooks?:[{style,firstLine,frameText,score}], reason?}>}
 */
async function generateHooks(opts = {}) {
  const topic = String(opts.topic || '').trim();
  if (!topic) return { ok: false, reason: 'no_topic' };
  const n = Math.max(2, Math.min(6, Number(opts.n) || 4));
  const prompt = `You are a YouTube Shorts hook specialist. 85% watch on MUTE and decide in 1.5 seconds. For this topic write ${n} DISTINCT scroll-stopping hooks, one per style: ${HOOK_STYLES.slice(0, n).join(', ')}.
TOPIC: ${topic}

Each hook =
 - "firstLine": the first SPOKEN sentence (≤14 words, punchy, creates an open loop — NOT a neutral recap).
 - "frameText": 3–6 words to burn BIG on the muted first frame (instantly legible, makes you stop).
 - estimate "score" 0-100 = stop-scroll potential.
Return STRICT JSON: { "hooks": [ {"style":"bold_claim","firstLine":"...","frameText":"...","score":0-100} ] }`;

  const raw = await llm(prompt);
  if (!raw) return { ok: false, reason: 'no_provider_available' };
  let out;
  try { out = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')); }
  catch (_) { return { ok: false, reason: 'bad_json' }; }
  let hooks = Array.isArray(out.hooks) ? out.hooks : [];
  hooks = hooks.filter((h) => h && h.firstLine && h.frameText).map((h) => ({
    style: h.style || 'bold_claim',
    firstLine: String(h.firstLine).trim(),
    frameText: String(h.frameText).trim().toUpperCase().slice(0, 48),
    score: Math.max(0, Math.min(100, Number(h.score) || 50)),
  }));
  if (!hooks.length) return { ok: false, reason: 'no_hooks' };
  hooks.sort((a, b) => b.score - a.score);
  return { ok: true, hooks };
}

module.exports = { generateHooks, HOOK_STYLES };

if (require.main === module) {
  require('./env-d-drive-only');
  generateHooks({ topic: process.argv.slice(2).join(' ') || 'Russia strikes Ukraine energy grid', n: 4 })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
