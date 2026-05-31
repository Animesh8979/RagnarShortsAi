/**
 * lib/cut-and-stack.js — L109 P1
 *
 * Given a source VOD + duration target, produce a multi-cut clip with
 * 8-14 cuts (vs current 1), each starting on a detected audio peak, with
 * whoosh SFX on every cut and vine-boom on the top-3 peaks.
 *
 * This is the cheat code Agent 1 flagged: replicates the visual rhythm
 * of every viral clip channel by cutting on action, not at fixed marks.
 *
 * Pipeline:
 *   1. peak-detector.detectPeaks() on source.
 *   2. Pick 8-14 peaks that cover the [0, sourceDur] range with even-ish spacing.
 *   3. For each peak, cut a 2.0-3.5s segment starting at peak - 0.5s.
 *   4. Concat segments via ffmpeg concat filter (NOT demuxer; for SFX overlay).
 *   5. On every cut boundary, layer whoosh SFX (-6dB).
 *   6. On the top-3 highest peaks, layer vine-boom (-3dB).
 *   7. Apply existing brain-rot grade + datamosh + captions on top.
 *
 * Pure ffmpeg. $0. D-drive-only. No Python.
 *
 * Disabled when L109_CUT_ON_PEAK !== '1' — falls through to existing
 * single-shot crop path.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const peakDetector = require('./peak-detector');
const sfxLib = require('./sfx-library');

const ROOT = path.resolve(__dirname, '..');

/**
 * Plan an N-cut composition from a list of peaks + a target duration.
 *
 * Strategy:
 *   - Hook block (0..3s of output): 3 micro-cuts from the top-3 peaks
 *     (climax preview → text-overlay flash → start-of-action)
 *   - Body (3..targetDur-3): 5-9 cuts at mid-intensity peaks, even-spaced
 *   - End block (last 3s): callback / loop frame
 *
 * Returns array of { srcStart, segDur, peakIntensity, gotWhoosh, gotBoom }
 */
function planCuts(peaks, targetDurSec = 28, minCuts = 8, maxCuts = 14) {
  if (!Array.isArray(peaks) || peaks.length === 0) return [];
  // De-dupe and sort by intensity desc
  const byIntensity = peaks.slice().sort((a, b) => b.intensity_db - a.intensity_db);
  const top3 = byIntensity.slice(0, 3);
  const top3Times = new Set(top3.map((p) => p.t));

  // Decide how many cuts. More peaks = more cuts (within range).
  const targetCuts = Math.max(minCuts, Math.min(maxCuts, Math.floor(peaks.length * 0.6)));

  // Pick top N by intensity, then enforce min-spacing between source timestamps.
  const minSrcSpacing = 4.0; // peaks within 4s of each other in source likely overlap reactions
  const picked = [];
  for (const c of byIntensity) {
    if (picked.length >= targetCuts) break;
    const tooClose = picked.some((p) => Math.abs(p.t - c.t) < minSrcSpacing);
    if (!tooClose) picked.push(c);
  }
  picked.sort((a, b) => a.t - b.t);

  // Compute per-segment duration so they sum to targetDur.
  const avgSegDur = targetDurSec / picked.length;
  const cuts = picked.map((p, i) => {
    // Vary the segment duration: hook block tighter, body medium, end tighter.
    let segDur = avgSegDur;
    if (i === 0) segDur = Math.min(2.0, avgSegDur);                  // hook preview tighter
    else if (i === picked.length - 1) segDur = Math.min(2.5, avgSegDur); // end tighter
    else segDur = Math.max(1.5, Math.min(4.0, avgSegDur + (Math.random() - 0.5) * 0.6));
    return {
      srcStart: Math.max(0, p.t - 0.4),  // start 0.4s before peak so impact lands
      segDur: Math.round(segDur * 100) / 100,
      peakIntensity: p.intensity_db,
      gotWhoosh: true,                  // every cut gets whoosh
      gotBoom: top3Times.has(p.t),      // top-3 peaks get vine boom
    };
  });

  // Renormalize segDur so they sum exactly to targetDur.
  const totalDur = cuts.reduce((acc, c) => acc + c.segDur, 0);
  const scale = targetDurSec / totalDur;
  for (const c of cuts) c.segDur = Math.round(c.segDur * scale * 100) / 100;
  return cuts;
}

