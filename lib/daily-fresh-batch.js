/**
 * lib/daily-fresh-batch.js — end-to-end fresh-batch orchestrator
 *
 *   ORGANIC LANE (RagnarShortsAi + IG):
 *     1. fetchTrending() — top news topics from RSS
 *     2. For each top-N topic:
 *         a. scriptFromTopic() via provider-router LLM cascade
 *         b. Write `.planning/growth-strategy/daily/{date}/script-{slug}.v8-trimmed.json`
 *         c. Render via daily-auto-v8.processScript()
 *
 *   CLIPPING LANE (RagnarShortsUltimate + IG):
 *     4. discoverHdClips() — viable HD creator videos
 *     5. For each top-M clip source: cut 2-3 best moments → split-screen
 *
 *   STATUS:
 *     6. Write `renders/fresh-batch-{date}.json` with every step's outcome.
 *
 * This is the orchestrator that PRODUCES the renders. It does NOT trigger
 * uploads — uploads are gated by the existing `upload-v8-batch.js` so the
 * user retains the per-step approval step + the 1h-gap pacing.
 *
 * Usage:
 *   node lib/daily-fresh-batch.js --organic 2 --clips 2
 *   node lib/daily-fresh-batch.js --dry-run        # planning only, no renders
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10);
const SCRIPTS_DIR = path.join(ROOT, '.planning', 'growth-strategy', 'daily', today);

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function safeSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

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
    organicN: Math.max(0, Number(flag('organic', 2)) || 0),
    clipsN: Math.max(0, Number(flag('clips', 2)) || 0),
    dryRun: !!flag('dry-run', false),
    momentsPerClip: Math.max(1, Number(flag('moments-per-clip', 2)) || 1),
    autoUpload: !!flag('auto-upload', false),
    uploadGapMin: Math.max(0, Number(flag('upload-gap-min', 240)) || 0),
    // Phase 2.2 — reserve N of the organic slots for community-seeded content
    // (top question-comment from a recent upload). If no qualifying comment
    // found, falls back to a regular trending topic for that slot.
    communityN: Math.max(0, Number(flag('community', 0)) || 0),
  };
}

async function runOrganicLane(opts) {
  const { fetchTrending } = require('./trending-news');
  const { scriptFromTopic } = require('./script-from-trending');
  console.log(`\n=== ORGANIC LANE (top ${opts.organicN}) ===`);

  // Phase 1.1 — rebuild scoring model from latest analytics (cheap, ~50ms;
  // loads youtube-metrics-*.json + computes lowPerformers / contentType
  // boosts that feed into predictPerformance() below).
  let predictPerformance = null;
  try {
    const af = require('../analytics-feedback');
    if (typeof af.buildV99ScoringModel === 'function') af.buildV99ScoringModel();
    if (typeof af.buildFeedbackModel === 'function') af.buildFeedbackModel();
    predictPerformance = af.predictPerformance;
  } catch (e) {
    console.log(`  ⚠  analytics-feedback unavailable: ${(e && e.message || e).slice(0, 120)}`);
  }

  // Phase 2.2 — prepend community-seeded "topics" (questions from comments)
  // to the candidate list. They share the same scriptFromTopic interface.
  let communityTopics = [];
  if (opts.communityN > 0) {
    try {
      const seeder = require('./community-script-seed');
      for (let i = 0; i < opts.communityN; i++) {
        const seed = seeder.pickSeed({ minLikes: 1 });
        if (!seed) break;
        communityTopics.push(seed);
        // Mark immediately so the next pickSeed() in the same loop returns a different one.
        seeder.markUsed(seed, { videoUrl: 'pending-render' });
      }
      console.log(`[community] picked ${communityTopics.length} seeded topic(s) from comment harvest`);
    } catch (e) {
      console.log(`[community] disabled: ${(e && e.message || e).slice(0, 120)}`);
    }
  }

  let trending = await fetchTrending({ topN: Math.max(opts.organicN * 8, 16) });
  console.log(`fetched ${trending.length} trending topics`);

  // L110 T0.1 — HARD GEOPOLITICS NICHE LOCK. RagnarShortsUltimate must stay
  // classifiable as a geopolitics channel (2026 algo seeds by topic identity).
  // Drop any trending topic that doesn't hit >=1 geopolitics keyword (and has
  // no strong reject keyword). Disable via SKIP_NICHE_LOCK=1.
  if (process.env.SKIP_NICHE_LOCK !== '1') {
    try {
      const niche = require(path.join(ROOT, 'config', 'channel-niches.json')).organic;
      const before = trending.length;
      const matched = trending.filter((t) => {
        const blob = `${t.title || ''} ${t.summary || ''}`.toLowerCase();
        const hits = (niche.matchKeywords || []).filter((k) => blob.includes(k)).length;
        const rejects = (niche.rejectKeywords || []).filter((k) => blob.includes(k)).length;
        return hits >= (niche.minKeywordHits || 1) && rejects === 0;
      });
      if (matched.length >= opts.organicN) {
        trending = matched;
        console.log(`[niche-lock] geopolitics: ${matched.length}/${before} topics matched the lock`);
      } else {
        // Not enough on-niche topics today — keep the best-matching ones first,
        // then backfill so the batch still ships (never starve the lane).
        const rest = trending.filter((t) => !matched.includes(t));
        trending = [...matched, ...rest];
        console.log(`[niche-lock] geopolitics: only ${matched.length} on-niche (need ${opts.organicN}); on-niche first, backfilling`);
      }
    } catch (e) {
      console.log(`[niche-lock] skipped: ${(e && e.message || e).slice(0, 100)}`);
    }
  }

  // Phase 1.1 — score each candidate; drop scoring <30 (similar to known
  // low-performers); sort descending so the LLM works on the best-bet first.
  let candidates = trending;
  if (predictPerformance) {
    candidates = trending
      .map((t) => ({ ...t, _predicted: predictPerformance(t.title, 'news_premium') }))
      .filter((t) => {
        if (t._predicted < 30) {
          console.log(`  [pred=${t._predicted}/100] DROP: ${t.title.slice(0, 70)}`);
          return false;
        }
        return true;
      })
      .sort((a, b) => b._predicted - a._predicted);
    console.log(`  ${candidates.length} topics survived predictPerformance gate (min=30)`);
  }

  // Phase 2.2 — community seeds take priority over trending topics. They
  // were already filtered/dedup'd by pickSeed(); skip the predictPerformance
  // gate (community engagement is its own signal).
  if (communityTopics.length > 0) {
    candidates = [...communityTopics, ...candidates];
  }

  const accepted = [];
  for (const topic of candidates) {
    if (accepted.length >= opts.organicN) break;
    const predTag = typeof topic._predicted === 'number' ? ` [pred=${topic._predicted}/100]` : '';
    console.log(`\n→ ${topic.title}${predTag}  (${(topic.sources || []).join('+')})`);
    try {
      // Pass the predicted score into the script LLM via a topic-context hint.
      const enrichedTopic = { ...topic };
      if (typeof topic._predicted === 'number') {
        enrichedTopic.performanceSignal = `Past performance signal: ${topic._predicted}/100 (computed from 14-day YouTube metrics; higher = topic cluster has averaged high AVD on this channel).`;
      }
      const script = await scriptFromTopic(enrichedTopic, { channel: 'organic' });
      // Phase 1.4 — niche-cluster channel routing. If the topic cluster
      // outperforms by ≥30% on a non-default channel, override.
      try {
        const { pickChannel } = require('./channel-cluster-router');
        const route = pickChannel(script.optimized.title || topic.title, 'organic');
        script.routedChannel = route.channel;
        script.routedReason = route.reason;
        if (route.overrideFromDefault) {
          console.log(`  [route override] ${route.channel} (reason=${route.reason}, ratio=${route.ratio?.toFixed?.(2)})`);
        }
      } catch (_) { /* router not loadable — keep default */ }
      // Phase B uniqueness gate — title against last 14 days.
      try {
        const { assertMetadataUnique } = require('./metadata-uniqueness');
        const verdict = assertMetadataUnique({
          title: script.optimized.title,
          description: script.optimized.fullVoiceover,
          tags: script.optimized.powerWords || [],
        });
        if (!verdict.ok) {
          console.log(`  ✗ uniqueness FAIL (${verdict.reason}); skipping`);
          continue;
        }
      } catch (_) {}
      // Persist
      ensureDir(SCRIPTS_DIR);
      const slug = safeSlug(script.optimized.title);
      const file = path.join(SCRIPTS_DIR, `script-${slug}.v8-trimmed.json`);
      fs.writeFileSync(file, JSON.stringify(script, null, 2));
      console.log(`  ✓ ${file}`);
      accepted.push({ topic: topic.title, script, file });
    } catch (e) {
      console.log(`  ✗ script-gen failed: ${(e && e.message || e).slice(0, 200)}`);
    }
  }

  if (opts.dryRun) {
    console.log(`\n[dry-run] would render ${accepted.length} organic videos`);
    return accepted.map((a) => ({ topic: a.topic, file: a.file, rendered: false, dryRun: true }));
  }

  // Render each accepted script via daily-auto-v8.processScript
  const { processScript } = require('./daily-auto-v8');
  const renders = [];
  for (let i = 0; i < accepted.length; i++) {
    const a = accepted[i];
    const outSlug = `${today.replace(/-/g, '')}-organic-${i + 1}`;
    const outDir = path.join(ROOT, 'renders', 'premium-clips-v2', outSlug);
    console.log(`\n→ Rendering organic ${i + 1}: ${a.topic}`);
    try {
      // User feedback: +15% (~140 wpm) read TOO FAST — speech AND captions.
      // Default to +0% (~120 wpm, normal conversational) so captions (which
      // track word boundaries) get wider spacing and stay readable. Tunable
      // via ORGANIC_TTS_RATE (Edge path). Kokoro ignores rate — slowed via
      // KOKORO_SPEED in kokoro-tts.js instead.
      const organicRate = process.env.ORGANIC_TTS_RATE || '+0%';
      const r = await processScript(a.script.scriptId, a.file, organicRate, outDir);
      renders.push({ ...r, topic: a.topic, file: a.file });
      if (r.ok) console.log(`  ✓ ${r.outputPath}`);
      else console.log(`  ✗ ${r.reason}`);
    } catch (e) {
      renders.push({ ok: false, reason: String(e && e.message || e), topic: a.topic });
      console.log(`  ✗ threw: ${(e && e.message || e).slice(0, 200)}`);
    }
  }
  return renders;
}

