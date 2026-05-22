/**
 * lib/script-from-trending.js — write a V8-format script from a trending topic
 *
 * For each topic returned by `lib/trending-news.js`, produce a ~80-word
 * voiceover script + 5-6 beats with FLUX-suitable visual_prompt fields.
 *
 * Routes the LLM call through `provider-router.withFailover('script_llm', ...)`.
 * With HALT_ON_PROVIDER_EXHAUSTION=1 (Phase A default), the function REJECTS
 * if every provider fails — no static fallback placeholder.
 *
 * Output shape (matches `.planning/growth-strategy/daily/2026-05-21/script-A1-pakistan-picked-iran.v8-trimmed.json`):
 *   {
 *     scriptId: 'C1-iran-hormuz-control',
 *     channel: 'organic',
 *     topic: 'Iran Hormuz authority claims waters south of UAE',
 *     optimized: {
 *       title: '...',
 *       fullVoiceover: '~80 words',
 *       beats: [ { tStart, tEnd, vo, visualPrompt }, ... ],
 *       powerWords: [...],
 *       sourceUrls: [...]
 *     }
 *   }
 */

'use strict';

require('dotenv').config();
const fetch = require('node-fetch');
const router = require('./provider-router');

const STYLE_NOTES = `
You are writing a 28-32 second YouTube Shorts / Instagram Reels voiceover for a geopolitics news channel.

HARD CONSTRAINTS:
- 78-82 words total in the voiceover
- Newscast pace at +25% TTS rate → 150-155 wpm
- 5 or 6 beats; each beat is a complete sentence
- Hook in the first beat (≤8 words, jaw-dropper)
- Punchline / "so what" in the final beat (≤12 words, question or one-line takeaway)
- Each beat has a visualPrompt: a 14-22 word editorial-photography description (no faces, no text overlays in the image)
- visualPrompt should be FLUX-friendly: scene, lighting, atmosphere, composition
- powerWords: 6-10 single words from the script that should be highlighted (proper nouns, key numbers)

Return STRICT JSON. No markdown fences. Schema:
{
  "title": "8-12 word YouTube Shorts title, no clickbait, no all-caps",
  "fullVoiceover": "78-82 word paragraph",
  "beats": [
    { "tStart": 0,    "tEnd": 2.6, "vo": "...", "visualPrompt": "..." },
    { "tStart": 2.6,  "tEnd": 8.3, "vo": "...", "visualPrompt": "..." },
    ...
  ],
  "powerWords": ["word1","word2",...],
  "sourceUrls": ["..."]
}
`;

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('missing_GEMINI_API_KEY');
  const model = process.env.GEMINI_SCRIPT_PRIMARY_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`gemini_http_${r.status}: ${await r.text().catch(() => '')}`.slice(0, 240));
  const json = await r.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('gemini_empty_response');
  return text;
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('missing_GROQ_API_KEY');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`groq_http_${r.status}: ${await r.text().catch(() => '')}`.slice(0, 240));
  const json = await r.json();
  const text = json.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('groq_empty_response');
  return text;
}

async function callNvidiaNemotron(prompt) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('missing_NVIDIA_API_KEY');
  const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`nvidia_http_${r.status}: ${await r.text().catch(() => '')}`.slice(0, 240));
  const json = await r.json();
  const text = json.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('nvidia_empty_response');
  return text;
}

async function callGithubModels(prompt) {
  const key = process.env.GITHUB_MODELS_TOKEN;
  if (!key) throw new Error('missing_GITHUB_MODELS_TOKEN');
  const r = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`gh_http_${r.status}: ${await r.text().catch(() => '')}`.slice(0, 240));
  const json = await r.json();
  const text = json.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('gh_empty_response');
  return text;
}

function extractJson(s) {
  if (!s) return null;
  let text = String(s).trim();
  text = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch (_) { return null; }
}

/**
 * Generate one V8 script for a single trending topic. Throws if every
 * router-provider fails (Phase A halt-on-exhaustion).
 *
 * @param {object} topic { title, summary, link, sources, score, publishedAt }
 * @param {object} [opts] { channel: 'organic'|'clipping', extraSourceUrls: [...] }
 * @returns {object} full script JSON object
 */
async function scriptFromTopic(topic, opts = {}) {
  const channel = opts.channel || 'organic';
  const prompt = `${STYLE_NOTES}

TOPIC TITLE: ${topic.title}
TOPIC SUMMARY: ${(topic.summary || '').slice(0, 800)}
SOURCE URL: ${topic.link}
ADDITIONAL CONTEXT: source feeds = ${(topic.sources || []).join(', ')}; published ${topic.publishedAt}.
`;
  const r = await router.withFailover('script_llm', async (provider) => {
    if (provider === 'nvidia-nemotron') return callNvidiaNemotron(prompt);
    if (provider === 'groq-llama-3.3-70b') return callGroq(prompt);
    if (provider === 'gemini-1.5-flash') return callGemini(prompt);
    if (provider === 'github-models-gpt4o') return callGithubModels(prompt);
    throw new Error('provider_not_wired:' + provider);
  });
  if (!r.ok) {
    throw new Error(`script_llm_exhausted: ${r.reason || 'no_provider_available'} attempts=${JSON.stringify(r.attempts || [])}`);
  }

  const parsed = extractJson(r.value);
  if (!parsed || !parsed.fullVoiceover || !Array.isArray(parsed.beats)) {
    throw new Error('script_llm_malformed_json: provider=' + r.provider);
  }

  const slug = String(parsed.title || topic.title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const scriptId = `C-${new Date().toISOString().slice(0, 10)}-${slug}`;

  return {
    scriptId,
    channel,
    topic: topic.title,
    sourceProvider: r.provider,
    optimized: {
      title: parsed.title,
      fullVoiceover: parsed.fullVoiceover,
      beats: parsed.beats.map((b) => ({
        tStart: Number(b.tStart || 0),
        tEnd: Number(b.tEnd || 0),
        vo: String(b.vo || '').trim(),
        visualPrompt: String(b.visualPrompt || '').trim(),
      })),
      powerWords: parsed.powerWords || [],
      sourceUrls: [topic.link, ...(parsed.sourceUrls || [])].filter(Boolean),
    },
  };
}

module.exports = { scriptFromTopic };

if (require.main === module) {
  (async () => {
    const { fetchTrending } = require('./trending-news');
    const trending = await fetchTrending({ topN: 1 });
    if (!trending.length) { console.error('no trending topics'); process.exit(1); }
    console.log('Generating script for:', trending[0].title);
    const script = await scriptFromTopic(trending[0]);
    console.log(JSON.stringify(script, null, 2));
  })().catch((e) => { console.error('FATAL:', e && e.message || e); process.exit(1); });
}