/**
 * Build the ffmpeg filter chain that cuts + concatenates segments.
 * Input 0 = source video; emits [vstack] + [astack] labels at output.
 */
function buildConcatChain(cuts) {
  // For each segment: trim+setpts, atrim+asetpts. Then concat them.
  const parts = [];
  const vLabels = [];
  const aLabels = [];
  for (let i = 0; i < cuts.length; i++) {
    const c = cuts[i];
    const endSec = c.srcStart + c.segDur;
    parts.push(`[0:v]trim=start=${c.srcStart.toFixed(3)}:end=${endSec.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=start=${c.srcStart.toFixed(3)}:end=${endSec.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    vLabels.push(`[v${i}]`);
    aLabels.push(`[a${i}]`);
  }
  parts.push(`${vLabels.join('')}concat=n=${cuts.length}:v=1:a=0[vstack]`);
  parts.push(`${aLabels.join('')}concat=n=${cuts.length}:v=0:a=1[astack]`);
  return parts.join(';');
}

/**
 * Cut-and-stack a multi-cut clip with SFX overlay.
 *
 * @param {object} opts
 * @param {string} opts.sourcePath           full input video
 * @param {string} opts.outputPath           target output (1080×1920 if mode=full_frame_horror)
 * @param {number} opts.targetDurSec         e.g. 28
 * @param {string} [opts.mode='full_frame_horror']  visual mode (passed to caller's filter chain)
 * @returns {Promise<{ok, outputPath?, cuts?, sfxOverlays?, reason?, peakDetectorMs?, renderMs?}>}
 */
async function cutAndStack(opts) {
  if (process.env.L109_CUT_ON_PEAK !== '1') {
    return { ok: false, reason: 'L109_CUT_ON_PEAK not enabled' };
  }
  const sourcePath = opts && opts.sourcePath;
  const outputPath = opts && opts.outputPath;
  if (!sourcePath || !fs.existsSync(sourcePath)) return { ok: false, reason: 'source_missing' };
  if (!outputPath) return { ok: false, reason: 'no_output_path' };
  const targetDurSec = Number(opts.targetDurSec || 28);

  const t0 = Date.now();
  const peaks = await peakDetector.detectPeaks({
    inputPath: sourcePath,
    thresholdDb: Number(opts.thresholdDb ?? -25),
    minSilenceSec: 0.15,
    minPeakIntervalSec: 1.5,
    maxPeaks: 24,
  });
  const peakMs = Date.now() - t0;
  if (peaks.length < 4) {
    return { ok: false, reason: `only ${peaks.length} peaks found (need ≥4)`, peakDetectorMs: peakMs };
  }

  // Cut density by content type. Horror/chaos (IShowSpeed) wants rapid 8-14
  // cuts; a talking-head PODCAST shredded every 2-3s reads as "badly edited"
  // and cuts mid-joke (user feedback). Podcasts → 4-6 cuts (longer holds, let
  // the punchline land). Tunable via CLIP_MIN_CUTS / CLIP_MAX_CUTS.
  const isChaos = opts.mode === 'full_frame_horror' || opts.isHorror;
  const minCuts = Number(process.env.CLIP_MIN_CUTS || (isChaos ? 8 : 4));
  const maxCuts = Number(process.env.CLIP_MAX_CUTS || (isChaos ? 14 : 6));
  const cuts = planCuts(peaks, targetDurSec, minCuts, maxCuts);
  if (cuts.length < 3) return { ok: false, reason: `only ${cuts.length} cuts planned`, peakDetectorMs: peakMs };

  // SFX overlays. The old code put a whoosh on EVERY cut (~every 3s) which read
  // as constant distracting noise (user: "sound every 5-6s makes my mind go
  // away"). Removed. Now: at most ONE deliberate accent — a single vine-boom on
  // the single loudest peak — and only when L109_SFX_LAYER=1. Quieter (-9dB).
  // SKIP_CLIP_SFX=1 turns it off entirely.
  const overlays = [];
  if (process.env.L109_SFX_LAYER === '1' && process.env.SKIP_CLIP_SFX !== '1' && cuts.length) {
    let bestI = 0, bestDb = -Infinity;
    for (let i = 0; i < cuts.length; i++) {
      if ((cuts[i].peakIntensity ?? -Infinity) > bestDb) { bestDb = cuts[i].peakIntensity; bestI = i; }
    }
    let accT = 0;
    for (let i = 0; i < bestI; i++) accT += cuts[i].segDur;
    overlays.push({ t: accT + 0.05, category: 'vine-boom', gainDb: -9 });
  }
  const sfxResolved = await sfxLib.resolveOverlays(overlays);

  // Build the ffmpeg filter graph:
  //   1. concat the cut segments
  //   2. layer SFX onto astack
  //   3. emit final v + a
  const concat = buildConcatChain(cuts);
  const sfxChain = sfxLib.buildSfxOverlayChain({
    mainAudioLabel: 'astack',
    outLabel: 'aout',
    overlays: sfxResolved.overlays,
    sfxPaths: sfxResolved.sfxPaths,
  });

  const filterComplex = [concat, sfxChain.filter].join(';');

  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch (_) {}
  const args = [
    '-y', '-i', sourcePath,
    ...sfxChain.inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[vstack]', '-map', '[aout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    '-r', '30',
    outputPath,
  ];
  const t1 = Date.now();
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 100_000_000 });
  const renderMs = Date.now() - t1;

  if (r.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100_000) {
    return { ok: false, reason: 'ffmpeg_failed', stderr: (r.stderr || '').slice(-400), peakDetectorMs: peakMs, renderMs };
  }

  return {
    ok: true,
    outputPath,
    cuts,
    sfxOverlays: overlays,
    peakDetectorMs: peakMs,
    renderMs,
  };
}

/**
 * L109+ clip-coherence quality gate. After cut-and-stack renders, measure
 * the output's scene-change count via ffmpeg select='gt(scene,0.3)'. A
 * healthy multi-cut clip has scene_changes roughly in [cuts*0.5, cuts*4].
 *   - too few  → cuts didn't land on real visual change (incoherent / static)
 *   - too many → seizure-grade chaos
 * Returns { ok, sceneChanges, verdict, reason }. Caller falls back to
 * single-shot when verdict==='reject'.
 */
function measureCoherence(outputPath, plannedCuts) {
  if (!fs.existsSync(outputPath)) return { ok: false, verdict: 'reject', reason: 'output_missing' };
  const r = spawnSync(FFMPEG, [
    '-hide_banner', '-i', outputPath,
    '-filter:v', "select='gt(scene,0.3)',showinfo",
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 50_000_000 });
  const sceneChanges = ((r.stderr || '').match(/showinfo.*pts_time/g) || []).length;
  const lo = Math.max(2, Math.floor(plannedCuts * 0.4));
  const hi = plannedCuts * 5;
  let verdict = 'pass';
  let reason = `${sceneChanges} scene-changes in [${lo},${hi}] band for ${plannedCuts} cuts`;
  if (sceneChanges < lo) { verdict = 'reject'; reason = `only ${sceneChanges} scene-changes (need ≥${lo}) — cuts too static/incoherent`; }
  else if (sceneChanges > hi) { verdict = 'flag'; reason = `${sceneChanges} scene-changes (>${hi}) — possibly too chaotic`; }
  return { ok: verdict !== 'reject', sceneChanges, verdict, reason };
}

module.exports = { cutAndStack, planCuts, buildConcatChain, measureCoherence };

if (require.main === module) {
  require('./env-d-drive-only');
  const input = process.argv[2];
  const output = process.argv[3] || (input && input.replace(/\.[^.]+$/, '-cutstack.mp4'));
  if (!input) { console.error('Usage: node lib/cut-and-stack.js <source.mp4> [output.mp4]'); process.exit(2); }
  process.env.L109_CUT_ON_PEAK = '1';
  cutAndStack({ sourcePath: input, outputPath: output, targetDurSec: 28 }).then((r) => {
    console.log(JSON.stringify({ ok: r.ok, outputPath: r.outputPath, cutCount: (r.cuts || []).length, sfxCount: (r.sfxOverlays || []).length, peakDetectorMs: r.peakDetectorMs, renderMs: r.renderMs, reason: r.reason }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
