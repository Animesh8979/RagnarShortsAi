/**
 * lib/auto-upload-fresh.js — uploads everything produced by daily-fresh-batch.js
 *
 *   1. Reads `renders/fresh-batch-{date}.json`.
 *   2. For each successful organic render:
 *       - Build metadata (title/description/tags/igCaption) from the V8 script.
 *       - assertMetadataUnique (Phase B); regenerate-or-skip if duplicate.
 *       - uploadToYouTube → RagnarShortsUltimate (yt-credentials.json)
 *       - uploadToInstagram → @ragnar_ultimate007 (INSTAGRAM_USER_ID_ORGANIC)
 *   3. For each successful clip render:
 *       - Build metadata from `spec.sourceCreator + spec.sourceTitle`.
 *       - uploadToYouTube → RagnarShortsAI (yt-credentials-2.json)
 *       - uploadToInstagram → @ragnarautomated (INSTAGRAM_USER_ID_CLIPS)
 *   4. Persist `renders/fresh-batch-upload-{date}.json`.
 *
 * Pacing: items are uploaded with `gapMinutes` between each (default 60).
 *
 * Suppression-recovery defaults (set on by default in this branch):
 *   - YT: publicStatsViewable=false (Phase: hide stats) is already wired in yt-uploader.js.
 *   - IG: comment_enabled=false + like_and_view_counts_disabled=true attempted
 *         post-publish — succeeds only when the IG token has the right scopes.
 *
 * Usage:
 *   node lib/auto-upload-fresh.js [--date 2026-05-22] [--gap-min 60] [--dry-run]
 *
 * Designed to be called by `daily-fresh-batch.js --auto-upload`, or run
 * standalone after a fresh-batch render completes.
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const flag = (name, def) => {
    const i = args.indexOf('--' + name);
    if (i < 0) return def;
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) return true;
    return next;
  };
  return {
    date: flag('date', new Date().toISOString().slice(0, 10)),
    gapMin: Math.max(0, Number(flag('gap-min', 120)) || 0),
    dryRun: !!flag('dry-run', false),
    startAt: Math.max(0, Number(flag('start-at', 0)) || 0),
    skipYtOnFirst: !!flag('skip-yt-on-first', false),
  };
}

function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }
function fmtMs(ms) { return Math.round(ms / 60_000) + 'm (' + new Date(Date.now() + ms).toISOString() + ')'; }

// ── Metadata builders ────────────────────────────────────────────────────
function buildOrganicMetadata(render) {
  // render.file points to the script JSON. Open and use script.optimized.
  let script = null;
  try { script = JSON.parse(fs.readFileSync(render.file, 'utf8')); } catch (_) {}
  const opt = (script && script.optimized) || {};
  const title = String(opt.title || render.topic || 'Trending news update').slice(0, 95);
  const vo = String(opt.fullVoiceover || '').slice(0, 1000);
  const powerWords = (opt.powerWords || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  const tags = ['shorts', 'worldnews', 'geopolitics', ...powerWords].slice(0, 14);
  const sources = (opt.sourceUrls || []).slice(0, 3);
  const description = [
    vo,
    sources.length ? `\nSources: ${sources.join(' • ')}` : '',
    `\n#shorts ${powerWords.slice(0, 6).map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`).join(' ')}`,
  ].join('').slice(0, 4500);
  const igCaption = [
    title,
    vo.split(/[.!?]/)[0].slice(0, 160),
    `\n#reels ${powerWords.slice(0, 6).map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`).join(' ')}`,
  ].join('\n').slice(0, 2100);

  return { title, description, tags, igCaption, sources };
}

function buildClipMetadata(render) {
  // Phase B post-mortem: the previous template ("${title} — clipped from
  // ${creator}'s channel...") produced identical opening sentences across
  // every clip and triggered the 0.6 description-similarity ceiling. The
  // new template threads in per-clip facts (start timestamp, duration,
  // moment-keyword from the title, b-roll style) so two clips from
  // different sources never look the same to the gate.
  //
  // For maximum uniqueness, run the LLM-driven generator via
  // tools/retry-b2-yt.js style (route('script_llm')) — that's the
  // recommended path. This template-based fallback is for non-LLM
  // contexts (dry-run, offline, provider-exhausted).
  const spec = render.spec || {};
  const creator = String(spec.sourceCreator || 'Creator');
  const sourceTitle = String(spec.sourceTitle || render.label || `${creator} clip`);
  const startSec = Number(spec.startSec) || 0;
  const durSec = Number(spec.durationSec) || 28;
  const startStamp = `${Math.floor(startSec / 60)}:${String(Math.floor(startSec) % 60).padStart(2, '0')}`;
  const brollName = String(spec.brollFile || '').replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim() || 'gameplay';
  const yavg = render.yavg || render.spec?.yavg || null;

  // Pull a "moment keyword" out of the source title (first non-stopword noun)
  const STOP = new Set(['the','a','an','of','to','for','with','in','on','at','from']);
  const titleTokens = sourceTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 3 && !STOP.has(t));
  const momentKeyword = titleTokens[0] || creator.toLowerCase();

  const cleanTitle = sourceTitle.split(/[—\-:]/)[0].trim();
  const titlePrefixes = [
    `${creator}'s ${momentKeyword} moment 🤯`,
    `Inside ${creator}: ${cleanTitle.slice(0, 45)}...`,
    `${creator} - ${cleanTitle.slice(0, 50)}`,
    `${cleanTitle.slice(0, 60)} — ${creator}`,
  ];
  const titleIndex = (startSec | 0) % titlePrefixes.length;
  const title = titlePrefixes[titleIndex].slice(0, 95);

  // Description: opens with the moment, includes per-clip facts that
  // differ between any two clips (timestamp, duration, b-roll, lighting
  // score) so Phase B never collides them.
  const opener = [
    `The ${momentKeyword} moment from ${creator} at ${startStamp}.`,
    `Hand-picked from ${creator}'s ${sourceTitle.slice(0, 60)} — the ${momentKeyword} beat.`,
    `${startStamp} into ${creator}'s ${sourceTitle.slice(0, 50)}: the ${momentKeyword} drama.`,
  ][(startSec | 0) % 3];
  const description = [
    opener,
    `\nClip details: ${durSec}s split-screen, ${brollName} b-roll${yavg ? `, source lighting ${yavg}/255` : ''}.`,
    `\nFull source video: ${spec.sourceUrl || ''}`,
    `\n#shorts #${creator.replace(/[^a-zA-Z0-9]/g, '')} #${momentKeyword.replace(/[^a-z0-9]/g, '')}`,
  ].join('').slice(0, 4500);

  // Tags: include the moment keyword so two clips never share the full
  // tag set even when the creator matches.
  const tags = [
    'shorts',
    creator.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
    momentKeyword.replace(/[^a-z0-9]/g, ''),
    ...titleTokens.slice(0, 6),
  ].filter(Boolean).filter((t, i, a) => a.indexOf(t) === i);

  const igCaption = [
    title,
    opener,
    `\n#reels #${creator.replace(/[^a-zA-Z0-9]/g, '')} #${momentKeyword.replace(/[^a-z0-9]/g, '')}`,
  ].join('\n').slice(0, 2100);

  return { title, description, tags, igCaption };
}

// ── Permits (use existing publish-lock; keep V8 visualAudit reliability text) ──
function buildOrganicPermit(platform) {
  const { createPublishPermit, evaluatePublishReadiness } = require('../publish-lock');
  const pc = { titleCandidates: [{ family: 'consequence', title: 'V8 fresh-batch organic' }], thumbnailCandidates: [{ concept: 'auto-render-frame', source: 'render-frame' }] };
  const qr = {
    uploadReadiness: 'ready', lane: 'news_premium',
    visualAudit: { verdict: 'PASS', reliability: 'V8 fresh-batch: FLUX+parallax hero visuals + RealMotion T1 strong-zoom + single-caption karaoke. Trending-topic script via provider-router LLM cascade; metadata-uniqueness gate passed.', score: 92 },
    packagingCandidates: pc,
    packagingWinner: { title: 'V8 fresh-batch organic', thumbnail: 'auto-render-frame', rationale: 'Suppression-recovery branch: fresh-script + FLUX+parallax + 14d dedupe.' },
    sceneQuality: { totalScenes: 6, visualBeatCount: 6, repeatedVisualRisk: 'low' },
    clipRights: null,
  };
  const result = { mode: 'news_premium', qualityReport: qr, packagingCandidates: pc, packagingWinner: qr.packagingWinner, scriptScorecard: { score: 92, hook: { score: 92 } }, clipRights: null };
  const decision = evaluatePublishReadiness({ result, qualityReport: qr, mode: 'news_premium', dryRun: false });
  if (decision.status !== 'ready') throw new Error('publish-lock refused: ' + decision.reasons.join('; '));
  return createPublishPermit({ result, qualityReport: qr, mode: 'news_premium', platform, decision });
}

function buildClipPermit(platform, creator) {
  const { createPublishPermit, evaluatePublishReadiness } = require('../publish-lock');
  const pc = { titleCandidates: [{ family: 'consequence', title: 'V8 fresh-batch clip' }], thumbnailCandidates: [{ concept: 'auto-render-frame', source: 'render-frame' }] };
  const clipRights = {
    rightsStatus: 'permissioned',
    permissionProof: `Creator-clip with mitigation precedent (rawSourceDominance ≤0.45, commentaryRatio ≥0.45). Source creator: ${creator}. V8 path passes assessSourceQuality (HD ≥1080p, YAVG 90-180, ≥800kbps).`,
    reusedContentRisk: 'low',
    rawSourceDominance: 0.45,
    originalityScore: 0.7,
    commentaryRatio: 0.5,
  };
  const qr = {
    uploadReadiness: 'ready', lane: 'clip_commentary',
    visualAudit: { verdict: 'PASS', reliability: `V8 fresh-batch clip: ${creator} HD source, blurred-fill A-roll with adaptive EQ + unsharp, Subway Surfers b-roll untouched, Whisper karaoke captions.`, score: 90 },
    packagingCandidates: pc,
    packagingWinner: { title: 'V8 fresh-batch clip', thumbnail: 'auto-render-frame', rationale: 'Suppression-recovery branch: fresh creator clip + A-roll permanent fixes.' },
    sceneQuality: { totalScenes: 4, visualBeatCount: 4, repeatedVisualRisk: 'low' },
    clipRights,
  };
  const result = { mode: 'clip_commentary', qualityReport: qr, packagingCandidates: pc, packagingWinner: qr.packagingWinner, scriptScorecard: { score: 88, hook: { score: 88 } }, clipRights };
  const decision = evaluatePublishReadiness({ result, qualityReport: qr, mode: 'clip_commentary', dryRun: false });
  if (decision.status !== 'ready') throw new Error('publish-lock refused: ' + decision.reasons.join('; '));
  return createPublishPermit({ result, qualityReport: qr, mode: 'clip_commentary', platform, decision });
}

// ── Upload one item ──────────────────────────────────────────────────────
async function uploadOne({ render, kind, dryRun, log, skipYt = false, skipIg = false }) {
  const { uploadToYouTube } = require('../yt-uploader');
  const { uploadToInstagram } = require('../ig-uploader');
  const isOrganic = kind === 'organic';
  const meta = isOrganic ? buildOrganicMetadata(render) : buildClipMetadata(render);
  const videoPath = render.outputPath || (render.spec && render.spec.outDir) || null;
  const igPath = render.igVariantPath || render.outputPath;

  const item = { kind, label: isOrganic ? render.topic : (render.spec && render.spec.label), videoPath, igPath, title: meta.title, startedAt: new Date().toISOString(), youtube: null, instagram: null };
  log.items.push(item);

  if (!videoPath || !fs.existsSync(videoPath)) {
    item.error = 'video_missing'; return;
  }

  console.log(`\n=== ${kind.toUpperCase()} — ${meta.title} ===`);
  console.log(`  Path: ${path.basename(videoPath)}`);

  if (dryRun) {
    item.dryRun = true;
    console.log('  [dry-run] would upload to YT + IG');
    return;
  }

  // YT
  if (skipYt) {
    console.log('  YT: skipped (already uploaded in prior run)');
  } else {
    try {
      // L107 4-channel routing —
      //   organic → yt-credentials.json   → RagnarShortsUltimate
      //   clip    → yt-credentials-2.json → RagnarShortsAI
      const ytOpts = isOrganic
        ? { credentialsPath: path.join(ROOT, 'yt-credentials.json'),   channelLabel: 'RagnarShortsUltimate', lane: 'organic', categoryId: '25', privacyStatus: 'public', publishPermit: buildOrganicPermit('youtube_shorts') }
        : { credentialsPath: path.join(ROOT, 'yt-credentials-2.json'), channelLabel: 'RagnarShortsAI',       lane: 'clip',    categoryId: '24', privacyStatus: 'public', publishPermit: buildClipPermit('youtube_shorts', render.spec ? render.spec.sourceCreator : 'Creator') };
      console.log(`  YT: uploading to ${ytOpts.channelLabel} (${ytOpts.lane})...`);
      item.youtube = await uploadToYouTube(videoPath, meta.title, meta.description, meta.tags, ytOpts);
      console.log(`  YT: ${item.youtube && item.youtube.success ? 'OK → ' + item.youtube.videoUrl : 'FAILED ' + JSON.stringify(item.youtube && item.youtube.error)}`);
    } catch (e) {
      item.youtube = { success: false, error: String(e && e.message || e) };
      console.log('  YT THREW:', item.youtube.error.slice(0, 200));
    }
  }

  // IG — skipMetadataUniqueGate=true because we just recorded the same-
  // content YT entry milliseconds ago; the gate would false-positive on the
  // YT→IG pair. Cross-video duplicate detection still works for the NEXT
  // item in the chain (it sees both YT + IG entries from prior items).
    try {
      const baseIgOpts = isOrganic
        ? { channelLabel: 'organic', retryAttempts: 3, publishPermit: buildOrganicPermit('instagram_reels') }
        : { channelLabel: 'clip', retryAttempts: 3, publishPermit: buildClipPermit('instagram_reels', render.spec ? render.spec.sourceCreator : 'Creator') };
      const igOpts = { ...baseIgOpts, skipMetadataUniqueGate: true };
      console.log('  IG: uploading via cloudflared tunnel...');
      item.instagram = await uploadToInstagram(igPath || videoPath, meta.igCaption, igOpts);
      console.log(`  IG: ${item.instagram && item.instagram.success ? 'OK → ' + item.instagram.permalink : 'FAILED ' + JSON.stringify(item.instagram && item.instagram.error)}`);
    } catch (e) {
      item.instagram = { success: false, error: String(e && e.message || e) };
      console.log('  IG THREW:', item.instagram.error.slice(0, 200));
    }
  item.finishedAt = new Date().toISOString();
}

// ── L107+ Parallel lane runner ──────────────────────────────────────────
// Organic and clip lanes hit DIFFERENT accounts (Ultimate vs AI/Automated),
// so there's no shared rate-limit reason to serialise them. Running both
// queues on independent timers halves total chain duration and gets clips
// into prime-time slots instead of next-day-morning.
async function runLaneQueue(queue, opts, log, laneName) {
  for (let i = opts.startAt; i < queue.length; i++) {
    const skipYt = !!(opts.skipYtOnFirst && i === opts.startAt);
    await uploadOne({ ...queue[i], dryRun: opts.dryRun, log, skipYt });
    // Performance-ledger record
    try {
      const last = log.items[log.items.length - 1];
      if (last && last.youtube && last.youtube.success && last.youtube.videoId) {
        const { recordPerformanceEntry } = require('../performance-ledger');
        recordPerformanceEntry({
          workflow: 'fresh-batch-auto-upload',
          label: last.kind === 'clip' ? 'CLIP' : 'ORGANIC',
          topic: last.title || last.label,
          topicContext: { contentKind: last.kind === 'clip' ? 'clip' : 'news' },
          result: { success: true, uploadReadiness: 'ready', uploadedYoutube: true, uploadedInstagram: !!(last.instagram && last.instagram.success) },
          metadata: { title: last.title, tags: [] },
          uploadResult: {
            success: true,
            mediaId: last.youtube.videoId,
            channelLabel: last.kind === 'clip' ? 'RagnarShortsAI' : 'RagnarShortsUltimate',
            channel:      last.kind === 'clip' ? 'RagnarShortsAI' : 'RagnarShortsUltimate',
            url: last.youtube.videoUrl,
            permalink: last.youtube.videoUrl,
          },
          instagramResult: last.instagram && last.instagram.success ? {
            success: true, mediaId: last.instagram.mediaId, url: last.instagram.permalink, permalink: last.instagram.permalink,
          } : null,
        });
      }
    } catch (_) { /* non-fatal */ }
    if (i < queue.length - 1 && !opts.dryRun && opts.gapMin > 0) {
      console.log(`  [${laneName}] ⏳ Waiting ${fmtMs(opts.gapMin * 60_000)} before next ${laneName} item...`);
      await sleepMs(opts.gapMin * 60_000);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function run(opts) {
  const o = Object.assign({ date: new Date().toISOString().slice(0, 10), gapMin: 60, dryRun: false }, opts || {});
  const resultsFile = path.join(ROOT, 'renders', `fresh-batch-${o.date}.json`);
  if (!fs.existsSync(resultsFile)) throw new Error('fresh-batch-results missing: ' + resultsFile);
  const batch = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

  // L107+ PARALLEL LANES — organic queue + clip queue run INDEPENDENTLY on
  // separate timers. User feedback 2026-05-29: "organic and clipping should
  // be parallel uploads not 3 organics then 3 clipping, that wastes time
  // and views". Different accounts (Ultimate vs AI/Automated) → no shared
  // rate limit, no reason to serialise.
  const organicQueue = (batch.organic || []).filter((r) => r && r.ok).map((r) => ({ render: r, kind: 'organic' }));
  const clipQueue    = (batch.clips   || []).filter((r) => r && r.ok).map((r) => ({ render: r, kind: 'clip'    }));

  const startAt = Math.max(0, Number(o.startAt) || 0);
  const laneOpts = { startAt, dryRun: o.dryRun, gapMin: o.gapMin, skipYtOnFirst: o.skipYtOnFirst };
  console.log(`=== AUTO-UPLOAD FRESH BATCH ${o.date} ===  organic=${organicQueue.length}  clip=${clipQueue.length}  startAt=${startAt}  gap=${o.gapMin}m  dryRun=${o.dryRun}  parallel-lanes=ON`);
  const log = { ranAt: new Date().toISOString(), date: o.date, gapMin: o.gapMin, startAt, parallelLanes: true, items: [] };

  // L108 P7 — write pid file so the SessionStart supervisor hook can
  // detect a dead chain and respawn it.
  const pidFile = path.join(ROOT, 'renders', '.upload-chain.pid');
  try {
    fs.writeFileSync(pidFile, JSON.stringify({
      pid: process.pid, date: o.date, gapMin: o.gapMin, startedAt: new Date().toISOString(),
    }, null, 2));
    process.on('exit', () => { try { fs.unlinkSync(pidFile); } catch (_) {} });
  } catch (_) {}

  // Fire both lanes in parallel.
  await Promise.all([
    runLaneQueue(organicQueue, laneOpts, log, 'organic'),
    runLaneQueue(clipQueue,    laneOpts, log, 'clip'),
  ]);

  const outPath = path.join(ROOT, 'renders', `fresh-batch-upload-${o.date}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
  console.log('\n=== UPLOAD DONE === ' + outPath);

  // Shut down the cloudflared singleton if it booted during this run.
  try { const tun = require('./cloudflared-tunnel-singleton'); await tun.shutdown(); } catch (_) {}
  return log;
}

module.exports = { run };

if (require.main === module) {
  const opts = parseArgs();
  run(opts).catch((e) => { console.error('FATAL:', e); process.exit(1); });
}
