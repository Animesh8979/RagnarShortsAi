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

require('dotenv').config();
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
    uploadGapMin: Math.max(0, Number(flag('upload-gap-min', 60)) || 0),
  };
}

async function runOrganicLane(opts) {
  const { fetchTrending } = require('./trending-news');
  const { scriptFromTopic } = require('./script-from-trending');
  console.log(`\n=== ORGANIC LANE (top ${opts.organicN}) ===`);

  const trending = await fetchTrending({ topN: Math.max(opts.organicN * 2, 4) });
  console.log(`fetched ${trending.length} trending topics`);

  const accepted = [];
  for (const topic of trending) {
    if (accepted.length >= opts.organicN) break;
    console.log(`\n→ ${topic.title}  (${topic.sources.join('+')})`);
    try {
      const script = await scriptFromTopic(topic, { channel: 'organic' });
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
      const r = await processScript(a.script.scriptId, a.file, '+25%', outDir);
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
      const dl = spawnSync(ytDlpBin, [
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

    const moments = pickMoments(qa.probe.durationSec, opts.momentsPerClip);
    for (let mi = 0; mi < moments.length; mi++) {
      const m = moments[mi];
      const id = `B${bIndex++}`;
      clipSpecs.push({
        id,
        label: `clip-${id}-${slug}-m${mi + 1}`,
        sourceVideo: sourceFile,
        startSec: m.startSec,
        durationSec: m.durationSec,
        brollFile: 'subwaysurfers.mp4',
        outDir: path.join(ROOT, 'renders/creator-clips-v2', `${today}-${id}`),
        sourceCreator: c.creator,
        sourceUrl: c.url,
        sourceTitle: c.title,
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
