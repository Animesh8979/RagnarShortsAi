/**
 * lib/platform-fanout.js — Phase 5.1 omnipresence fanout
 *
 * Given a V8 script JSON (the same shape `scriptFromTopic()` produces),
 * generate per-platform native variants in ONE LLM call so retries on
 * individual platforms reuse the same generation:
 *
 *   {
 *     ytShort:   { title, description, tags },
 *     igReel:    { caption, hashtags },
 *     xThread:   [{ text }, { text }, ... up to 5 tweets, each <=270 chars],
 *     igCarousel:[{ slideText, visualPrompt }, ... 5 slides 1080×1080],
 *     tiktok:    { caption, hashtags }   // scaffold-ready for when business approval lands
 *   }
 *
 * Caching: the result is persisted next to the script as
 * `<scriptDir>/<scriptId>.fanout.json` so re-running the upload chain
 * doesn't re-pay the LLM cost.
 *
 * Usage:
 *   const { fanout } = require('./lib/platform-fanout');
 *   const variants = await fanout(scriptJson, { force: false });
 *   variants.xThread // [{ text }, ...]
 *
 * Routes through `route('script_llm')` so it honors the same provider
 * failover (nvidia-nemotron → groq → gemini-1.5 → github-models).
 */

'use strict';

require('./env-d-drive-only');

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');
const router = require('./provider-router');

const FANOUT_PROMPT_HEADER = `You are a multi-platform content adapter. Given a YouTube Shorts script, produce native variants for X (Twitter), Instagram (Reels caption + Carousel deck), and TikTok (caption ready for when business-account approval lands).

OUTPUT STRICT JSON. No markdown fences. Exact schema:
{
  "ytShort": {
    "title": "8-12 word YouTube Shorts title (no clickbait, no all-caps)",
    "description": "the source voiceover + sources line + 6 hashtags",
    "tags": ["10 single-word tags"]
  },
  "igReel": {
    "caption": "150-200 word IG Reels caption: opens with the hook, then 1-2 lines of context, ends with 8-10 hashtags",
    "hashtags": ["reels","relevant","topic","tags"]
  },
  "xThread": [
    { "text": "tweet 1: the hook from beat 0 (max 270 chars including emoji)" },
    { "text": "tweet 2: beat 1 condensed" },
    { "text": "tweet 3: beat 2 condensed" },
    { "text": "tweet 4: the 'so what' / consequence" },
    { "text": "tweet 5: closing question + link placeholder \\"{YT_SHORT_URL}\\"" }
  ],
  "igCarousel": [
    { "slideText": "max 80-char title-line for slide 1 (the hook)", "visualPrompt": "FLUX-suitable scene description, 14-22 words, no faces facing camera, no text in image" },
    { "slideText": "...", "visualPrompt": "..." },
    { "slideText": "...", "visualPrompt": "..." },
    { "slideText": "...", "visualPrompt": "..." },
    { "slideText": "the 'so what' takeaway, max 100 chars", "visualPrompt": "..." }
  ],
  "tiktok": {
    "caption": "150 char TikTok caption with 3-5 trending hashtags",
    "hashtags": ["tiktok","viral","tags"]
  }
}

HARD CONSTRAINTS:
- Every X tweet must fit in 270 chars (Twitter limit is 280; budget 10 chars for "1/5" prefix that the uploader will add).
- IG carousel: exactly 5 slides. slideText is what we render on the image as Anton-font overlay. visualPrompt is what FLUX renders as the background. Slides must tell a coherent narrative; don't just repeat beats.
- xThread tweets MUST be self-contained — a reader who only sees tweet 3 should still get the idea.
- ALL platform variants should reference the SAME core fact set from the source script; no contradictions.
- No clickbait. No "you won't believe". No all-caps.
`;

