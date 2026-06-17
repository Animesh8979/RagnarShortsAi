/**
 * lib/prompt-evolution.js — Phase 1.2 self-optimizing hook prompt
 *
 * Read the last 14 days of YouTube metrics, pick the top-10 and bottom-10
 * videos by best-available signal (AVD% > views > nothing), and ask the
 * LLM (via provider-router `script_llm`) to REWRITE the STYLE_NOTES /
 * hook-generation instructions for the next batch.
 *
 * Output: `renders/analytics/evolved-prompt-{date}.md` — a Markdown file
 * whose first section is the new STYLE_NOTES block. `lib/script-from-
 * trending.js` loads the newest evolved-prompt-*.md at startup and uses
 * its STYLE_NOTES in place of the hardcoded constant.
 *
 * Refresh cadence: GH Actions self-hosted runner runs this once per day
 * before the daily batch (`.github/workflows/daily-batch.yml`). Manual
 * run: `node lib/prompt-evolution.js --refresh`.
 *
 * Falls open (returns null + does not overwrite) when:
 *   - No metric files in the last 14 days
 *   - All providers fail on the script_llm route
 *   - Returned JSON is malformed
 * The orchestrator must always fall back to the hardcoded STYLE_NOTES
 * constant on failure — the hardcoded version is the safety baseline.
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'renders', 'analytics');
const router = require('./provider-router');
const fetch = require('node-fetch');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function nowIso() { return new Date().toISOString(); }
function todayDate() { return new Date().toISOString().slice(0, 10); }

function loadRecentMetrics({ days = 14 } = {}) {
  if (!fs.existsSync(ANALYTICS_DIR)) return [];
  const cutoff = Date.now() - days * 86_400_000;
  const files = fs.readdirSync(ANALYTICS_DIR)
    .filter((f) => /^youtube-metrics-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => ({ f, t: Date.parse(f.match(/(\d{4}-\d{2}-\d{2})/)[1]) }))
    .filter(({ t }) => t >= cutoff)
    .sort((a, b) => b.t - a.t);
  const seen = new Map();   // videoId -> latest record
  for (const { f } of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ANALYTICS_DIR, f), 'utf8'));
      const recs = Array.isArray(j.records) ? j.records : [];
      for (const r of recs) {
        if (!r || !r.videoId) continue;
        const prior = seen.get(r.videoId);
        const ts = Date.parse(r.refreshedAt || r.recordedAt || 0);
        if (!prior || ts > prior._ts) seen.set(r.videoId, { ...r, _ts: ts });
      }
    } catch (_) {}
  }
  return [...seen.values()];
}

function rankByBestSignal(records) {
  // Prefer averageViewPercentage > averageViewDuration > viewCount.
  const annotated = records.map((r) => {
    let signal = null;
    let signalKind = null;
    if (typeof r.averageViewPercentage === 'number' && r.averageViewPercentage > 0) {
      signal = r.averageViewPercentage; signalKind = 'AVD%';
    } else if (typeof r.averageViewDuration === 'number' && r.averageViewDuration > 0) {
      signal = r.averageViewDuration; signalKind = 'AVD_sec';
    } else if (typeof r.viewCount === 'number') {
      signal = r.viewCount; signalKind = 'views';
    }
    return { ...r, _signal: signal, _signalKind: signalKind };
  }).filter((r) => r._signal !== null);
  // Group within same signalKind so we don't mix scales.
  const byKind = annotated.reduce((acc, r) => { (acc[r._signalKind] || (acc[r._signalKind] = [])).push(r); return acc; }, {});
  // Use the kind with the most members (= the dominant available signal).
  const best = Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)[0];
  if (!best) return { signalKind: 'none', sorted: [] };
  const [signalKind, list] = best;
  list.sort((a, b) => b._signal - a._signal);
  return { signalKind, sorted: list };
}

function pickEdges(sorted, n = 10) {
  if (sorted.length < n * 2) {
    // Not enough data; halve the bucket sizes.
    const half = Math.max(1, Math.floor(sorted.length / 2));
    return { top: sorted.slice(0, half), bottom: sorted.slice(-half).reverse() };
  }
  return { top: sorted.slice(0, n), bottom: sorted.slice(-n).reverse() };
}

const META_PROMPT_HEADER = `You are a YouTube Shorts prompt engineer. Your job is to REWRITE the STYLE_NOTES instruction block used by the hook-generation LLM for a geopolitics-news Shorts channel.

Below are the channel's recent best-performing and worst-performing video titles. Identify the pattern that separates the two groups (specificity, tone, named entities, numerical hooks, threat framing, etc), then write a NEW STYLE_NOTES block that biases tomorrow's generated scripts toward the winning pattern.

OUTPUT REQUIREMENTS — you MUST preserve these verbatim in the block you produce:

1. Open with the exact line: "You are writing a 28-32 second YouTube Shorts / Instagram Reels voiceover for a geopolitics news channel."
2. Include a HARD CONSTRAINTS bullet list that includes ALL of:
   - 72-76 words total in the voiceover
   - Newscast pace at +15% TTS rate → 138-142 wpm
   - 5 or 6 beats; each beat is a complete sentence
   - Hook in the first beat (≤8 words, jaw-dropper)
   - Punchline / "so what" in the final beat (≤12 words, question or one-line takeaway)
   - Each beat has a visualPrompt: 14-22 word editorial-photography description (no faces facing camera, no text overlays in the image)
   - powerWords: 6-10 single words from the script (proper nouns, key numbers)
3. End with EXACTLY this JSON schema block (copy verbatim):

Return STRICT JSON. No markdown fences. Schema:
{
  "title": "8-12 word YouTube Shorts title, no clickbait, no all-caps",
  "fullVoiceover": "72-76 word paragraph",
  "beats": [
    { "tStart": 0,    "tEnd": 2.6, "vo": "...", "visualPrompt": "..." }
  ],
  "powerWords": ["word1","word2"],
  "sourceUrls": ["..."]
}

4. Insert advisory rules BETWEEN the HARD CONSTRAINTS list and the JSON schema. These are where you encode what the winning hooks did differently.

5. No commentary, no markdown fence markers, no explanation — just the block itself.

Length: 350-500 words. Anything shorter than 300 will be rejected.
`;

function buildMetaPrompt(top, bottom, signalKind) {
  const fmt = (r) => `  - [${signalKind}=${r._signal.toFixed(2)}] ${String(r.title || '').slice(0, 120)}`;
  return [
    META_PROMPT_HEADER,
    `Signal kind ranking these: ${signalKind}.`,
    `\nTOP ${top.length} (best):`,
    ...top.map(fmt),
    `\nBOTTOM ${bottom.length} (worst):`,
    ...bottom.map(fmt),
    `\nWrite the new STYLE_NOTES block now.`,
  ].join('\n');
}

// ─── LLM caller wrappers — reuse the same shape as script-from-trending ─
async function callGroq(prompt) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.5 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`groq_http_${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).choices[0].message.content;
}
async function callGemini(prompt) {
  // L114 — Gemini MODEL LADDER (no single-model 503 "Gemini down"). Returns markdown (json:false).
  const g = await require('./gemini-call').geminiGenerate({ text: prompt, json: false, temperature: 0.5 });
  if (!g.ok) throw new Error('gemini_ladder_failed:' + g.reason);
  return g.text;
}
async function callNvidiaNemotron(prompt) {
  const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({ model: 'nvidia/llama-3.3-nemotron-super-49b-v1', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 2048 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`nvidia_http_${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).choices[0].message.content;
}

async function refresh() {
  const records = loadRecentMetrics({ days: 14 });
  console.log(`[prompt-evolution] loaded ${records.length} recent records`);
  if (records.length < 5) {
    console.log('[prompt-evolution] too few records for meaningful learning — skip');
    return { ok: false, reason: 'not_enough_data', recordCount: records.length };
  }
  const { signalKind, sorted } = rankByBestSignal(records);
  if (signalKind === 'none' || !sorted.length) {
    console.log('[prompt-evolution] no usable signal column in records');
    return { ok: false, reason: 'no_signal', signalKind };
  }
  const { top, bottom } = pickEdges(sorted, 10);
  console.log(`[prompt-evolution] signal=${signalKind}, top=${top.length}, bottom=${bottom.length}`);

  const metaPrompt = buildMetaPrompt(top, bottom, signalKind);

  const result = await router.withFailover('script_llm', async (provider) => {
    if (provider === 'groq-llama-3.3-70b') return callGroq(metaPrompt);
    if (provider === 'nvidia-nemotron') return callNvidiaNemotron(metaPrompt);
    if (provider === 'gemini-1.5-flash') return callGemini(metaPrompt);
    throw new Error('provider_not_wired:' + provider);
  });
  if (!result.ok) {
    console.log(`[prompt-evolution] LLM exhausted: ${result.reason}`);
    return { ok: false, reason: result.reason };
  }

  const evolved = String(result.value || '').trim();
  if (evolved.length < 300) {
    console.log(`[prompt-evolution] LLM returned too-short STYLE_NOTES (${evolved.length} chars, need ≥300); rejecting`);
    return { ok: false, reason: 'llm_response_too_short', length: evolved.length };
  }

  // Critical schema-shape check — the downstream JSON parser in
  // script-from-trending.js depends on `fullVoiceover`, `beats`, `visualPrompt`,
  // `powerWords`. If any field is missing from the evolved STYLE_NOTES, the
  // LLM will produce a different shape and break extractJson(). Reject.
  const requiredFields = ['fullVoiceover', 'beats', 'visualPrompt', 'powerWords', 'tStart', 'tEnd'];
  const missing = requiredFields.filter((f) => !evolved.includes(f));
  if (missing.length > 0) {
    console.log(`[prompt-evolution] evolved prompt missing required schema fields: ${missing.join(', ')}; rejecting`);
    return { ok: false, reason: 'llm_response_schema_broken', missing };
  }

  ensureDir(ANALYTICS_DIR);
  const outFile = path.join(ANALYTICS_DIR, `evolved-prompt-${todayDate()}.md`);
  const header = `<!-- Generated ${nowIso()} via ${result.provider}. Signal=${signalKind}. Top=${top.length}, Bottom=${bottom.length}. -->\n\n`;
  fs.writeFileSync(outFile, header + evolved + '\n');
  console.log(`[prompt-evolution] wrote ${outFile} (${evolved.length} chars)`);
  return { ok: true, path: outFile, signalKind, provider: result.provider, length: evolved.length };
}

/**
 * Find the newest evolved-prompt-*.md (within ageDays). Returns the
 * BODY (header stripped). Used by lib/script-from-trending.js as its
 * STYLE_NOTES override. Returns null if none found within the window.
 */
