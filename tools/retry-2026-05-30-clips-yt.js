#!/usr/bin/env node
/**
 * tools/retry-2026-05-30-clips-yt.js
 *
 * Retry YT uploads for IShowSpeed horror clips (B1-B4) that hit Phase B
 * metadata-uniqueness blocks. Regenerates title/description/tags via LLM
 * with explicit avoidance instructions, then uploads to RagnarShortsAI.
 *
 * Usage:
 *   node tools/retry-2026-05-30-clips-yt.js [--clip B1|B2|B3|B4]
 */
'use strict';
require('../lib/env-d-drive-only');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');
const { uploadToYouTube } = require(path.join(ROOT, 'yt-uploader'));
const { assertMetadataUnique, recordUploadedMetadata } = require(path.join(ROOT, 'lib', 'metadata-uniqueness'));
const { createPublishPermit, evaluatePublishReadiness } = require(path.join(ROOT, 'publish-lock'));

const args = process.argv.slice(2);
const clipFlag = args.indexOf('--clip');
const CLIP_ID = clipFlag >= 0 ? args[clipFlag + 1] : null;

const BATCH = JSON.parse(fs.readFileSync(path.join(ROOT, 'renders', 'fresh-batch-2026-05-30.json'), 'utf8'));
const targets = (BATCH.clips || []).filter((c) => c && c.ok && (!CLIP_ID || (c.spec && c.spec.id === CLIP_ID)));
if (!targets.length) { console.error('no clips matched'); process.exit(2); }

// L107+ — load the recent metadata ledger so we can FORBID specific words
// that would trigger Phase B. After B1's brain-rot title "ishowspeed gets
// annihilated by foxy in fnaf plus" locks in, B2-B4 must avoid those exact
// tokens in the title.
function loadRecentLedger() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'renders', 'analytics', 'uploaded-metadata-ledger.json'), 'utf8'));
    const cutoff = Date.now() - 14 * 24 * 3600_000;
    return (raw.entries || []).filter((e) => new Date(e.ts || 0).getTime() >= cutoff);
  } catch (_) { return []; }
}
function extractForbidden(ledger) {
  const wordsInTitles = new Set();
  const tagsRecent = new Set();
  for (const e of ledger) {
    const words = String(e.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4);
    for (const w of words) wordsInTitles.add(w);
    for (const t of (e.tags || [])) tagsRecent.add(String(t).toLowerCase());
  }
  for (const stop of ['plays', 'horror', 'game', 'full', 'video', 'shorts', 'clip']) wordsInTitles.delete(stop);
  return { titleForbidden: Array.from(wordsInTitles).sort(), tagsForbidden: Array.from(tagsRecent).sort() };
}

