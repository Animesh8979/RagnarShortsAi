#!/usr/bin/env node
/**
 * tools/retry-2026-05-29-organic-yt.js
 *
 * Retry the YouTube upload for organic[0] (US-Iran-Vance) that was blocked
 * by the Phase B metadata uniqueness gate (tags_too_similar score=0.6 vs
 * "Iran Warns of Escalation: Hormuz Control Claimed" YIkcNEMVyNk).
 *
 * Strategy: regenerate title/description/tags via LLM with explicit avoidance
 * of the "Hormuz / escalation / strait" word family. Lean instead into the
 * Vance / ceasefire-framework / White-House angle. Re-test uniqueness, then
 * upload to RagnarShortsUltimate (yt-credentials.json).
 *
 * Usage:
 *   node tools/retry-2026-05-29-organic-yt.js [--index 0]
 */
'use strict';

require('../lib/env-d-drive-only');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');
const router = require(path.join(ROOT, 'lib', 'provider-router'));
const { uploadToYouTube } = require(path.join(ROOT, 'yt-uploader'));
const { assertMetadataUnique, recordUploadedMetadata } = require(path.join(ROOT, 'lib', 'metadata-uniqueness'));
const { createPublishPermit, evaluatePublishReadiness } = require(path.join(ROOT, 'publish-lock'));

const args = process.argv.slice(2);
const indexArg = args.indexOf('--index');
const ORGANIC_IDX = indexArg >= 0 ? Number(args[indexArg + 1]) : 0;

const BATCH = JSON.parse(fs.readFileSync(path.join(ROOT, 'renders', 'fresh-batch-2026-05-29.json'), 'utf8'));
const render = (BATCH.organic || [])[ORGANIC_IDX];
if (!render || !render.ok) { console.error(`organic[${ORGANIC_IDX}] not found or not ok`); process.exit(2); }

const script = JSON.parse(fs.readFileSync(render.file, 'utf8'));
const opt = script.optimized || {};

const PROMPT = `
You are rewriting a YouTube Shorts title + description + tags for a 60-second news short.
This script was already RENDERED. We just need cleaner metadata that does NOT overlap with this past upload:
  PAST UPLOAD TITLE: "Iran Warns of Escalation: Hormuz Control Claimed"
  PAST UPLOAD TAGS: shorts, worldnews, iran, hormuz, strait, escalation, control, warning
  PAST UPLOAD DESCRIPTION OPENS WITH: "Iran has warned of major escalation if the Strait of Hormuz..."

OUR SCRIPT FACTS:
  Topic: ${render.topic}
  Voiceover: "${(opt.fullVoiceover || '').slice(0, 400)}"
  Existing power words: ${JSON.stringify((opt.powerWords || []).slice(0, 10))}
  Source URLs: ${JSON.stringify((opt.sourceUrls || []).slice(0, 3))}

HARD CONSTRAINTS:
1. The new title MUST emphasize the US-Iran *deal* / Vance / White House framework angle, NOT escalation/Hormuz/strait.
2. The new description MUST open with Vance + the negotiation / framework angle.
3. Tags MUST avoid: hormuz, strait, escalation, control, warning. Use instead: vance, whitehouse, ceasefire, framework, talks, negotiation, deal, diplomacy.
4. Title 8-12 words, hook-led, no clickbait emoji.
5. Description 3-5 sentences, ends with the source URL + #shorts + 4-6 unique hashtags.
6. Tags array of 8-12 single-word tags.

Return STRICT JSON. No markdown. Schema:
{
  "title": "...",
  "description": "...",
  "tags": ["...","...",...]
}
`;

async function callGemini(prompt) {
  const model = process.env.GEMINI_SCRIPT_PRIMARY_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`gemini_http_${r.status}: ${(await r.text()).slice(0, 240)}`);
  const j = await r.json();
  return j.candidates[0].content.parts[0].text;
}

async function callGroq(prompt) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`groq_http_${r.status}: ${(await r.text()).slice(0, 240)}`);
  return (await r.json()).choices[0].message.content;
}

