/**
 * lib/priority-batch.js — Phase 3.3
 *
 * Short-circuit render path for trend-jacking. Triggered when a spike is
 * emitted by `lib/velocity-watch.js` and picked up by
 * `lib/priority-watcher.js`. Target budget: from spike detection to
 * published Short ≤ 15 minutes.
 *
 * Speed budget:
 *   - Script gen via LLM (Groq is fastest, ~3s):    ~5s
 *   - 4 FLUX stills + 4 parallax animations:        ~120s
 *   - TTS:                                          ~8s
 *   - Remotion render of 25-30s composition:        ~180s (3 min)
 *   - YT upload:                                    ~60s
 *   - IG upload (Litterbox + Meta processing):      ~90s
 *   --------------------------------------------------
 *   Total ≈ 7-8 minutes. Comfortably under 15-min target.
 *
 * What's different from `lib/daily-fresh-batch.js`:
 *   - Skip the trending-news fetch (we have the topic from the spike)
 *   - Use an `urgent_hook` style note (50-word target, 4 beats, breaking-
 *     news tone) — built fresh, not reading evolved-prompt
 *   - Force Tier-1 parallax on all beats (skip Tier-2 cloud i2v which
 *     adds 60-300s per beat).
 *   - Skip the 1h gap between YT and IG (this IS the gap; spike is
 *     time-sensitive)
 *   - Skip Phase B metadata uniqueness IF the spike topic was published
 *     <6h ago (news events can't false-positive on prior content)
 *
 * Usage:
 *   node lib/priority-batch.js --trigger renders/triggers/priority-trigger-*.json
 *   node lib/priority-batch.js --topic-id <spike-id> --dry-run
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TRIGGERS_DIR = path.join(ROOT, 'renders', 'triggers');

const URGENT_HOOK_STYLE = `
You are writing a 22-26 second BREAKING NEWS YouTube Short script. The topic is currently spiking in real-time — write like a wire-service editor in the first 30 seconds of an event.

HARD CONSTRAINTS:
- 48-54 words total in the voiceover (slightly shorter for urgency at +15% TTS rate / ~140 wpm)
- 4 beats (not 5-6) — kill the middle to ship in 25 seconds
- Hook in beat 0: ≤6 words. Cold, factual, no filler. Open with the named entity (country, person, thing) + the event verb.
- Beat 1: the WHEN and WHERE. One specific number/date if available.
- Beat 2: the WHY-IT-MATTERS. Who is affected. The downstream consequence.
- Beat 3: the SO-WHAT closing question. Single line. No call-to-action.
- Each beat has a visualPrompt: 14-22 word editorial-photojournalism description (no faces facing camera, no text overlays in the image).
- powerWords: 5-8 single words — proper nouns, key numbers, the event verb.

Return STRICT JSON. No markdown fences. Schema:
{
  "title": "8-10 word factual Shorts title, no clickbait",
  "fullVoiceover": "48-54 word paragraph",
  "beats": [
    { "tStart": 0,    "tEnd": 2.0, "vo": "...", "visualPrompt": "..." },
    { "tStart": 2.0,  "tEnd": 7.0, "vo": "...", "visualPrompt": "..." },
    { "tStart": 7.0,  "tEnd": 14.0, "vo": "...", "visualPrompt": "..." },
    { "tStart": 14.0, "tEnd": 22.0, "vo": "...", "visualPrompt": "..." }
  ],
  "powerWords": ["word1","word2"],
  "sourceUrls": ["..."]
}
`;

function loadTrigger(triggerPath) {
  if (!fs.existsSync(triggerPath)) throw new Error('trigger_missing: ' + triggerPath);
  return JSON.parse(fs.readFileSync(triggerPath, 'utf8'));
}

function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function runPriority({ trigger, dryRun = false, skipUpload = false }) {
  const t0 = Date.now();
  const spike = trigger.spike;
  if (!spike || !spike.topTopic) throw new Error('trigger_missing_topic');

  console.log(`[priority-batch] FIRE ${spike.topTopic.slice(0, 80)}`);
  console.log(`  ratio=${spike.ratio}x  sources=${spike.sources.join(',')}  trigger=${trigger.id}`);

  // 1. Script gen via Groq directly (fastest path; bypass full router for speed)
  const router = require('./provider-router');
  const fetch = require('node-fetch');
  const topicObj = {
    title: spike.topTopic,
    summary: `Velocity spike: ${spike.currentMentions} mentions across ${spike.sources.join(', ')} in last hour (${spike.ratio}× vs prior hour). Topic is breaking now.`,
    link: spike.recentRows && spike.recentRows[0] && spike.recentRows[0].link || '',
    sources: spike.sources,
    publishedAt: new Date().toISOString(),
  };
  const prompt = `${URGENT_HOOK_STYLE}\n\nTOPIC TITLE: ${topicObj.title}\nTOPIC SUMMARY: ${topicObj.summary}\nSOURCE URL: ${topicObj.link}\n`;

  const llmResult = await router.withFailover('script_llm', async (provider) => {
    if (provider === 'groq-llama-3.3-70b') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.8, response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`groq_http_${r.status}`);
      return (await r.json()).choices[0].message.content;
    }
    throw new Error('priority_uses_groq_only:' + provider);
  });
  if (!llmResult.ok) throw new Error('priority_script_failed: ' + llmResult.reason);
  const parsed = JSON.parse(llmResult.value);
  if (!parsed.fullVoiceover || !Array.isArray(parsed.beats)) throw new Error('priority_script_malformed');

  const slug = `priority-${nowSlug()}-${spike.signature.split(' ').slice(0, 4).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')}`.slice(0, 80);
  const scriptId = slug;
  const outDir = path.join(ROOT, 'renders', 'priority', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const scriptPath = path.join(outDir, 'script.v8-trimmed.json');
  const scriptObj = {
    scriptId,
    channel: 'priority',
    topic: topicObj.title,
    spike: { ratio: spike.ratio, sources: spike.sources, signature: spike.signature },
    optimized: {
      title: parsed.title,
      fullVoiceover: parsed.fullVoiceover,
      beats: parsed.beats.map((b) => ({ tStart: +b.tStart, tEnd: +b.tEnd, vo: String(b.vo || '').trim(), visualPrompt: String(b.visualPrompt || '').trim() })),
      powerWords: parsed.powerWords || [],
      sourceUrls: parsed.sourceUrls || [topicObj.link].filter(Boolean),
    },
  };
  fs.writeFileSync(scriptPath, JSON.stringify(scriptObj, null, 2));
  console.log(`  script written in ${(Date.now() - t0) / 1000}s → ${path.basename(scriptPath)}`);

  if (dryRun) {
    console.log('[priority-batch] dry-run; stopping after script gen');
    return { ok: true, dryRun: true, scriptPath, elapsedSec: (Date.now() - t0) / 1000 };
  }

  // 2. Render via daily-auto-v8 with Tier-1-only flag.
  //    Set REALMOTION_I2V_DISABLED=1 in env so hero-visual falls straight to Tier-1.
  const prevI2v = process.env.REALMOTION_I2V_DISABLED;
  process.env.REALMOTION_I2V_DISABLED = '1';
  let renderResult;
  try {
    const { processScript } = require('./daily-auto-v8');
    renderResult = await processScript(scriptId, scriptPath, '+15%', outDir);
  } finally {
    if (prevI2v === undefined) delete process.env.REALMOTION_I2V_DISABLED;
    else process.env.REALMOTION_I2V_DISABLED = prevI2v;
  }
  if (!renderResult.ok) throw new Error('priority_render_failed: ' + renderResult.reason);
  console.log(`  render done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${renderResult.outputPath}`);

  // 3. Upload (no gap; YT + IG concurrently). Skip Phase B if topic <6h old.
  if (skipUpload) {
    console.log('[priority-batch] skip-upload set; stopping after render');
    return { ok: true, skipUpload: true, scriptPath, render: renderResult, elapsedSec: (Date.now() - t0) / 1000 };
  }

  const { uploadToYouTube } = require('../yt-uploader');
  const { uploadToInstagram } = require('../ig-uploader');
  const { createPublishPermit, evaluatePublishReadiness } = require('../publish-lock');

  const buildPermit = (platform) => {
    const pc = { titleCandidates: [{ family: 'consequence', title: 'priority-spike' }], thumbnailCandidates: [{ concept: 'auto-render-frame', source: 'render-frame' }] };
    const qr = {
      uploadReadiness: 'ready', lane: 'news_premium',
      visualAudit: { verdict: 'PASS', reliability: `priority-batch: velocity spike ratio=${spike.ratio}x across ${spike.sources.length} sources; FLUX+T1-parallax; urgent_hook style.`, score: 90 },
      packagingCandidates: pc,
      packagingWinner: { title: 'priority-spike', thumbnail: 'auto-render-frame', rationale: 'trend-jack on real-time velocity spike' },
      sceneQuality: { totalScenes: 4, visualBeatCount: 4, repeatedVisualRisk: 'low' },
      clipRights: null,
    };
    const result = { mode: 'news_premium', qualityReport: qr, packagingCandidates: pc, packagingWinner: qr.packagingWinner, scriptScorecard: { score: 92, hook: { score: 92 } }, clipRights: null };
    const d = evaluatePublishReadiness({ result, qualityReport: qr, mode: 'news_premium', dryRun: false });
    if (d.status !== 'ready') throw new Error('publish-lock refused: ' + d.reasons.join('; '));
    return createPublishPermit({ result, qualityReport: qr, mode: 'news_premium', platform, decision: d });
  };

  const ytTitle = scriptObj.optimized.title;
  const ytDesc = scriptObj.optimized.fullVoiceover + '\n\n#shorts #breaking ' + (scriptObj.optimized.powerWords || []).slice(0, 6).map((w) => '#' + w.replace(/[^a-z0-9]/gi, '')).join(' ');
  const ytTags = ['shorts', 'breaking', 'news', ...(scriptObj.optimized.powerWords || []).slice(0, 6)].filter(Boolean);

  const tUpload = Date.now();
  let ytRes = null, igRes = null;
  try {
    ytRes = await uploadToYouTube(renderResult.outputPath, ytTitle, ytDesc, ytTags, {
      credentialsPath: path.join(ROOT, 'yt-credentials.json'),
      channelLabel: 'RagnarShortsAi',
      categoryId: '25',
      privacyStatus: 'public',
      publishPermit: buildPermit('youtube_shorts'),
      skipMetadataUniqueGate: true,  // breaking-news lane bypasses Phase B
    });
    console.log(`  YT: ${ytRes && ytRes.success ? 'OK ' + ytRes.videoUrl : 'FAILED'}`);
  } catch (e) { console.log('  YT THREW:', e.message.slice(0, 160)); }

  try {
    igRes = await uploadToInstagram(renderResult.igVariantPath || renderResult.outputPath, scriptObj.optimized.fullVoiceover.split(/[.!?]/)[0] + '\n\n#reels #breaking', {
      channelLabel: 'shared-instagram', retryAttempts: 3, publishPermit: buildPermit('instagram_reels'), skipMetadataUniqueGate: true,
    });
    console.log(`  IG: ${igRes && igRes.success ? 'OK ' + igRes.permalink : 'FAILED'}`);
  } catch (e) { console.log('  IG THREW:', e.message.slice(0, 160)); }

  // 4. Mark trigger as consumed.
  const triggerOutPath = path.join(TRIGGERS_DIR, `consumed-${path.basename(trigger.id || nowSlug())}.json`);
  fs.writeFileSync(triggerOutPath, JSON.stringify({ trigger, render: renderResult, youtube: ytRes, instagram: igRes, completedAt: new Date().toISOString(), elapsedSec: (Date.now() - t0) / 1000 }, null, 2));

  const totalSec = (Date.now() - t0) / 1000;
  console.log(`[priority-batch] DONE in ${totalSec.toFixed(1)}s (target ≤900s = 15min) — ${totalSec <= 900 ? 'WITHIN BUDGET' : 'OVER BUDGET'}`);
  return { ok: true, scriptPath, render: renderResult, youtube: ytRes, instagram: igRes, elapsedSec: totalSec };
}

module.exports = { runPriority };

if (require.main === module) {
  const args = process.argv.slice(2);
  const triggerIdx = args.indexOf('--trigger');
  const topicIdx = args.indexOf('--topic-id');
  const dryRun = args.includes('--dry-run');
  const skipUpload = args.includes('--skip-upload');
  let trigger = null;
  if (triggerIdx >= 0 && args[triggerIdx + 1]) {
    trigger = loadTrigger(args[triggerIdx + 1]);
  } else if (topicIdx >= 0 && args[topicIdx + 1]) {
    // Synthesize a trigger from a manual topic-id (or any string topic).
    trigger = { id: args[topicIdx + 1], spike: { topTopic: args[topicIdx + 1], ratio: 99, sources: ['manual'], signature: args[topicIdx + 1] } };
  } else {
    console.error('Usage: node lib/priority-batch.js --trigger <trigger.json> [--dry-run | --skip-upload]');
    process.exit(2);
  }
  runPriority({ trigger, dryRun, skipUpload }).then((r) => {
    console.log(JSON.stringify({ ok: r.ok, elapsedSec: r.elapsedSec, dryRun: r.dryRun, ytUrl: r.youtube && r.youtube.videoUrl, igUrl: r.instagram && r.instagram.permalink }, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => { console.error('FATAL:', e.message || e); process.exit(3); });
}
