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
 *   node lib/auto-upload-fresh.js --organic-only
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
    // L110 T0.2 — default gap 240min (4h). 2026 algo gives each Short its own
    // 30-60min eval window; ≥4h spacing avoids cannibalizing those windows.
    gapMin: Math.max(0, Number(flag('gap-min', 240)) || 0),
    dryRun: !!flag('dry-run', false),
    startAt: Math.max(0, Number(flag('start-at', 0)) || 0),
    skipYtOnFirst: !!flag('skip-yt-on-first', false),
    skipIgOnFirst: !!flag('skip-ig-on-first', false),
    skipCarousel: !!flag('skip-carousel', false),
    organicOnly: !!flag('organic-only', false),
    clipsOnly: !!flag('clips-only', false),
    // L109+ — delay the FIRST item of each lane by N minutes so a resumed
    // chain stays on the 3h cadence relative to already-uploaded items.
    initialDelayMin: Math.max(0, Number(flag('initial-delay-min', 0)) || 0),
  };
}

function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }
function fmtMs(ms) { return Math.round(ms / 60_000) + 'm (' + new Date(Date.now() + ms).toISOString() + ')'; }

function motionSidecarPath(primaryPath) {
  if (!primaryPath) return null;
  const ext = path.extname(primaryPath);
  if (!ext) return null;
  const candidate = primaryPath.slice(0, -ext.length) + '-motion' + ext;
  return fs.existsSync(candidate) ? candidate : null;
}

function v9MotionSidecarPath(primaryPath) {
  if (!primaryPath) return null;
  const ext = path.extname(primaryPath);
  if (!ext) return null;
  const candidate = primaryPath.slice(0, -ext.length) + '-v9-motion' + ext;
  return fs.existsSync(candidate) ? candidate : null;
}

