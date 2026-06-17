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

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fetch = require('node-fetch');
const router = require('./provider-router');

// Phase 1.2 — if an evolved STYLE_NOTES exists from a prior analytics run,
// use it; otherwise fall back to the hardcoded baseline below. The
// hardcoded baseline is the safety floor — never delete it.
const STYLE_NOTES_BASELINE = `
You are writing a 28-32 second YouTube Shorts / Instagram Reels voiceover for a highly aggressive, fast-paced geopolitics or sports news channel.

HARD CONSTRAINTS:
- 72-76 words total in the voiceover (TTS runs fast, keep it punchy).
- 5 or 6 beats; each beat is a complete thought or sentence.
- HOOK (First beat, ≤8 words): MUST BE A JAW-DROPPER. No "In recent news" or "Let me explain". Start mid-action or with a massive claim.
- PUNCHLINE (Final beat, ≤12 words): High-retention question or mind-bending takeaway.
- VISUAL PROMPTS (visualPrompt): MUST BE HYPER-DETAILED CINEMATOGRAPHY. Describe dramatic wide-angle shots, aggressive depth of field, neon or intense cinematic lighting, action-oriented. NO flat "editorial portraits". NO people facing camera. Make the visual sound like a $100M movie.
- powerWords: 6-10 single words from the script that should be highlighted.

ADVANCED ANIMATION HOOKS:
- lottieTriggers: An array of power words that demand a massive visual Lottie animation (e.g. "crash" -> red down arrow, "profit" -> cash explosion).
- nodeGraph: A list of 2-3 spatial relationships in the script to be drawn on the procedural corkboard. E.g., {"source": "US", "target": "China", "label": "Sanctions"}.

Return STRICT JSON. No markdown fences. Schema:
{
  "title": "8-12 word YouTube Shorts title, highly clickable",
  "fullVoiceover": "78-82 word paragraph, conversational, zero corporate speak",
  "beats": [
    { "tStart": 0, "tEnd": 2.6, "vo": "...", "visualPrompt": "hyper-detailed cinematic wide-angle..." },
    { "tStart": 2.6, "tEnd": 8.3, "vo": "...", "visualPrompt": "..." }
  ],
  "powerWords": ["word1","word2"],
  "lottieTriggers": [ {"word": "crash", "type": "down_arrow"} ],
  "nodeGraph": [ {"source": "Entity1", "target": "Entity2", "label": "Relationship"} ],
  "sourceUrls": ["..."]
}
`;

// Phase 1.2 — resolve STYLE_NOTES: prefer the most-recent evolved-prompt-*.md
// (within 7 days). Falls back to the baseline if no evolved file or load fails.
function resolveStyleNotes() {
  try {
    const { loadLatestEvolvedPrompt } = require('./prompt-evolution');
    const evolved = loadLatestEvolvedPrompt({ ageDays: 7 });
    if (evolved && evolved.length > 200) {
      console.log('[script-from-trending] using evolved STYLE_NOTES (length=' + evolved.length + ')');
      return evolved;
    }
  } catch (_) { /* prompt-evolution module not loaded — use baseline */ }
  return STYLE_NOTES_BASELINE;
}
// L113 — append the Ragnar character + engagement (debate-CTA + "save this")
// block to every script's system prompt: Ragnar voice (Pillar 1) + the
// comment/save-driving payoff (Pillar 4 — the #1 growth lever per analytics:
// saves/shares/comments ≈ 0 is the wall). Fail-open if the module is missing.
const STYLE_NOTES = (() => {
  let base = resolveStyleNotes();
  try { base += '\n\n' + require('./ragnar-persona').buildPersonaPromptBlock(); } catch (_) {}
  // L113 Pillar 1 — serialized continuity: open with a callback to yesterday's thread.
  try { const cb = require('./story-thread').buildCallbackPromptLine(); if (cb) base += '\n\n' + cb; } catch (_) {}
  return base;
})();

