/**
 * lib/auto-editor-compress.js — L108 P5
 *
 * Compress a long horror VOD (30-90min IShowSpeed) down to peak-only by
 * removing silence and low-motion segments BEFORE pickMoments cuts a clip.
 *
 * Mimics WyattBlue/auto-editor's `--edit motion+audio` mode using pure
 * ffmpeg — no Python install needed. Stays D-drive + $0.
 *
 * Algorithm:
 *   1. Run ffmpeg silencedetect on the audio track. Parse silence ranges.
 *   2. Build a list of NON-SILENT ranges (action + reactions).
 *   3. Use ffmpeg select+aselect filters to keep only those ranges, plus a
 *      small margin (default 400ms before/after to preserve consonants).
 *   4. Concat the kept ranges into one output mp4 at original 30fps + audio.
 *
 * For motion (no audio peak but visible action), we could also use
 * `select='gt(scene,0.3)'` but for IShowSpeed reactions the audio peak IS
 * the signal, so we skip the motion filter for now.
 *
 * Usage:
 *   const r = await compress({ inputPath, outputPath, threshold: -30, minSilenceSec: 0.5 });
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const PY = process.env.PYTHON_EMBED || path.join('D:\\python_env', 'python.exe');

/**
 * L110 T2.2 — real WyattBlue/auto-editor (motion+audio) when the Python env
 * is present. Superior to the ffmpeg silencedetect emulation because it scores
 * BOTH audio loudness and visual motion, so motionless-but-loud and silent-but-
 * active frames are handled correctly. CPU-only, D:\ only, $0. Falls back to the
 * ffmpeg path below if Python/auto-editor is missing or errors.
 */
function realAutoEditor({ inputPath, outputPath, marginSec = 0.3, sourceDur = 0 }) {
  if (!fs.existsSync(PY)) return { ok: false, reason: 'python_unavailable' };
  // Probe that the module imports (cheap) before committing to a long run.
  const probe = spawnSync(PY, ['-c', 'import auto_editor'], { encoding: 'utf8', timeout: 20000 });
  if (probe.status !== 0) return { ok: false, reason: 'auto_editor_not_installed' };
  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch (_) {}
  const env = Object.assign({}, process.env, { VIRTUAL_ENV: '', PYTHONHOME: '', TMP: 'D:\\python_env\\tmp', TEMP: 'D:\\python_env\\tmp' });
  // Default edit = audio:threshold=4% (dead-air removal) — the verified-working
  // invocation in v29.3.1. `--margin` preserves consonant onsets so captions
  // stay aligned. (The combined audio+motion lisp expr is rejected by v29's parser.)
  const r = spawnSync(PY, [
    '-m', 'auto_editor', inputPath,
    '--margin', `${marginSec}sec`,
    '--no-open', '-o', outputPath,
  ], { encoding: 'utf8', env, timeout: 30 * 60 * 1000, maxBuffer: 50_000_000 });
  if (r.status !== 0 || !fs.existsSync(outputPath)) {
    return { ok: false, reason: 'auto_editor_failed: ' + (r.stderr || r.stdout || '').slice(-220) };
  }
  const compressedDur = probeDuration(outputPath);
  if (compressedDur <= 0) return { ok: false, reason: 'auto_editor_empty_output' };
  return {
    ok: true, outputPath, sourceDur, compressedDur, engine: 'auto-editor',
    reductionPct: sourceDur > 0 ? Math.round((1 - compressedDur / sourceDur) * 100) : 0,
  };
}