function loadLatestEvolvedPrompt({ ageDays = 7 } = {}) {
  if (!fs.existsSync(ANALYTICS_DIR)) return null;
  const cutoff = Date.now() - ageDays * 86_400_000;
  const candidates = fs.readdirSync(ANALYTICS_DIR)
    .filter((f) => /^evolved-prompt-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => ({ f, t: Date.parse(f.match(/(\d{4}-\d{2}-\d{2})/)[1]) }))
    .filter(({ t }) => t >= cutoff)
    .sort((a, b) => b.t - a.t);
  if (!candidates.length) return null;
  try {
    const raw = fs.readFileSync(path.join(ANALYTICS_DIR, candidates[0].f), 'utf8');
    // Strip the HTML comment header if present.
    return raw.replace(/^<!--[\s\S]*?-->\s*\n?/, '').trim();
  } catch (_) { return null; }
}

module.exports = { refresh, loadLatestEvolvedPrompt, loadRecentMetrics, rankByBestSignal };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--load')) {
    const s = loadLatestEvolvedPrompt();
    console.log(s ? s.slice(0, 800) + '\n...(truncated)' : '(no evolved prompt found within 7 days)');
  } else {
    refresh().then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    }).catch((e) => { console.error('FATAL:', e); process.exit(2); });
  }
}