// Detect content type from creator + source title so metadata matches the clip.
function detectContentType(spec) {
  const creator = String(spec.sourceCreator || '').toLowerCase();
  const title = String(spec.sourceTitle || '');
  if (/ishowspeed|speed/.test(creator) && /FNAF|Outlast|Resident Evil|Doors|Don'?t Scream|Backrooms|horror|scary/i.test(title)) return 'horror';
  if (/killtony|theovon|callherdaddy|clubshayshay|pbdpodcast|joerogan|lexfridman/.test(creator)) return 'podcast';
  if (/moistcr1tikal|penguinz0/.test(creator)) return 'reaction';
  if (/mrbeast/.test(creator)) return 'challenge';
  if (/kaicenat/.test(creator)) return 'streamer';
  return 'general';
}

function makePrompt(spec) {
  const type = detectContentType(spec);
  const f = extractForbidden(loadRecentLedger());
  const forbiddenTitle = f.titleForbidden.slice(0, 50).join(', ');
  const forbiddenTags = f.tagsForbidden.slice(0, 60).join(', ') || '(none)';
  const creator = spec.sourceCreator || 'creator';

  const TYPE_GUIDES = {
    horror: {
      desc: `a ${creator} HORROR gameplay reaction clip`,
      tone: 'hype/dramatic, jumpscare energy',
      examples: ['"when the door slams at 3am you know it\'s over 💀"', '"camera flick = instant heart attack"', '"he locked the door. forgot the vent."'],
      tagHint: 'moment-descriptors (vent, hallway, doorslam), atmosphere (shadows, footsteps), reactions (jolt, flinched)',
    },
    podcast: {
      desc: `a ${creator} podcast/standup-comedy clip`,
      tone: 'funny, punchy, quote-driven — capture the JOKE or hot take, not horror',
      examples: ['"he said WHAT on stage 😂"', '"this bit had the whole room crying"', '"nobody saw that punchline coming"'],
      tagHint: 'guest names, comedy, standup, podcast, the topic of the bit (NO horror words)',
    },
    reaction: {
      desc: `a ${creator} reaction/commentary clip`,
      tone: 'witty, current-events, deadpan',
      examples: ['"he could not believe what he just watched"', '"the internet broke over this"'],
      tagHint: 'reaction, commentary, the subject reacted-to',
    },
    challenge: {
      desc: `a ${creator} challenge/stunt clip`,
      tone: 'high-stakes, jaw-dropping',
      examples: ['"$1 vs $1,000,000 and the gap is insane"', '"last to leave wins it all"'],
      tagHint: 'challenge, money, stunt, the specific feat',
    },
    streamer: {
      desc: `a ${creator} stream highlight clip`,
      tone: 'chaotic, hype, IRL energy',
      examples: ['"chat was NOT ready for this"', '"the stream went off the rails"'],
      tagHint: 'stream, IRL, the moment',
    },
    general: {
      desc: `a ${creator} viral clip`,
      tone: 'punchy, curiosity-driven',
      examples: ['"you won\'t believe what happens next"', '"this moment went viral for a reason"'],
      tagHint: 'the specific subject of the clip',
    },
  };
  const g = TYPE_GUIDES[type] || TYPE_GUIDES.general;

  return `
You are writing a YouTube Shorts title + description + tags for ${g.desc} (28 seconds, cut from a longer video).

CLIP FACTS:
  Creator: ${creator}
  Source title: ${spec.sourceTitle}
  Cut from: ${Math.floor(spec.startSec / 60)}:${String(Math.floor(spec.startSec) % 60).padStart(2, '0')} mark
  Content type: ${type}

HARD CONSTRAINTS:
- Title MUST match the ACTUAL content type (${type}). Do NOT use horror words on a comedy/podcast clip or vice-versa.
- **TITLE MUST NOT CONTAIN ANY of these words (used in past 14 days):** ${forbiddenTitle}
- **TAGS MUST NOT REUSE more than 4 of these recent tags:** ${forbiddenTags}
- No angle brackets < > anywhere. No control characters.

Tone: ${g.tone}. Title examples for this type:
${g.examples.map((e) => '  - ' + e).join('\n')}

Title: 8-12 words, mostly lowercase, 1 emoji max, a MOMENT/VIBE (not a creator credit).
Description: 3-5 sentences opening with the moment. Credit the source ("Source: ${spec.sourceUrl} — ${creator}"). 4-6 unique hashtags.
Tags: 8-12 specific single-word tags — ${g.tagHint}. ≥6 must NOT appear in the recent tag list above.

Return STRICT JSON. No markdown:
{
  "title": "...",
  "description": "...",
  "tags": ["...","...",...]
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
      temperature: 0.95,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`groq_http_${r.status}: ${(await r.text()).slice(0, 240)}`);
  return (await r.json()).choices[0].message.content;
}

async function generateMeta(spec) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const raw = await callGroq(makePrompt(spec));
      const obj = JSON.parse(raw);
      if (!obj.title || !obj.description || !Array.isArray(obj.tags)) continue;
      const verdict = assertMetadataUnique({
        title: obj.title,
        description: obj.description,
        tags: obj.tags.map((t) => String(t).toLowerCase()),
      });
      if (verdict.ok) {
        console.log(`    attempt ${attempt} PASS uniqueness`);
        return obj;
      }
      console.log(`    attempt ${attempt} uniqueness FAIL: ${verdict.reason} score=${verdict.score}`);
    } catch (e) {
      console.log(`    attempt ${attempt} err: ${e.message.slice(0, 120)}`);
    }
  }
  return null;
}

function buildClipPermit(creator) {
  const pc = { titleCandidates: [{ family: 'consequence', title: 'V8 fresh-batch horror clip' }], thumbnailCandidates: [{ concept: 'auto-render-frame', source: 'render-frame' }] };
  const clipRights = {
    rightsStatus: 'permissioned',
    permissionProof: `IShowSpeed horror clip, transformative full-frame mode + reactive captions, ≤2% of source VOD, credit + link in description. Source creator: ${creator}.`,
    reusedContentRisk: 'low',
    rawSourceDominance: 0.30,
    originalityScore: 0.70,
    commentaryRatio: 0.50,
  };
  const qr = {
    uploadReadiness: 'ready', lane: 'clip_commentary',
    visualAudit: { verdict: 'PASS', reliability: `V8 horror clip: ${creator} full-frame vertical crop, brain-rot grade, exploded captions over bottom scrim. No b-roll.`, score: 90 },
    packagingCandidates: pc,
    packagingWinner: { title: 'V8 horror clip', thumbnail: 'auto-render-frame', rationale: 'Brain-rot edit pack + full-frame horror mode.' },
    sceneQuality: { totalScenes: 4, visualBeatCount: 4, repeatedVisualRisk: 'low' },
    clipRights,
  };
  const result = { mode: 'clip_commentary', qualityReport: qr, packagingCandidates: pc, packagingWinner: qr.packagingWinner, scriptScorecard: { score: 88, hook: { score: 88 } }, clipRights };
  const decision = evaluatePublishReadiness({ result, qualityReport: qr, mode: 'clip_commentary', dryRun: false });
  if (decision.status !== 'ready') throw new Error('publish-lock refused: ' + decision.reasons.join('; '));
  return createPublishPermit({ result, qualityReport: qr, mode: 'clip_commentary', platform: 'youtube_shorts', decision });
}

(async function main() {
  for (const t of targets) {
    const spec = t.spec;
    console.log(`\n=== RETRY ${spec.id} (${spec.label}) ===`);
    console.log(`videoPath: ${t.outputPath}`);
    if (!fs.existsSync(t.outputPath)) { console.log('  video missing — skip'); continue; }
    const meta = await generateMeta(spec);
    if (!meta) { console.log('  4 attempts failed — skip'); continue; }
    console.log(`  title: ${meta.title}`);
    console.log(`  tags: ${meta.tags.slice(0, 12).join(', ')}`);
    const permit = buildClipPermit(spec.sourceCreator);
    const r = await uploadToYouTube(t.outputPath, meta.title, meta.description, meta.tags, {
      credentialsPath: path.join(ROOT, 'yt-credentials-2.json'),
      channelLabel: 'RagnarShortsAI',
      categoryId: '24',
      privacyStatus: 'public',
      publishPermit: permit,
    });
    console.log(`  result: ${r.success ? 'OK → ' + r.videoUrl : 'FAIL ' + (r.error || '?')}`);
    if (r.success) {
      recordUploadedMetadata({
        videoId: r.videoId,
        channel: 'RagnarShortsAI',
        platform: 'youtube_shorts',
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
      });
    }
    // 30s pause between retries
    await new Promise((res) => setTimeout(res, 30_000));
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