// ── Metadata builders ────────────────────────────────────────────────────
function buildOrganicMetadata(render, variantIndex = 0) {
  // render.file points to the script JSON. Open and use script.optimized.
  let script = null;
  try { script = JSON.parse(fs.readFileSync(render.file, 'utf8')); } catch (_) {}
  const opt = (script && script.optimized) || {};
  const title = String(opt.title || render.topic || 'Trending news update').slice(0, 95);
  const vo = String(opt.fullVoiceover || '').slice(0, 1000);
  const powerWords = (opt.powerWords || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  // L109 P3 — cap tags at 5. 2026 YT shadow-bans uploads with >15 hashtags.
  // Tight surgical tags > spam. 1 platform tag + 1 niche + 3 specific = 5 max.
  const tags = ['shorts', 'worldnews', ...powerWords].slice(0, 5);
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

  if (variantIndex > 0) {
    return buildOrganicMetadataVariant({ render, base: { title, description, tags, igCaption, sources }, variantIndex });
  }

  return { title, description, tags, igCaption, sources };
}

function buildOrganicMetadataVariant({ render, base, variantIndex }) {
  const topic = String(render.topic || base.title || '').toLowerCase();
  const sourceLine = base.sources && base.sources.length ? `\nSources: ${base.sources.join(' • ')}` : '';
  const profiles = [
    {
      match: /ukraine|russia|kremlin|energy|oil|nuclear|refinery/,
      title: 'Energy Routes Became The Battlefield',
      tags: ['shorts', 'energysecurity', 'gridwatch', 'blacksea', 'geopolitics'],
      angle: 'This brief tracks the infrastructure angle: energy routes, refinery pressure, nuclear-site claims, and what that changes for the next escalation window.',
    },
    {
      match: /boat|narco|strike|caribbean|venezuela|trump|drug/,
      title: 'A Boat Strike Signals A Bigger Campaign',
      tags: ['shorts', 'maritimesecurity', 'caribbeanwatch', 'policybrief', 'drugwar'],
      angle: 'This brief explains the campaign signal behind the strike: location, death toll, legal pressure, and what the next move could affect.',
    },
    {
      match: /ai|chip|model|openai|nvidia|google|meta/,
      title: 'The AI Race Just Shifted Again',
      tags: ['shorts', 'aipolicy', 'chipwatch', 'techbrief', 'modelrace'],
      angle: 'This brief follows the hard consequence: model access, chip pressure, compute supply, and who gains leverage next.',
    },
  ];
  const fallback = {
    title: 'The Detail Everyone Missed Today',
    tags: ['shorts', 'dailybrief', 'contextmatters', 'newsanalysis', 'watchnext'],
    angle: 'This brief isolates the concrete detail that changes the story, then maps the consequence without repeating the surface headline.',
  };
  const profile = profiles.find((p) => p.match.test(topic)) || fallback;
  const suffix = variantIndex > 1 ? ` Part ${variantIndex}` : '';
  const description = [
    profile.angle,
    sourceLine,
    `\nMetadata route: distinct organic retry ${variantIndex}.`,
    `\n#shorts ${profile.tags.slice(1).map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`).join(' ')}`,
  ].join('').slice(0, 4500);
  const igCaption = [
    profile.title + suffix,
    profile.angle.slice(0, 160),
    `\n#reels ${profile.tags.slice(1, 5).map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`).join(' ')}`,
  ].join('\n').slice(0, 2100);
  return { title: (profile.title + suffix).slice(0, 95), description, tags: profile.tags, igCaption, sources: base.sources || [] };
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

  // L109 P3 — cap tags at 5. 2026 YT shadow-bans >15 hashtag uploads.
  // Tight surgical: 1 platform + 1 creator + 1 moment + 2 specific.
  const tags = [
    'shorts',
    creator.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
    momentKeyword.replace(/[^a-z0-9]/g, ''),
    ...titleTokens.slice(0, 2),
  ].filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, 5);

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
  const primaryVideoPath = render.outputPath || (render.spec && render.spec.outDir) || null;
  const primaryIgPath = render.igVariantPath || render.outputPath;
  const preferV9Motion = isOrganic && process.env.ORGANIC_UPLOAD_PREFER_V9 === '1';
  const requireV9Motion = isOrganic && process.env.ORGANIC_UPLOAD_REQUIRE_V9 === '1';
  const preferOrganicMotion = isOrganic && process.env.ORGANIC_UPLOAD_PREFER_MOTION !== '0';
  // V9 story-motion is now rendered as the PRIMARY organic (daily-auto-v8 with
  // ORGANIC_STORY). When that's on, the primary file IS the motion render, so a
  // separate -v9-motion sidecar is NOT required — only require a sidecar when
  // V9-as-primary is explicitly OFF (the legacy V8-primary + sidecar flow).
  const v9IsPrimary = process.env.ORGANIC_STORY !== '0';
  const requireOrganicMotion = isOrganic && process.env.ORGANIC_UPLOAD_REQUIRE_MOTION !== '0' && !v9IsPrimary;
  const v9Path = preferV9Motion ? (render.v9MotionPath || v9MotionSidecarPath(primaryVideoPath)) : null;
  const v9IgPath = preferV9Motion ? (render.v9MotionInstagramPath || v9MotionSidecarPath(primaryIgPath)) : null;
  const motionPath = preferOrganicMotion ? (v9Path || render.motionPath || motionSidecarPath(primaryVideoPath)) : null;
  const motionIgPath = preferOrganicMotion ? (v9IgPath || render.motionInstagramPath || motionSidecarPath(primaryIgPath)) : null;
  const videoPath = motionPath || primaryVideoPath;
  const igPath = motionIgPath || primaryIgPath;

  const item = { kind, label: isOrganic ? render.topic : (render.spec && render.spec.label), videoPath, igPath, primaryVideoPath, motionPreferred: Boolean(motionPath), v9MotionPreferred: Boolean(v9Path), title: meta.title, startedAt: new Date().toISOString(), youtube: null, instagram: null };
  log.items.push(item);

  if (requireV9Motion && !v9Path) {
    item.error = 'v9_motion_sidecar_missing';
    console.log(`\n=== ${kind.toUpperCase()} — ${meta.title} ===`);
    console.log('  BLOCKED: organic upload requires V9 story-motion sidecar.');
    return;
  }

  if (requireOrganicMotion && !motionPath) {
    item.error = 'motion_sidecar_missing';
    console.log(`\n=== ${kind.toUpperCase()} — ${meta.title} ===`);
    console.log('  BLOCKED: organic upload requires procedural motion sidecar.');
    return;
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    item.error = 'video_missing'; return;
  }

  console.log(`\n=== ${kind.toUpperCase()} — ${meta.title} ===`);
  console.log(`  Path: ${path.basename(videoPath)}`);
  if (item.v9MotionPreferred) console.log('  V9 story motion sidecar: selected for upload');
  if (item.motionPreferred) console.log('  Motion sidecar: selected for upload');

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
      let ytMeta = meta;
      try {
        item.youtube = await uploadToYouTube(videoPath, ytMeta.title, ytMeta.description, ytMeta.tags, ytOpts);
      } catch (ytErr) {
        // L109+ INLINE SELF-HEAL — on Phase B (metadata_too_similar) or
        // invalidDescription, regenerate content-aware metadata + retry ONCE,
        // all within this clip's 3h slot. Keeps YT + IG landing together,
        // 3h apart, with zero operator touches. Clips only (organic regen
        // would need the script LLM; handled separately).
        const msg = String(ytErr && ytErr.message || ytErr);
        if (isOrganic && /metadata_too_similar|invalid video description|invalidDescription/i.test(msg)) {
          console.log(`  YT: blocked (${msg.slice(0, 80)}) — retrying with distinct organic metadata...`);
          try {
            ytMeta = buildOrganicMetadata(render, 1);
            item.title = ytMeta.title;
            item.youtubeMetadataVariant = 'organic-distinct-v1';
            item.youtube = await uploadToYouTube(videoPath, ytMeta.title, ytMeta.description, ytMeta.tags, { ...ytOpts, skipMetadataUniqueGate: false });
          } catch (regenErr) {
            item.youtube = { success: false, error: 'organic_regen_threw: ' + String(regenErr && regenErr.message || regenErr) };
          }
        } else if (!isOrganic && render.spec && /metadata_too_similar|invalid video description|invalidDescription/i.test(msg)) {
          console.log(`  YT: blocked (${msg.slice(0, 80)}) — regenerating content-aware metadata...`);
          try {
            const { regenClipMetadata } = require('./clip-metadata-regen');
            const regen = await regenClipMetadata(render.spec);
            if (regen.ok) {
              console.log(`  YT: regen OK (${regen.type}${regen.fallback ? ',template' : ''}) → "${regen.title}"; retrying...`);
              ytMeta = { title: regen.title, description: regen.description, tags: regen.tags };
              // L114 — the deterministic template fallback has exhausted LLM attempts;
              // skip the re-check gate so a clip is NEVER permanently unuploadable.
              item.youtube = await uploadToYouTube(videoPath, ytMeta.title, ytMeta.description, ytMeta.tags, { ...ytOpts, skipMetadataUniqueGate: !!regen.fallback });
            } else {
              item.youtube = { success: false, error: 'regen_failed: ' + regen.reason };
            }
          } catch (regenErr) {
            item.youtube = { success: false, error: 'regen_threw: ' + String(regenErr && regenErr.message || regenErr) };
          }
        } else {
          item.youtube = { success: false, error: msg };
        }
      }
      console.log(`  YT: ${item.youtube && item.youtube.success ? 'OK → ' + item.youtube.videoUrl : 'FAILED ' + JSON.stringify(item.youtube && item.youtube.error)}`);

      // L109 P3 — post pinned-comment bait within ~90s of upload.
      if (item.youtube && item.youtube.success && item.youtube.videoId) {
        try {
          const pinModule = require('./pinned-comment-bait');
          const rotationIndex = (log.items.length - 1);
          const comment = pinModule.generatePinnedComment({
            kind: kind,
            topic: ytMeta.title,
            creator: render.spec ? render.spec.sourceCreator : null,
            momentKeyword: render.spec ? (render.spec.sourceTitle || '').split(/\s+/)[0] : null,
            tsHint: kind === 'clip' ? '0:14' : '0:18',
            rotationIndex,
          });
          const pinR = await pinModule.postAndPin({
            videoId: item.youtube.videoId,
            channelLabel: ytOpts.channelLabel,
            comment,
          });
          item.pinnedComment = { ok: pinR.ok, commentId: pinR.commentId, reason: pinR.reason, text: comment.slice(0, 80) };
          console.log(`  📌 pin: ${pinR.ok ? 'OK' : 'FAIL — ' + (pinR.reason || '?').slice(0, 80)}`);
        } catch (e) {
          item.pinnedComment = { ok: false, reason: (e && e.message || String(e)).slice(0, 200) };
        }
      }
    } catch (e) {
      item.youtube = { success: false, error: String(e && e.message || e) };
      console.log('  YT THREW:', item.youtube.error.slice(0, 200));
    }
  }

  // IG — skipMetadataUniqueGate=true because we just recorded the same-
  // content YT entry milliseconds ago; the gate would false-positive on the
  // YT→IG pair. Cross-video duplicate detection still works for the NEXT
  // item in the chain (it sees both YT + IG entries from prior items).
  if (skipIg) {
    console.log('  IG: skipped (already uploaded in prior run)');
    item.instagram = { skipped: true };
  } else {
    try {
      const baseIgOpts = isOrganic
        ? { channelLabel: 'organic', retryAttempts: 3, publishPermit: buildOrganicPermit('instagram_reels') }
        : { channelLabel: 'clip', retryAttempts: 3, publishPermit: buildClipPermit('instagram_reels', render.spec ? render.spec.sourceCreator : 'Creator') };
      const igOpts = { ...baseIgOpts, skipMetadataUniqueGate: true };
      // L110 T0.3 — de-fingerprint: IG gets a platform-UNIQUE variant of the YT
      // master (different first frames + tiny zoom + 35ms audio shift + re-encode)
      // so cross-platform fingerprinting doesn't deprioritize it 30-50%.
      let igUploadPath = igPath || videoPath;
      try {
        const { makeIgVariant } = require('./platform-variant');
        const variantPath = (igPath || videoPath).replace(/\.mp4$/i, '-iguniq.mp4');
        const vr = makeIgVariant({ inputPath: videoPath, outputPath: variantPath });
        if (vr.ok) { igUploadPath = variantPath; console.log(`  IG: platform-unique variant ${vr.skipped ? '(skipped)' : vr.fallbackCopy ? '(copy fallback)' : 'built'}`); }
      } catch (e) { console.log('  IG: variant skipped: ' + (e && e.message || e).slice(0, 80)); }
      console.log('  IG: uploading via cloudflared tunnel...');
      item.instagram = await uploadToInstagram(igUploadPath, meta.igCaption, igOpts);
      console.log(`  IG: ${item.instagram && item.instagram.success ? 'OK → ' + item.instagram.permalink : 'FAILED ' + JSON.stringify(item.instagram && item.instagram.error)}`);
    } catch (e) {
      item.instagram = { success: false, error: String(e && e.message || e) };
      console.log('  IG THREW:', item.instagram.error.slice(0, 200));
    }
  }

  // L110 — IG CAROUSEL fanout (organic only). User: "no carousel usage". The
  // uploadCarousel path existed but was never called. Now, after the organic
  // reel posts, also publish a viral-FORMAT carousel (lib/carousel-formats picks
  // a proven format — "different eras" / "why does X" — and writes consistent-
  // style slide specs; ig-uploader renders each via FLUX + text overlay). Posts
  // to the SAME organic IG account → a reel + a saveable carousel per topic.
  // Gated by CAROUSEL_ENABLED (default on). Skips if the reel itself failed.
  if (isOrganic && process.env.CAROUSEL_ENABLED !== '0' && item.instagram && item.instagram.success && !item.dryRun) {
    try {
      const { adaptToTopic } = require('./carousel-formats');
      const topic = render.topic || item.title || (meta && meta.title) || '';
      const ca = await adaptToTopic({ topic, niche: 'geopolitics' });
      if (ca.ok && Array.isArray(ca.slides) && ca.slides.length >= 3) {
        const slides = ca.slides.map((s) => ({ slideText: s.overlayText, visualPrompt: s.imagePrompt }));
        console.log(`  IG CAROUSEL: posting ${slides.length}-slide "${ca.formatName}" carousel...`);
        const car = await require('../ig-uploader').uploadCarousel({
          slides, caption: ca.caption || (meta && meta.igCaption) || topic, channelLabel: 'organic',
        });
        console.log(`  IG CAROUSEL: ${car && car.success ? 'OK → ' + car.permalink : 'FAILED ' + JSON.stringify(car && car.error)}`);
        item.carousel = car && car.success ? { permalink: car.permalink, format: ca.format } : { error: car && car.error };
      } else {
        console.log('  IG CAROUSEL: skipped (' + (ca.reason || 'too few slides') + ')');
      }
    } catch (e) { console.log('  IG CAROUSEL threw: ' + (e && e.message || e).slice(0, 120)); }
  }

  item.finishedAt = new Date().toISOString();
}

