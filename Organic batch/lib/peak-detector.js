/**
 * lib/peak-detector.js — L109 P1
 *
 * Find audio peak moments in a source VOD so we can CUT ON THE SCREAM, not at
 * fixed timestamps. Top clip channels stitch 8-14 cuts per 28s, each starting
 * on an audio peak (jump scare, scream, "BRO" moment).
 *
 * Method:
 *   1. ffmpeg silencedetect inversion — find loud regions.
 *   2. ffmpeg astats per 0.5s window — confirm peak dB level.
 *   3. Score each candidate by intensity + isolation (peaks not in cluster).
 *   4. Return sorted descending by peak intensity.
 *
 * Pure ffmpeg. $0. D-drive-only. No Python.
 *
 * Exports:
 *   - detectPeaks({ inputPath, thresholdDb, minSilenceSec, minPeakIntervalSec })
 *     → [{ t: 4.32, intensity_db: -2.1, type: 'scream|spike|onset' }]
 *   - pickTopN(peaks, n, isolateSec)
 *     → returns at most n peaks, each separated by ≥ isolateSec
 */

'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();

/**
 * Run ffmpeg silencedetect and return non-silent (loud) ranges.
 */
function findLoudRanges(inputPath, thresholdDb = -25, minSilenceSec = 0.15) {
  const r = spawnSync(FFMPEG, [
    '-hide_banner', '-vn', '-i', inputPath,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=${minSilenceSec}`,
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 100_000_000 });
  const stderr = r.stderr || '';
  const silStarts = [];
  for (const m of stderr.matchAll(/silence_start:\s*([\d.]+)/g)) silStarts.push(Number(m[1]));
  const silEnds = [];
  for (const m of stderr.matchAll(/silence_end:\s*([\d.]+)/g)) silEnds.push(Number(m[1]));
  // Build loud ranges = the gaps BETWEEN silences.
  const loud = [];
  // Before first silence is loud (if first silence_start > 0).
  if (silStarts.length && silStarts[0] > 0.5) loud.push({ start: 0, end: silStarts[0] });
  for (let i = 0; i < silEnds.length; i++) {
    const start = silEnds[i];
    const end = (i + 1 < silStarts.length) ? silStarts[i + 1] : null;
    if (end != null && end - start > 0.3) loud.push({ start, end });
  }
  return loud;
}

/**
 * Run ffmpeg astats with metadata to emit per-window peak dB. Returns
 * [{ pts_time, peak_db }] across the whole file.
 */
function getAstatsPeaks(inputPath, windowSec = 0.5) {
  const r = spawnSync(FFMPEG, [
    '-hide_banner', '-vn', '-i', inputPath,
    '-af', `astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level`,
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 200_000_000 });
  const stderr = r.stderr || '';
  // Output looks like:
  //   frame:NNN pts:NN pts_time:N.NN
  //   lavfi.astats.Overall.Peak_level=-X.XX
  const out = [];
  const lines = stderr.split(/\r?\n/);
  let lastTime = null;
  for (const line of lines) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) { lastTime = Number(t[1]); continue; }
    const p = /lavfi\.astats\.Overall\.Peak_level=([+-]?[\d.]+|-?inf)/.exec(line);
    if (p && lastTime != null) {
      const v = p[1] === '-inf' ? -120 : Number(p[1]);
      if (Number.isFinite(v)) out.push({ pts_time: lastTime, peak_db: v });
    }
  }
  return out;
}

/**
 * Main detector. Returns peaks sorted descending by intensity.
 *
 * @param {object} opts
 * @param {string} opts.inputPath
 * @param {number} [opts.thresholdDb=-25]    silencedetect threshold
 * @param {number} [opts.minSilenceSec=0.15] silencedetect minimum silence
 * @param {number} [opts.minPeakIntervalSec=1.5] minimum gap between picked peaks
 * @param {number} [opts.maxPeaks=24]
 * @returns {Promise<Array<{t, intensity_db, type}>>}
 */
async function detectPeaks(opts) {
  const inputPath = opts && opts.inputPath;
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const thresholdDb = Number(opts.thresholdDb ?? -25);
  const minSilenceSec = Number(opts.minSilenceSec ?? 0.15);
  const minPeakIntervalSec = Number(opts.minPeakIntervalSec ?? 1.5);
  const maxPeaks = Number(opts.maxPeaks ?? 24);

  const loud = findLoudRanges(inputPath, thresholdDb, minSilenceSec);
  // For each loud range, pick the timestamp of MAX peak in that range from astats.
  const astats = getAstatsPeaks(inputPath);
  const peakCandidates = [];
  for (const range of loud) {
    const inRange = astats.filter((s) => s.pts_time >= range.start && s.pts_time <= range.end);
    if (inRange.length === 0) {
      // Fall back to range start with a default intensity
      peakCandidates.push({ t: range.start, intensity_db: -10, type: 'onset' });
      continue;
    }
    const peak = inRange.reduce((acc, s) => (s.peak_db > acc.peak_db ? s : acc), inRange[0]);
    let type = 'spike';
    if (peak.peak_db >= -3) type = 'scream';
    else if (peak.peak_db >= -10) type = 'shout';
    else type = 'onset';
    peakCandidates.push({ t: Math.round(peak.pts_time * 100) / 100, intensity_db: Math.round(peak.peak_db * 10) / 10, type });
  }
  // Sort descending by intensity, then enforce min-interval.
  peakCandidates.sort((a, b) => b.intensity_db - a.intensity_db);
  const picked = [];
  for (const c of peakCandidates) {
    if (picked.length >= maxPeaks) break;
    const tooClose = picked.some((p) => Math.abs(p.t - c.t) < minPeakIntervalSec);
    if (!tooClose) picked.push(c);
  }
  // Sort final result by time (for downstream ordering).
  picked.sort((a, b) => a.t - b.t);
  return picked;
}

/**
 * Pick top-N peaks (by intensity) maintaining min-interval separation.
 * Returns sorted by time.
 */
function pickTopN(peaks, n, isolateSec = 1.5) {
  if (!Array.isArray(peaks) || peaks.length === 0) return [];
  const sorted = peaks.slice().sort((a, b) => b.intensity_db - a.intensity_db);
  const picked = [];
  for (const c of sorted) {
    if (picked.length >= n) break;
    const tooClose = picked.some((p) => Math.abs(p.t - c.t) < isolateSec);
    if (!tooClose) picked.push(c);
  }
  picked.sort((a, b) => a.t - b.t);
  return picked;
}

module.exports = { detectPeaks, pickTopN, findLoudRanges, getAstatsPeaks };

if (require.main === module) {
  require('./env-d-drive-only');
  const input = process.argv[2];
  if (!input) { console.error('Usage: node lib/peak-detector.js <video.mp4>'); process.exit(2); }
  detectPeaks({ inputPath: input, thresholdDb: -25, minSilenceSec: 0.15, minPeakIntervalSec: 1.5, maxPeaks: 24 })
    .then((peaks) => {
      console.log(`detected ${peaks.length} peaks`);
      console.log(JSON.stringify(peaks.slice(0, 20), null, 2));
      const top8 = pickTopN(peaks, 8);
      console.log(`top 8 (well-separated):`, JSON.stringify(top8, null, 2));
      process.exit(0);
    });
}
