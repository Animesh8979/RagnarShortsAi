'use strict';
const fetch = require('node-fetch');

const DEFAULT_LADDER = (process.env.GEMINI_MODEL_LADDER || 'gemini-3.5-flash,gemini-2.5-flash,gemini-2.0-flash,gemini-2.5-flash-lite,gemini-2.0-flash-lite').split(',').map((s) => s.trim()).filter(Boolean);

async function nvidiaGenerate(opts) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  console.log('[Fallback] Using Nvidia API (meta/llama-3.1-70b-instruct)');
  let promptText = Array.isArray(opts.parts) ? opts.parts[0].text : (opts.text || '');
  
  if (opts.json !== false) {
    promptText += '\n\nCRITICAL INSTRUCTION: Return strictly raw JSON. Do not wrap in markdown ```json or add any conversational text.';
  }
  
  const body = {
    model: "nvidia/nemotron-3-super-120b-a12b",
    messages: [{"role":"user","content":promptText}],
    temperature: opts.temperature != null ? opts.temperature : 1,
    top_p: 0.95,
    max_tokens: 16384,
    chat_template_kwargs: { enable_thinking: true },
    reasoning_budget: 16384
  };

  try {
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000)
    });
    if (!r.ok) {
        console.warn(`[Nvidia Fallback Failed] HTTP ${r.status}`);
        return null;
    }
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (text) return { ok: true, text, model: 'nvidia-llama3.1-405b' };
  } catch (e) {
    console.warn('[Nvidia Fallback Error]', e.message);
    return null;
  }
  return null;
}

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
        if (r.status === 503 || r.status === 429 || r.status === 500) { 
          lastReason = 'busy_' + r.status + '@' + model;
          // Substantial backoff (4 seconds * attempt) to let rate limits cool down
          await new Promise((s) => setTimeout(s, 4000 * (attempt + 1)));
          continue;
        }
        if (!r.ok) { lastReason = 'http_' + r.status + '@' + model; break; } 
        const j = await r.json();
        const text = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
        if (text) return { ok: true, text, model };
        lastReason = 'empty@' + model; break;
      } catch (e) { 
        lastReason = (e && e.message || e).toString().slice(0, 50) + '@' + model; 
        await new Promise((s) => setTimeout(s, 2000)); 
      }
    }
  }

  // Fallback to Nvidia API
  if (lastReason.includes('busy') || lastReason.includes('timeout')) {
    const nvResult = await nvidiaGenerate(opts);
    if (nvResult) return nvResult;
  }

  return { ok: false, reason: 'all_models_failed:' + lastReason };
}

module.exports = { geminiGenerate, DEFAULT_LADDER };