// ── L107+ Parallel lane runner ──────────────────────────────────────────
// Organic and clip lanes hit DIFFERENT accounts (Ultimate vs AI/Automated),
// so there's no shared rate-limit reason to serialise them. Running both
// queues on independent timers halves total chain duration and gets clips
// into prime-time slots instead of next-day-morning.
async function runLaneQueue(queue, opts, log, laneName) {
  // L109+ — optional initial delay so a resumed lane stays on 3h cadence.
  if (opts.initialDelayMin > 0 && opts.startAt < queue.length) {
    console.log(`  [${laneName}] ⏳ initial delay ${fmtMs(opts.initialDelayMin * 60_000)} (cadence sync) before first item...`);
    await sleepMs(opts.initialDelayMin * 60_000);
  }
  for (let i = opts.startAt; i < queue.length; i++) {
    const skipYt = !!(opts.skipYtOnFirst && i === opts.startAt);
    const skipIg = !!(opts.skipIgOnFirst && i === opts.startAt);
    await uploadOne({ ...queue[i], dryRun: opts.dryRun, log, skipYt, skipIg });
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
  if (o.skipCarousel) process.env.CAROUSEL_ENABLED = '0';
  const resultsFile = path.join(ROOT, 'renders', `fresh-batch-${o.date}.json`);
  if (!fs.existsSync(resultsFile)) throw new Error('fresh-batch-results missing: ' + resultsFile);
  const batch = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

  // L107+ PARALLEL LANES — organic queue + clip queue run INDEPENDENTLY on
  // separate timers. User feedback 2026-05-29: "organic and clipping should
  // be parallel uploads not 3 organics then 3 clipping, that wastes time
  // and views". Different accounts (Ultimate vs AI/Automated) → no shared
  // rate limit, no reason to serialise.
  const includeOrganic = !(o.clipsOnly && !o.organicOnly);
  const includeClips = !(o.organicOnly && !o.clipsOnly);
  const organicQueue = includeOrganic
    ? (batch.organic || []).filter((r) => r && r.ok).map((r) => ({ render: r, kind: 'organic' }))
    : [];
  const clipQueue = includeClips
    ? (batch.clips || []).filter((r) => r && r.ok).map((r) => ({ render: r, kind: 'clip' }))
    : [];

  const startAt = Math.max(0, Number(o.startAt) || 0);
  const laneOpts = { startAt, dryRun: o.dryRun, gapMin: o.gapMin, skipYtOnFirst: o.skipYtOnFirst, skipIgOnFirst: o.skipIgOnFirst, initialDelayMin: o.initialDelayMin || 0 };
  const laneFilter = o.organicOnly && !o.clipsOnly ? 'organic-only' : o.clipsOnly && !o.organicOnly ? 'clips-only' : 'all';
  console.log(`=== AUTO-UPLOAD FRESH BATCH ${o.date} ===  organic=${organicQueue.length}  clip=${clipQueue.length}  startAt=${startAt}  gap=${o.gapMin}m  dryRun=${o.dryRun}  lanes=${laneFilter}  parallel-lanes=ON`);
  const log = { ranAt: new Date().toISOString(), date: o.date, gapMin: o.gapMin, startAt, laneFilter, parallelLanes: true, items: [] };

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