async function runClipsLane(opts) {
  const { discoverHdClips } = require('./trending-clips');
  console.log(`\n=== CLIPS LANE (top ${opts.clipsN}) ===`);

  const candidates = await discoverHdClips({ perCreator: 6, maxResults: opts.clipsN * 3 });
  console.log(`found ${candidates.length} HD candidates`);
  for (const c of candidates.slice(0, 8)) {
    console.log(`  [${c.bestFormat.height}p ${c.bestFormat.bitrateK}k] ${c.creator} — ${c.title}`);
  }

  if (opts.dryRun) {
    console.log(`\n[dry-run] would download + cut top ${opts.clipsN} sources × ${opts.momentsPerClip} moments`);
    return candidates.slice(0, opts.clipsN).map((c) => ({ candidate: c, dryRun: true }));
  }

  // Download + cut the top N sources via yt-dlp + daily-clip-v8.processClips.
  const { spawnSync } = require('child_process');
  const splitScreen = require('./split-screen');
  const ytDlpBin = path.join(ROOT, 'yt-dlp.exe');
  const downloadsRoot = path.join(ROOT, '.runtime-cache', 'clip-sources');
  ensureDir(downloadsRoot);

  // Build moment-picks per source: spread the picks across the video duration.
  function pickMoments(durationSec, count, segmentLen = 28) {
    const usable = Math.max(60, durationSec - 60);  // skip first/last minute
    const slots = [];
    for (let i = 0; i < count; i++) {
      const t = 60 + Math.round(usable * ((i + 0.5) / count));
      slots.push(t);
    }
    return slots.map((startSec) => ({ startSec, durationSec: segmentLen }));
  }

  const clipSpecs = [];
  let bIndex = 1;
  for (const c of candidates.slice(0, opts.clipsN)) {
    const slug = safeSlug(`${c.creator}-${c.id}`);
    const sourceDir = path.join(downloadsRoot, slug);
    ensureDir(sourceDir);
    const sourceFile = path.join(sourceDir, 'source.mp4');

    if (!fs.existsSync(sourceFile)) {
      console.log(`\n→ Downloading HD source: ${c.creator} — ${c.title}`);
      const ytDlpCache = process.env.YTDLP_CACHE_DIR || path.join(ROOT, '.runtime-cache', 'yt-dlp-cache');
      const dl = spawnSync(ytDlpBin, [
        '--cache-dir', ytDlpCache,   // D:\-only constraint
        '-f', `bestvideo[height>=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height>=720]+bestaudio/best[height>=720]`,
        '--merge-output-format', 'mp4',
        '-o', path.join(sourceDir, 'source.%(ext)s'),
        c.url,
      ], { encoding: 'utf8', timeout: 30 * 60 * 1000 });
      if (dl.status !== 0 || !fs.existsSync(sourceFile)) {
        console.log(`  ✗ download failed (exit ${dl.status}): ${(dl.stderr || '').slice(-200)}`);
        continue;
      }
    }
    const qa = splitScreen.assessSourceQuality(sourceFile);
    if (!qa.ok) {
      console.log(`  ✗ source quality REJECTED: ${qa.reason}`);
      continue;
    }
    console.log(`  ✓ source ${qa.probe.width}x${qa.probe.height} ${Math.round(qa.probe.bitrate/1000)}kbps YAVG=${qa.yavg} lightingScore=${qa.lightingScore}`);

    // L108 P5 — for horror VODs, compress silence + dead air via pure-ffmpeg
    // auto-editor equivalent BEFORE pickMoments. Turns a 90min VOD into ~10min
    // of peak chaos so our cuts are more likely to land on jumpscares.
    let cutSource = sourceFile;
    let cutDurationSec = qa.probe.durationSec;
    if (c.isHorror && process.env.SKIP_AUTO_EDITOR !== '1') {
      try {
        const compressor = require('./auto-editor-compress');
        const compressedPath = path.join(sourceDir, 'source-compressed.mp4');
        if (!fs.existsSync(compressedPath)) {
          console.log(`  → auto-editor compressing horror source (silence ≤-30dB, ≥0.5s)...`);
          const cr = await compressor.compress({ inputPath: sourceFile, outputPath: compressedPath, thresholdDb: -30, minSilenceSec: 0.5, marginSec: 0.4 });
          if (cr.ok && !cr.skipped && cr.compressedDur > 60) {
            console.log(`  ✓ compressed ${cr.sourceDur.toFixed(0)}s → ${cr.compressedDur.toFixed(0)}s (${cr.reductionPct}% reduction, ${cr.keptRanges} kept ranges)`);
            cutSource = compressedPath;
            cutDurationSec = cr.compressedDur;
          } else if (cr.skipped) {
            console.log(`  ✓ source already lean (${cr.keptRanges.length} ranges >80% of dur) — keeping original`);
          } else {
            console.log(`  ⚠ compression failed: ${cr.reason} — keeping original source`);
          }
        } else {
          cutSource = compressedPath;
          cutDurationSec = compressor.probeDuration(compressedPath);
          console.log(`  ✓ using cached compressed source (${cutDurationSec.toFixed(0)}s)`);
        }
      } catch (e) {
        console.log(`  ⚠ auto-editor module error: ${(e && e.message || e).slice(0, 120)} — keeping original`);
      }
    }

    // L110 T2.1 — ML moment selection: score what's SAID (local whisper +
    // LLM virality) instead of just where it's loudest. Falls back to the
    // audio-peak pickMoments on any failure.
    let moments = null;
    if (process.env.L110_MOMENT_SELECTOR === '1') {
      try {
        const sel = require('./clip-moment-selector');
        const r = await sel.selectMoments({ sourcePath: cutSource, topN: opts.momentsPerClip, windowSec: 28 });
        if (r.ok && r.moments && r.moments.length) {
          moments = r.moments.map((m) => ({ startSec: m.startSec, durationSec: Math.min(28, m.durationSec) }));
          console.log(`  🎯 moment-selector picked ${moments.length} viral windows (top score=${Math.max(...r.moments.map((m) => m.score))})`);
        }
      } catch (e) { console.log(`  moment-selector skipped: ${(e && e.message || e).slice(0, 80)}`); }
    }
    if (!moments) moments = pickMoments(cutDurationSec, opts.momentsPerClip);
    for (let mi = 0; mi < moments.length; mi++) {
      const m = moments[mi];
      const id = `B${bIndex++}`;
      // L107+ horror routing — IShowSpeed horror VODs render FULL-FRAME (no
      // b-roll). The mode flag flows to lib/split-screen.js compose().
      const clipMode = c.mode || 'split_screen';
      clipSpecs.push({
        id,
        label: `clip-${id}-${slug}-m${mi + 1}`,
        sourceVideo: cutSource,
        startSec: m.startSec,
        durationSec: m.durationSec,
        brollFile: clipMode === 'split_screen' ? 'subwaysurfers.mp4' : null,
        mode: clipMode,
        outDir: path.join(ROOT, 'renders/creator-clips-v2', `${today}-${id}`),
        sourceCreator: c.creator,
        sourceUrl: c.url,
        sourceTitle: c.title,
        isHorror: !!c.isHorror,
      });
    }
  }

  if (!clipSpecs.length) {
    console.log('No clip specs ready — clips lane produced 0 renders.');
    return [];
  }

  const dailyClip = require('./daily-clip-v8');
  console.log(`\n→ Rendering ${clipSpecs.length} split-screen clips via daily-clip-v8...`);
  const renderResults = await dailyClip.processClips(clipSpecs);
  return renderResults.map((r, i) => ({ ...r, spec: clipSpecs[i] }));
}