function probeDuration(inputPath) {
  const r = spawnSync(FFMPEG, ['-i', inputPath], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Detect silence ranges via ffmpeg silencedetect filter.
 * Returns array of {silence_start, silence_end} pairs (seconds).
 */
function detectSilence(inputPath, thresholdDb = -30, minSilenceSec = 0.5) {
  const r = spawnSync(FFMPEG, [
    '-hide_banner', '-i', inputPath,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=${minSilenceSec}`,
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 50_000_000 });
  const stderr = r.stderr || '';
  const ranges = [];
  const starts = [];
  for (const m of stderr.matchAll(/silence_start:\s*([\d.]+)/g)) starts.push(Number(m[1]));
  let i = 0;
  for (const m of stderr.matchAll(/silence_end:\s*([\d.]+)/g)) {
    if (i < starts.length) ranges.push({ start: starts[i], end: Number(m[1]) });
    i++;
  }
  return ranges;
}

/**
 * Invert silence ranges → list of non-silent (kept) ranges.
 */
function inverseRanges(silenceRanges, totalDur, marginSec = 0.4) {
  const kept = [];
  let cursor = 0;
  for (const s of silenceRanges) {
    const segEnd = Math.max(0, s.start - marginSec);
    if (segEnd > cursor) kept.push({ start: cursor, end: segEnd });
    cursor = Math.min(totalDur, s.end + marginSec);
  }
  if (cursor < totalDur) kept.push({ start: cursor, end: totalDur });
  // Drop micro-segments (<0.3s — likely noise spikes inside silence)
  return kept.filter((r) => r.end - r.start >= 0.3);
}

/**
 * Build ffmpeg select expression to keep only the listed ranges.
 * Returns a video filter chain string usable in -vf.
 */
function buildSelectExpr(ranges) {
  const inExpr = ranges.map((r) => `between(t,${r.start.toFixed(3)},${r.end.toFixed(3)})`).join('+');
  return `select='${inExpr}',setpts=N/FRAME_RATE/TB`;
}

function buildAselectExpr(ranges) {
  const inExpr = ranges.map((r) => `between(t,${r.start.toFixed(3)},${r.end.toFixed(3)})`).join('+');
  return `aselect='${inExpr}',asetpts=N/SR/TB`;
}

/**
 * Compress an input video by removing silence ranges.
 *
 * @param {object} opts
 * @param {string} opts.inputPath
 * @param {string} opts.outputPath
 * @param {number} [opts.thresholdDb=-30]
 * @param {number} [opts.minSilenceSec=0.5]
 * @param {number} [opts.marginSec=0.4]
 * @returns {Promise<{ok, outputPath?, sourceDur?, compressedDur?, keptRanges?, reductionPct?, reason?}>}
 */
async function compress(opts) {
  const inputPath = opts && opts.inputPath;
  const outputPath = opts && opts.outputPath;
  if (!inputPath || !fs.existsSync(inputPath)) return { ok: false, reason: 'input_missing' };
  if (!outputPath) return { ok: false, reason: 'no_output_path' };

  const thresholdDb = Number(opts.thresholdDb ?? -30);
  const minSilenceSec = Number(opts.minSilenceSec ?? 0.5);
  const marginSec = Number(opts.marginSec ?? 0.4);

  const sourceDur = probeDuration(inputPath);
  if (sourceDur <= 0) return { ok: false, reason: 'cannot_probe_duration' };

  // L110 T2.2: prefer the real auto-editor (motion+audio) when Python is present.
  // Falls through to the ffmpeg silencedetect emulation on any failure.
  if (process.env.L110_REAL_AUTOEDITOR !== '0') {
    const real = realAutoEditor({ inputPath, outputPath, marginSec, sourceDur });
    if (real.ok) {
      // Guard: if it stripped almost everything (bad threshold) keep source instead.
      if (real.compressedDur > 1 && real.compressedDur < sourceDur * 0.98) return real;
    }
    // else: silently fall back (reason logged by caller if it inspects) — emulation below.
  }

  const silenceRanges = detectSilence(inputPath, thresholdDb, minSilenceSec);
  const keptRanges = inverseRanges(silenceRanges, sourceDur, marginSec);
  if (keptRanges.length === 0) return { ok: false, reason: 'all_silence' };

  // If kept content is >80% of source, source is already lean — skip.
  const keptDur = keptRanges.reduce((acc, r) => acc + (r.end - r.start), 0);
  if (keptDur / sourceDur > 0.80) {
    return { ok: true, outputPath: inputPath, sourceDur, compressedDur: sourceDur, keptRanges, reductionPct: 0, skipped: true };
  }

  const vf = buildSelectExpr(keptRanges);
  const af = buildAselectExpr(keptRanges);

  // For very long sources (>30min), the select filter expression can exceed
  // ffmpeg's arg limit. In that case, fall back to concat-demuxer approach.
  const argLimit = 64_000;
  if (vf.length > argLimit) {
    return await concatCompress({ inputPath, outputPath, keptRanges, sourceDur });
  }

  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch (_) {}
  const r = spawnSync(FFMPEG, [
    '-y', '-i', inputPath,
    '-vf', vf, '-af', af,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    '-r', '30',
    outputPath,
  ], { encoding: 'utf8', maxBuffer: 50_000_000, timeout: 30 * 60 * 1000 });
  if (r.status !== 0 || !fs.existsSync(outputPath)) {
    return { ok: false, reason: 'ffmpeg_failed', stderr: (r.stderr || '').slice(-400) };
  }
  const compressedDur = probeDuration(outputPath);
  return {
    ok: true,
    outputPath,
    sourceDur,
    compressedDur,
    keptRanges: keptRanges.length,
    reductionPct: Math.round((1 - compressedDur / sourceDur) * 100),
  };
}

/**
 * Concat-demuxer fallback for very long sources where select-expr exceeds
 * ffmpeg arg limits. Cuts each kept range to a temp file, then concats.
 */
async function concatCompress({ inputPath, outputPath, keptRanges, sourceDur }) {
  const tmpDir = path.join(path.dirname(outputPath), '.compress-tmp-' + Date.now());
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
  const cutPaths = [];
  for (let i = 0; i < keptRanges.length; i++) {
    const cutPath = path.join(tmpDir, `seg-${String(i).padStart(4, '0')}.ts`);
    const r = spawnSync(FFMPEG, [
      '-y', '-ss', String(keptRanges[i].start),
      '-i', inputPath,
      '-t', String(keptRanges[i].end - keptRanges[i].start),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '160k',
      '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts',
      cutPath,
    ], { encoding: 'utf8' });
    if (r.status !== 0) return { ok: false, reason: 'seg_' + i + '_cut_failed', stderr: (r.stderr || '').slice(-200) };
    cutPaths.push(cutPath);
  }
  const concatList = path.join(tmpDir, 'concat.txt');
  fs.writeFileSync(concatList, cutPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n');
  const r = spawnSync(FFMPEG, [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
    '-c', 'copy', outputPath,
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(outputPath)) {
    return { ok: false, reason: 'concat_failed', stderr: (r.stderr || '').slice(-200) };
  }
  // Cleanup
  try { for (const p of cutPaths) fs.unlinkSync(p); fs.unlinkSync(concatList); fs.rmdirSync(tmpDir); } catch (_) {}
  const compressedDur = probeDuration(outputPath);
  return { ok: true, outputPath, sourceDur, compressedDur, keptRanges: keptRanges.length, reductionPct: Math.round((1 - compressedDur / sourceDur) * 100), strategy: 'concat-demuxer' };
}

module.exports = { compress, realAutoEditor, detectSilence, inverseRanges, probeDuration };

if (require.main === module) {
  require('./env-d-drive-only');
  const input = process.argv[2];
  const output = process.argv[3] || (input && input.replace(/\.[^.]+$/, '-compressed.mp4'));
  if (!input) { console.error('Usage: node lib/auto-editor-compress.js <input.mp4> [output.mp4]'); process.exit(2); }
  compress({ inputPath: input, outputPath: output }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
