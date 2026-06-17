/**
 * lib/scenario-writer.js — L113 GODMODE Pillar 2 (geopolitical SIMULATION flagship).
 *
 * Turns a real trending conflict into a gripping 5-beat "what if" escalation
 * scenario with per-beat map states — the engine for the animated SimulationScene
 * (a category-of-one format only our $0 Remotion+map+LLM stack can mass-produce).
 *
 * $0: LLM via Groq → Gemini-2.5 (same cascade as the rest of the pipeline).
 * Standalone + gated by design — NOT wired into the live render path yet; the
 * SimulationScene Remotion component + director routing get render-tested before
 * going live. CLI: node lib/scenario-writer.js "Iran Israel tensions"
 */
'use strict';

const fetch = require('node-fetch');
const { placesInText } = require('./geo-coords');

async function llm(prompt) {
  async function groq() {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.6, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) throw new Error('groq_' + r.status);
    return (await r.json()).choices[0].message.content;
  }
  async function gemini() {
    // L114 — Gemini MODEL LADDER (no single-model 503 "Gemini down").
    const g = await require('./gemini-call').geminiGenerate({ text: prompt, json: true, temperature: 0.6 });
    if (!g.ok) throw new Error('gemini_ladder_failed:' + g.reason);
    return g.text;
  }
  for (const fn of [groq, gemini]) { try { return await fn(); } catch (_) {} }
  return null;
}

/**
 * @param {object} opts { topic }
 * @returns {Promise<{ok, scenario?, reason?}>}
 *   scenario = { title, actors[], beats:[{vo, places[], escalation, risk, geo:[{name,lon,lat}]}], payoffQuestion }
 */
async function writeScenario(opts = {}) {
  const topic = String(opts.topic || '').trim();
  if (!topic) return { ok: false, reason: 'no_topic' };
  const prompt = `You are Ragnar's war-room analyst. Turn this REAL geopolitics topic into a gripping 5-beat "WHAT IF" SIMULATION short — a clearly-labelled hypothetical escalation (sourced-plausible, never reckless or partisan).
TOPIC: ${topic}

Return STRICT JSON only:
{
 "title": "short punchy title with 'What if'",
 "actors": ["COUNTRY A","COUNTRY B"],
 "beats": [
   {"vo":"one punchy spoken sentence","places":["Iran","Israel"],"escalation":"what changes on the map this beat","risk":0-100}
 ],
 "payoffQuestion":"a sharp two-sided debate question for the comments"
}
Rules: exactly 5 beats; beat 1 = hook; "risk" rises across beats (e.g. 30→95); beat 5 = the payoff + the stakes; use REAL country names in "places".`;

  const raw = await llm(prompt);
  if (!raw) return { ok: false, reason: 'no_provider_available' };
  let plan;
  try { plan = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')); }
  catch (_) { return { ok: false, reason: 'bad_json' }; }
  if (!plan || !Array.isArray(plan.beats) || plan.beats.length < 3) return { ok: false, reason: 'too_few_beats' };
  // Enrich each beat with real map coordinates for the SimulationScene.
  for (const b of plan.beats) {
    b.geo = placesInText(((b.places || []).join(' ')) + ' ' + (b.vo || ''));
    b.risk = Math.max(0, Math.min(100, Number(b.risk) || 50));
  }
  return { ok: true, scenario: plan };
}

module.exports = { writeScenario };

if (require.main === module) {
  require('./env-d-drive-only');
  writeScenario({ topic: process.argv.slice(2).join(' ') || 'Iran Israel tensions escalate' })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