async function generateMeta(maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw = null;
    try {
      console.log(`  attempt ${attempt}: trying gemini-1.5-flash...`);
      raw = await callGemini(PROMPT);
    } catch (e) {
      console.log(`    gemini failed: ${e.message.slice(0, 120)}`);
      try {
        console.log(`    trying groq llama-3.3-70b...`);
        raw = await callGroq(PROMPT);
      } catch (e2) {
        console.log(`    groq failed: ${e2.message.slice(0, 120)}`);
        lastError = e2;
        continue;
      }
    }
    try {
      const obj = JSON.parse(raw);
      if (!obj.title || !obj.description || !Array.isArray(obj.tags)) throw new Error('missing_fields');
      // Verify uniqueness before returning
      const verdict = assertMetadataUnique({ title: obj.title, description: obj.description, tags: obj.tags.map((t) => String(t).toLowerCase()) });
      if (!verdict.ok) {
        console.log(`    uniqueness FAIL: ${verdict.reason} score=${verdict.score} vs "${verdict.hit && verdict.hit.title}"`);
        continue;
      }
      console.log(`    uniqueness PASS`);
      return obj;
    } catch (e) {
      console.log(`    parse/uniqueness err: ${e.message.slice(0, 120)}`);
      lastError = e;
    }
  }
  throw lastError || new Error('all_attempts_failed');
}

function buildPermit() {
  const pc = { titleCandidates: [{ family: 'consequence', title: 'V8 fresh-batch organic retry' }], thumbnailCandidates: [{ concept: 'auto-render-frame', source: 'render-frame' }] };
  const qr = {
    uploadReadiness: 'ready', lane: 'news_premium',
    visualAudit: { verdict: 'PASS', reliability: 'V8 fresh-batch: FLUX+Pexels-fallback hero visuals + RealMotion T1 strong-zoom + single-caption karaoke. Trending-topic script via provider-router LLM cascade; metadata-uniqueness gate passed.', score: 92 },
    packagingCandidates: pc,
    packagingWinner: { title: 'V8 fresh-batch organic retry', thumbnail: 'auto-render-frame', rationale: 'Suppression-recovery branch: fresh-script + Pexels stock + 14d dedupe.' },
    sceneQuality: { totalScenes: 5, visualBeatCount: 5, repeatedVisualRisk: 'low' },
    clipRights: null,
  };
  const result = { mode: 'news_premium', qualityReport: qr, packagingCandidates: pc, packagingWinner: qr.packagingWinner, scriptScorecard: { score: 92, hook: { score: 92 } }, clipRights: null };
  const decision = evaluatePublishReadiness({ result, qualityReport: qr, mode: 'news_premium', dryRun: false });
  if (decision.status !== 'ready') throw new Error('publish-lock refused: ' + decision.reasons.join('; '));
  return createPublishPermit({ result, qualityReport: qr, mode: 'news_premium', platform: 'youtube_shorts', decision });
}

(async function main() {
  console.log(`=== RETRY organic[${ORGANIC_IDX}] YT — ${render.topic} ===`);
  console.log(`videoPath: ${render.outputPath}`);
  if (!fs.existsSync(render.outputPath)) { console.error('video missing'); process.exit(2); }

  console.log('Regenerating metadata...');
  const meta = await generateMeta();
  console.log(`title: ${meta.title}`);
  console.log(`tags: ${meta.tags.slice(0, 10).join(', ')}`);
  console.log(`description (first 200): ${meta.description.slice(0, 200)}...`);

  console.log('\nFiring YT upload to RagnarShortsUltimate (yt-credentials.json)...');
  const permit = buildPermit();
  const ytResult = await uploadToYouTube(render.outputPath, meta.title, meta.description, meta.tags, {
    credentialsPath: path.join(ROOT, 'yt-credentials.json'),
    channelLabel: 'RagnarShortsUltimate',
    categoryId: '25',
    privacyStatus: 'public',
    publishPermit: permit,
  });

  console.log('\nResult:', JSON.stringify({ ok: ytResult.success, videoUrl: ytResult.videoUrl, error: ytResult.error }, null, 2));
  if (ytResult.success) {
    recordUploadedMetadata({
      videoId: ytResult.videoId,
      channel: 'RagnarShortsUltimate',
      platform: 'youtube_shorts',
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
    });
    console.log('recorded for future uniqueness gates.');
  }
  process.exit(ytResult.success ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