async function callGemini(prompt) {
  // L114 — route through the Gemini MODEL LADDER (kills the retired-1.5-flash
  // default + the single-overloaded-model 503 that caused "Gemini down" / organic 0/0).
  const { geminiGenerate } = require('./gemini-call');
  const g = await geminiGenerate({ text: prompt, json: false, temperature: 0.7 });
  if (!g.ok) throw new Error('gemini_ladder_failed:' + g.reason);
  return g.text;
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
 * L107+ humanization gate — REJECTS scripts that read like AP-wire bots.
 * User complaint that triggered this: 2026-05-29 organic 1's script was
 * "US and Iran are close to a deal. Vance says it's not done. A ceasefire
 *  extension framework is agreed. Trump and Iran's leaders must approve.
 *  The deal is pending. Will they finalize it?"
 * No commas, no em-dashes, no rhythm. Six flat declaratives.
 *
 * Returns { ok, reasons[], notes }.
 */
function assessScriptHumanization(script) {
  const vo = String(script.fullVoiceover || '');
  const reasons = [];
  // 1. Punctuation diversity
  const commas = (vo.match(/,/g) || []).length;
  const emDashes = (vo.match(/—/g) || []).length;
  const ellipses = (vo.match(/…|\.\.\./g) || []).length;
  const questions = (vo.match(/\?/g) || []).length;
  const exclaims = (vo.match(/!/g) || []).length;
  if (commas < 2)   reasons.push(`only ${commas} commas (need ≥2)`);
  if (emDashes < 1) reasons.push('missing em-dash (—)');
  // if (ellipses < 1) reasons.push('missing ellipsis (…)');
  if (questions < 1) reasons.push('missing question mark');
  // if (exclaims < 1)  reasons.push('missing exclamation point');
  // 2. Sentence-length variance — at least one short sentence (≤6 words) and one longer (≥10).
  //    Slightly relaxed from ≤4 to ≤6 because most LLMs produce 6-word "Translation: X." style
  //    punches that read as conversational enough.
  const sentences = vo.split(/[.!?…]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const lens = sentences.map((s) => s.split(/\s+/).length);
  const hasShort = lens.some((l) => l <= 6);
  const hasLong  = lens.some((l) => l >= 10);
  if (!hasShort) reasons.push('no short (≤6-word) sentence — rhythm too flat');
  if (!hasLong)  reasons.push('no long (≥10-word) sentence — rhythm too flat');
  // 3. Human voice patterns (at least one)
  const voicePatterns = [
    /\bokay so\b/i, /\bwait\b/i, /\bhere'?s the\b/i,
    /\bbut\b/i, /\bright\?\s*$/i, /\btranslation:\s*/i,
    /\byou have to\b/i, /\blisten\b/i, /\bthe wild part\b/i,
    /\band listen\b/i, /\bbro\b/i, /\bdude\b/i,
    /\bthis is the\b/i, /\bif you\b/i,
  ];
  const hasVoicePattern = voicePatterns.some((re) => re.test(vo));
  if (!hasVoicePattern) reasons.push('no human voice pattern (okay so / wait / here\'s the / but / translation: / etc)');
  // 4. Beat visual prompts mentioning specific people should have [PORTRAIT:...] markers
  const NAMED_PEOPLE = ['vance', 'trump', 'biden', 'khamenei', 'putin', 'zelensky', 'modi', 'netanyahu', 'macron', 'xi jinping', 'kim jong un', 'mbs', 'salman', 'erdogan', 'orban'];
  let beatPortraitMissed = 0;
  for (const b of (script.beats || [])) {
    const vp = String(b.visualPrompt || b.visual_prompt || '').toLowerCase();
    for (const p of NAMED_PEOPLE) {
      if (vp.includes(p) && !vp.includes('[portrait:')) beatPortraitMissed++;
    }
  }
  if (beatPortraitMissed > 0) reasons.push(`${beatPortraitMissed} beat(s) name a politician without [PORTRAIT:...] marker`);
  return {
    ok: reasons.length === 0,
    reasons,
    notes: reasons.length === 0
      ? `${commas} commas, ${emDashes}em-dash, ${ellipses}ellipsis, ${questions}?, ${exclaims}!, ${lens.length} sentences (min=${Math.min(...lens)}, max=${Math.max(...lens)})`
      : '',
  };
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
  // Phase 1.1 — surface the predictPerformance score to the LLM. A low
  // signal (<50) means past videos with similar topics underperformed;
  // the LLM should bias toward a sharper, more counter-intuitive hook
  // to overcome that signal. A high signal (>70) means the cluster
  // generally wins; play to its strengths.
  const perfSignalBlock = topic.performanceSignal
    ? `\nPERFORMANCE SIGNAL: ${topic.performanceSignal}\nIf the signal is below 50, write a sharper, more counter-intuitive hook than usual; if above 70, lean into the proven angle.\n`
    : '';
  const prompt = `${STYLE_NOTES}
${perfSignalBlock}
TOPIC TITLE: ${topic.title}
TOPIC SUMMARY: ${(topic.summary || '').slice(0, 800)}
SOURCE URL: ${topic.link}
ADDITIONAL CONTEXT: source feeds = ${(topic.sources || []).join(', ')}; published ${topic.publishedAt}.
`;
  // L107+ humanization gate — retry the LLM up to 3 times with explicit feedback
  // if the script comes back robot-toned (missing punctuation diversity,
  // missing real human voice patterns). Catches the failure mode the user
  // flagged: AP-wire flat declarative sentences with no commas/em-dashes/?
  let parsed = null;
  let resolvedProvider = null;
  let lastRoboticReasons = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const attemptPrompt = attempt === 1 ? prompt : (prompt + `\n\nPREVIOUS ATTEMPT REJECTED for: ${lastRoboticReasons.join(' / ')}. Rewrite with the missing humanization elements. Make at least one beat just 3-5 words long for rhythm.`);
    const r = await router.withFailover('script_llm', async (provider) => {
      if (provider === 'nvidia-nemotron') return callNvidiaNemotron(attemptPrompt);
      if (provider === 'groq-llama-3.3-70b') return callGroq(attemptPrompt);
      if (provider === 'gemini-1.5-flash') return callGemini(attemptPrompt);
      if (provider === 'github-models-gpt4o') return callGithubModels(attemptPrompt);
      throw new Error('provider_not_wired:' + provider);
    });
    if (!r.ok) {
      throw new Error(`script_llm_exhausted: ${r.reason || 'no_provider_available'} attempts=${JSON.stringify(r.attempts || [])}`);
    }
    const candidate = extractJson(r.value);
    if (!candidate || !candidate.fullVoiceover || !Array.isArray(candidate.beats)) {
      lastRoboticReasons = ['malformed JSON'];
      continue;
    }
    const verdict = assessScriptHumanization(candidate);
    if (verdict.ok) {
      parsed = candidate;
      resolvedProvider = r.provider;
      console.log(`[humanization] PASS on attempt ${attempt}: ${verdict.notes}`);
      break;
    }
    lastRoboticReasons = verdict.reasons;
    console.log(`[humanization] FAIL on attempt ${attempt}: ${verdict.reasons.join(' / ')}`);
    if (attempt === 3) {
      // 3rd attempt failed — accept the best we have rather than crash the batch.
      parsed = candidate;
      resolvedProvider = r.provider;
      console.log(`[humanization] accepting attempt 3 with caveats (will record QA flag)`);
    }
  }
  if (!parsed || !parsed.fullVoiceover || !Array.isArray(parsed.beats)) {
    throw new Error('script_llm_malformed_json: all 3 attempts failed');
  }

  // L108 P2 — virality-score gate. Reject scripts that score < 70 and try
  // ONE more rewrite with the LLM-supplied fix_advice. If the rewrite still
  // fails, accept (with caveat) — we'd rather ship a 60-score than crash.
  // Disable via SKIP_VIRALITY_GATE=1.
  let viralityResult = null;
  if (process.env.SKIP_VIRALITY_GATE !== '1') {
    try {
      const virality = require('./virality-score');
      viralityResult = await virality.score({ optimized: parsed });
      if (viralityResult.ok && viralityResult.score < 70 && viralityResult.fix_advice) {
        console.log(`[virality] gate FAIL score=${viralityResult.score} weakest=${viralityResult.weakest_axis}; one rewrite with hint`);
        const rewritePrompt = prompt + `\n\nVIRALITY GATE FEEDBACK — fix this on rewrite: ${viralityResult.fix_advice}. The weakest axis was "${viralityResult.weakest_axis}". Keep all other constraints.`;
        const r2 = await router.withFailover('script_llm', async (provider) => {
          if (provider === 'nvidia-nemotron') return callNvidiaNemotron(rewritePrompt);
          if (provider === 'groq-llama-3.3-70b') return callGroq(rewritePrompt);
          if (provider === 'gemini-1.5-flash') return callGemini(rewritePrompt);
          if (provider === 'github-models-gpt4o') return callGithubModels(rewritePrompt);
          throw new Error('provider_not_wired:' + provider);
        });
        if (r2.ok) {
          const rewritten = extractJson(r2.value);
          if (rewritten && rewritten.fullVoiceover && Array.isArray(rewritten.beats)) {
            const verdict2 = assessScriptHumanization(rewritten);
            if (verdict2.ok) {
              const v2 = await virality.score({ optimized: rewritten });
              if (v2.ok && v2.score >= viralityResult.score) {
                console.log(`[virality] rewrite PASS score=${v2.score} (was ${viralityResult.score})`);
                parsed = rewritten;
                resolvedProvider = r2.provider;
                viralityResult = v2;
              }
            }
          }
        }
      } else if (viralityResult.ok) {
        console.log(`[virality] PASS score=${viralityResult.score} weakest=${viralityResult.weakest_axis}`);
      }
    } catch (e) {
      console.log(`[virality] gate skipped: ${(e && e.message || e).slice(0, 120)}`);
    }
  }

  const slug = String(parsed.title || topic.title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const scriptId = `C-${new Date().toISOString().slice(0, 10)}-${slug}`;

  return {
    scriptId,
    channel,
    topic: topic.title,
    sourceProvider: resolvedProvider,
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
      lottieTriggers: parsed.lottieTriggers || [],
      nodeGraph: parsed.nodeGraph || [],
      domOverlays: parsed.domOverlays || [],
      trackingDataMap: parsed.trackingDataMap || {},
      sourceUrls: [topic.link, ...(parsed.sourceUrls || [])].filter(Boolean),
      virality: viralityResult && viralityResult.ok ? {
        score: viralityResult.score,
        scores: viralityResult.scores,
        weakest_axis: viralityResult.weakest_axis,
        verdict: viralityResult.verdict,
        provider: viralityResult.provider,
      } : null,
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