async function main() {
  const opts = parseArgs();
  console.log('=== FRESH BATCH ' + today + ' ===  organic=' + opts.organicN + ' clips=' + opts.clipsN + (opts.dryRun ? ' DRY-RUN' : ''));
  ensureDir(path.join(ROOT, 'renders'));

  const organic = await runOrganicLane(opts);
  const clips = await runClipsLane(opts);

  const out = { ranAt: new Date().toISOString(), today, organic, clips };
  const outPath = path.join(ROOT, 'renders', `fresh-batch-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('\n=== RENDER DONE === ' + outPath);
  console.log(`  organic: ${organic.filter((r) => r.ok || r.dryRun).length}/${organic.length} OK`);
  console.log(`  clips staged: ${clips.length}`);

  // Auto-upload chain — fires immediately after the render pass, with a
  // per-item gap (default 60 min) so IG's same-account rate limit + the
  // YouTube algorithm both get a clean signal.
  if (opts.autoUpload && !opts.dryRun) {
    const okOrganic = organic.filter((r) => r.ok).length;
    const okClips = clips.filter((r) => r.ok).length;
    if (okOrganic + okClips === 0) {
      console.log('\n[auto-upload] no successful renders — skipping upload chain');
      return;
    }
    console.log(`\n[auto-upload] firing upload chain: ${okOrganic} organic + ${okClips} clip(s), ${opts.uploadGapMin}m gap`);
    try {
      const uploader = require('./auto-upload-fresh');
      await uploader.run({ date: today, gapMin: opts.uploadGapMin, dryRun: false });
    } catch (e) {
      console.error('[auto-upload] FAILED:', (e && e.message || e).slice(0, 400));
    }
  } else if (opts.autoUpload && opts.dryRun) {
    console.log('\n[auto-upload] dry-run flag set; upload chain skipped');
  } else {
    console.log('\n[auto-upload] disabled. Re-run with --auto-upload to chain uploads, or: node lib/auto-upload-fresh.js');
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
}

module.exports = { main };