async function callLLM(prompt) {
  return router.withFailover('script_llm', async (provider) => {
    if (provider === 'nvidia-nemotron') {
      const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
        body: JSON.stringify({ model: 'nvidia/llama-3.3-nemotron-super-49b-v1', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 3000 }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) throw new Error(`nv_http_${r.status}: ${(await r.text()).slice(0, 160)}`);
      return (await r.json()).choices[0].message.content;
    }
    if (provider === 'groq-llama-3.3-70b') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7, response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) throw new Error(`groq_http_${r.status}: ${(await r.text()).slice(0, 160)}`);
      return (await r.json()).choices[0].message.content;
    }
    if (provider === 'gemini-1.5-flash') {
      const model = process.env.GEMINI_SCRIPT_PRIMARY_MODEL || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) throw new Error(`gemini_http_${r.status}: ${(await r.text()).slice(0, 160)}`);
      return (await r.json()).candidates[0].content.parts[0].text;
    }
    throw new Error('provider_not_wired_for_fanout:' + provider);
  });
}

function extractJson(s) {
  let t = String(s || '').trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { return null; }
}

/**
 * fanout(scriptJson, opts) → variants object.
 * @param {object} scriptJson  V8 script with optimized.{title,fullVoiceover,beats,powerWords,sourceUrls}
 * @param {object} [opts]
 * @param {boolean} [opts.force]   ignore cache + re-generate
 * @param {string}  [opts.cacheDir]  override cache location
 */
async function fanout(scriptJson, opts = {}) {
  const opt = scriptJson && scriptJson.optimized;
  if (!opt || !opt.title || !opt.fullVoiceover) throw new Error('fanout: script.optimized.{title,fullVoiceover} required');

  const cacheDir = opts.cacheDir || path.dirname(scriptJson._sourcePath || path.join(ROOT, '.runtime-cache', 'fanout'));
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
  const cacheFile = path.join(cacheDir, `${scriptJson.scriptId || 'unnamed'}.fanout.json`);
  if (!opts.force && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached && cached.ytShort && cached.xThread) return cached;
    } catch (_) {}
  }

  const inputBlock = `
SOURCE SCRIPT:
- title:         ${opt.title}
- voiceover:     ${opt.fullVoiceover}
- powerWords:    ${(opt.powerWords || []).join(', ')}
- sourceUrls:    ${(opt.sourceUrls || []).join(' • ')}
- beats:
${(opt.beats || []).map((b, i) => `    ${i + 1}. ${b.vo} [visual: ${b.visualPrompt}]`).join('\n')}
`;

  const prompt = FANOUT_PROMPT_HEADER + '\n' + inputBlock + '\nGenerate the per-platform variants now.';
  const r = await callLLM(prompt);
  if (!r.ok) throw new Error('fanout_llm_exhausted: ' + (r.reason || 'unknown'));

  const parsed = extractJson(r.value);
  if (!parsed || !parsed.ytShort || !Array.isArray(parsed.xThread) || !Array.isArray(parsed.igCarousel)) {
    throw new Error('fanout_llm_malformed_json: provider=' + r.provider);
  }

  // Cap thread tweet length defensively (LLM sometimes overshoots).
  parsed.xThread = parsed.xThread.slice(0, 5).map((t, i) => ({
    text: String(t.text || '').slice(0, 270),
    index: i + 1,
  }));
  parsed.igCarousel = parsed.igCarousel.slice(0, 5).map((s, i) => ({
    slideText: String(s.slideText || '').slice(0, 120),
    visualPrompt: String(s.visualPrompt || '').slice(0, 200),
    index: i + 1,
  }));
  parsed._meta = { generatedAt: new Date().toISOString(), provider: r.provider };

  fs.writeFileSync(cacheFile, JSON.stringify(parsed, null, 2));
  return parsed;
}

module.exports = { fanout };

if (require.main === module) {
  const args = process.argv.slice(2);
  const scriptIdx = args.indexOf('--script');
  if (scriptIdx < 0 || !args[scriptIdx + 1]) {
    console.error('Usage: node lib/platform-fanout.js --script <path/to/script.v8-trimmed.json> [--force]');
    process.exit(2);
  }
  const scriptPath = args[scriptIdx + 1];
  const scriptJson = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  scriptJson._sourcePath = scriptPath;
  const force = args.includes('--force');
  fanout(scriptJson, { force }).then((v) => {
    console.log(JSON.stringify(v, null, 2));
  }).catch((e) => { console.error('FATAL:', e); process.exit(1); });
}
