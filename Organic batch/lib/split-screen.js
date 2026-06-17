/**
 * lib/split-screen.js — V5 Phase 1D
 *
 * Generalized split-screen compositor.
 *   - Top half (1080x960): content video (mograph concat for organics, or
 *     creator clip for clipping lane).
 *   - Bottom half (1080x960): faceless gameplay b-roll, rotated among
 *     subway/gta5/minecraft based on broll-history.json (least-used in
 *     last 7 days wins). Random offset 0-300s into the b-roll file.
 *
 * Captions are burned in via ASS subtitle file passed in opts.captionsAssPath.
 *
 * Output: 1080x1920 30fps h264 yuv420p AAC 192k, target bitrate >= 4 Mbps.
 *
 * Side effect: appends an entry to renders/broll-history.json after each
 * successful render.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BROLL_DIR = path.join(ROOT, 'assets', 'broll');
const HISTORY_PATH = path.join(ROOT, 'renders', 'broll-history.json');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE_BIN = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();

const ALLOWED_BROLL = ['subwaysurfers.mp4', 'gta5.mp4', 'minecraft.mp4'];

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch (_) { return []; }
}
function appendHistory(entry) {
  const arr = readHistory();
  arr.push(entry);
  ensureDir(path.dirname(HISTORY_PATH));
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(arr, null, 2));
}

function probeDuration(p) {
  const r = spawnSync(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8' });
  const v = parseFloat(String(r.stdout || '').trim());
  return Number.isFinite(v) ? v : 0;
}

// ── MASTER-REBUILD Phase 4: A-roll quality fixes ─────────────────────────
// Probe mean luminance (YAVG, 0-255) of an A-roll source so we can pick the
// right enhancement strength. Cheap: samples ~5 seconds, returns the average.
function probeArollYavg(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) return 100;
  const r = spawnSync(FFMPEG, [
    '-v', 'error',
    '-ss', '1', '-i', videoPath,
    '-t', '5',
    '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG',
    '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  const matches = [...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  if (matches.length === 0) return 100;
  const avg = matches.reduce((s, v) => s + v, 0) / matches.length;
  return Math.round(avg);
}

// Pick eq filter parameters based on source luminance — prevents blowing out
// already-bright footage AND rescues dark sources.
function adaptiveEq(yavg) {
  if (yavg < 60)  return 'eq=brightness=0.10:contrast=1.22:saturation=1.15:gamma=0.92';
  if (yavg < 100) return 'eq=brightness=0.06:contrast=1.15:saturation=1.10:gamma=0.95';
  if (yavg < 150) return 'eq=brightness=0.02:contrast=1.08:saturation=1.06';
  return 'eq=contrast=1.05:saturation=1.04';
}

// Probe a source's resolution + bitrate + duration for the quality gate.
function probeSource(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) return null;
  const r = spawnSync(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'stream=width,height,codec_name:format=duration,bit_rate', '-of', 'json', videoPath], { encoding: 'utf8' });
  try {
    const j = JSON.parse(r.stdout);
    const vs = (j.streams || []).find((s) => s.codec_name === 'h264' || s.codec_name === 'h265' || s.codec_name === 'av1' || (s.width && s.height));
    return {
      width: vs ? Number(vs.width) : 0,
      height: vs ? Number(vs.height) : 0,
      durationSec: j.format ? Number(j.format.duration) : 0,
      bitrate: j.format ? Number(j.format.bit_rate) : 0,
    };
  } catch (_) { return null; }
}

/**
 * Source-quality gate per master-rebuild spec. Returns
 *   { ok: true } if source passes
 *   { ok: false, reason } if it fails (too low-res, too dark, too compressed, too short)
 */
function assessSourceQuality(videoPath, options = {}) {
  const minHeight = Number(options.minHeight || 720);
  const minBitrate = Number(options.minBitrate || 800_000);
  const minDurationSec = Number(options.minDurationSec || 60);
  const minRescuableYavg = Number(options.minRescuableYavg || 35);

  const probe = probeSource(videoPath);
  if (!probe) return { ok: false, reason: 'probe_failed' };
  if (probe.height < minHeight) return { ok: false, reason: `low_res_${probe.height}p_min_${minHeight}p`, probe };
  if (probe.bitrate < minBitrate) return { ok: false, reason: `low_bitrate_${Math.round(probe.bitrate / 1000)}kbps_min_${minBitrate / 1000}kbps`, probe };
  if (probe.durationSec < minDurationSec) return { ok: false, reason: `too_short_${probe.durationSec.toFixed(1)}s_min_${minDurationSec}s`, probe };

  const yavg = probeArollYavg(videoPath);
  if (yavg < minRescuableYavg) return { ok: false, reason: `too_dark_yavg_${yavg}_min_${minRescuableYavg}`, probe, yavg };
  return { ok: true, probe, yavg, lightingScore: scoreLighting(yavg) };
}

// Lighting score for candidate ranking — prefer YAVG in the 90-180 range
// (well-exposed). 0-100 score (higher is better).
function scoreLighting(yavg) {
  if (yavg >= 90 && yavg <= 180) return 100;
  if (yavg < 90) return Math.max(0, Math.round(yavg / 90 * 100));
  return Math.max(0, Math.round(100 - (yavg - 180) / 75 * 100));
}

/**
 * Pick the b-roll file used least in the last 7 days.
 */
function pickBroll() {
  const history = readHistory();
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = history.filter((h) => new Date(h.usedAt || 0).getTime() >= sevenDaysAgo);
  const counts = Object.fromEntries(ALLOWED_BROLL.map((f) => [f, 0]));
  for (const h of recent) if (counts[h.file] !== undefined) counts[h.file]++;
  // Pick min count; tie-break by alphabetical for determinism.
  const sorted = ALLOWED_BROLL.slice().sort((a, b) => counts[a] - counts[b] || a.localeCompare(b));
  return sorted[0];
}

function pickOffset(brollPath, durationNeeded) {
  const dur = probeDuration(brollPath);
  if (dur <= durationNeeded + 1) return 0;
  return Math.floor(Math.random() * Math.max(1, dur - durationNeeded - 1));
}

/**
 * Compose split-screen output.
 *
 * @param {object} opts
 * @param {string} opts.topVideoPath        — the top-half content (already 1080x960 or any size; will scale)
 * @param {string} opts.audioPath           — the voiceover/clip audio
 * @param {string} opts.outputPath
 * @param {number} opts.durationSec
 * @param {string} [opts.captionsAssPath]   — optional ASS subtitles burn-in
 * @param {string} [opts.brollFile]         — override; otherwise picked by history
 * @returns {Promise<{ok:boolean, outputPath?:string, brollUsed?:string, brollOffset?:number, reason?:string}>}
 */
async function compose(opts) {
  const options = opts || {};
  const topVideoPath = options.topVideoPath;
  const audioPath = options.audioPath;
  const outputPath = options.outputPath;
  const durationSec = Number(options.durationSec || 0);
  // L107+ — mode switch. Defaults to legacy split-screen for back-compat.
  // 'full_frame_horror' = vertical 9:16 center-crop with NO b-roll (horror gameplay).
  const mode = String(options.mode || 'split_screen').toLowerCase();

  if (!topVideoPath || !fs.existsSync(topVideoPath)) return { ok: false, reason: 'top_video_missing' };
  if (!audioPath || !fs.existsSync(audioPath)) return { ok: false, reason: 'audio_missing' };
  if (!outputPath) return { ok: false, reason: 'no_output_path' };
  if (!(durationSec > 0 && durationSec < 60)) return { ok: false, reason: 'invalid_duration' };

  let brollFile = null;
  let brollPath = null;
  let brollOffset = 0;
  if (mode === 'split_screen') {
    brollFile = options.brollFile || pickBroll();
    brollPath = path.join(BROLL_DIR, brollFile);
    if (!fs.existsSync(brollPath)) return { ok: false, reason: `broll_missing: ${brollFile}` };
    brollOffset = pickOffset(brollPath, durationSec);
  }

  ensureDir(path.dirname(outputPath));

  // Build the filter chain. Captions are added with ass=filter if provided.
  const captionsFilter = options.captionsAssPath
    ? `,ass='${path.relative(process.cwd(), options.captionsAssPath).replace(/\\/g, '/')}'`
    : '';

  // L107+ BRAIN-ROT COLOR GRADE — applied at the END of the chain for ALL modes.
  // Saturated + high-contrast + teal-orange split-tone bumps scroll-stop CTR ~15%.
  // (Research source: Agent 3 cheat sheet, Aug 2026 — eq+colorbalance+unsharp recipe.)
  // Disable via SKIP_BRAINROT_GRADE=1 in env when debugging.
  const brainRot = process.env.SKIP_BRAINROT_GRADE === '1'
    ? ''
    : ',eq=contrast=1.12:saturation=1.18:gamma=0.95,colorbalance=rs=-0.10:gs=-0.05:bs=0.15:rh=0.15:gh=0.05:bh=-0.10,unsharp=5:5:0.8:3:3:0.4';

  // ── A-ROLL PERMANENT FIX (MASTER-REBUILD Phase 4) ─────────────────────
  // The top-half A-roll (source creator footage) goes through:
  //   1. Smart framing (scale-to-fit + blurred-fill, no naive crop)
  //   2. Adaptive luminance-aware EQ (lift dark sources, don't blow out bright)
  //   3. Unsharp mask (rescue soft / re-compressed footage)
  // The bottom-half b-roll (gameplay) gets NO processing — it's already clean.
  // ──────────────────────────────────────────────────────────────────────
  const yavg = (options.arollYavg !== undefined) ? Number(options.arollYavg) : probeArollYavg(topVideoPath);
  const eq = adaptiveEq(yavg);
  if (process.env.SPLIT_SCREEN_DEBUG) console.log(`[split-screen] A-roll YAVG=${yavg} → eq="${eq}"`);

  // Pure relative paths to bypass Windows drive-letter colon parsing in ffmpeg.
  const topRel = path.relative(process.cwd(), topVideoPath).replace(/\\/g, '/');
  const audioRel = path.relative(process.cwd(), audioPath).replace(/\\/g, '/');
  const outRel = path.relative(process.cwd(), outputPath).replace(/\\/g, '/');

  let filterComplex;
  let args;

  if (mode === 'full_frame_horror' || mode === 'full_frame_reframe') {
    // ── FULL-FRAME mode (no b-roll) ─────────────────────────────────────
    // horror = vertical 9:16 center-crop of gameplay.
    // reframe = ACTIVE-SPEAKER auto-crop (tools/speaker-reframe.py, OpenCV
    //   Haar face-track → smoothed 9:16 that follows the talker) — for FUNNY
    //   talking podcasts (Theo Von / Kill Tony / Kai Cenat). OpusClip-grade.
    // Brain-rot grade + reactive captions over a bottom-25% scrim either way.
    let inputTopRel = topRel;
    let vRawSrc = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v_raw]`;
    if (mode === 'full_frame_reframe' && process.env.CLIP_SPEAKER_REFRAME !== '0') {
      try {
        const py = process.env.PYTHON_BIN || 'D:/python_env/python.exe';
        const rfOut = outputPath.replace(/\.mp4$/i, '-reframed.mp4');
        const rr = spawnSync(py, [path.join(ROOT, 'tools', 'speaker-reframe.py'), topVideoPath, rfOut],
          { env: { ...process.env, FFMPEG }, encoding: 'utf8', timeout: 6 * 60 * 1000, maxBuffer: 50_000_000 });
        if (rr.status === 0 && fs.existsSync(rfOut) && fs.statSync(rfOut).size > 100_000) {
          inputTopRel = path.relative(process.cwd(), rfOut).replace(/\\/g, '/');
          vRawSrc = `[0:v]setsar=1[v_raw]`; // already 1080×1920 speaker-tracked
          if (process.env.SPLIT_SCREEN_DEBUG) console.log('[split-screen] speaker-reframe applied → ' + rfOut);
        } else if (process.env.SPLIT_SCREEN_DEBUG) {
          console.log('[split-screen] speaker-reframe failed (status ' + rr.status + ') → center-crop fallback');
        }
      } catch (e) { if (process.env.SPLIT_SCREEN_DEBUG) console.log('[split-screen] reframe error: ' + (e && e.message)); }
    }
    // L108 P6 — optional datamosh-on-cut for first 1.5s when L108_DATAMOSH=1.
    const datamoshMod = require('./datamosh-filter');
    const datamoshFrag = datamoshMod.buildDatamoshChain({ inputLabel: 'v_pregrade', outputLabel: 'v_postmosh', windowSec: 1.5 });
    const preGradeOut = datamoshFrag ? 'v_postmosh' : 'v_pregrade';
    filterComplex = [
      // 1. 9:16 base — speaker-tracked reframe (if applied) or center-crop.
      vRawSrc,
      // 2. Adaptive EQ + unsharp (horror sources tend to be dark; lift them).
      `[v_raw]${eq},unsharp=5:5:0.8:5:5:0.4[v_pregrade]`,
      // 2b. Datamosh-on-cut window (only first 1.5s, only when L108_DATAMOSH=1)
      ...(datamoshFrag ? [datamoshFrag] : []),
      // 3. Bottom 25% dim scrim so reactive captions read clean.
      `color=c=black@0.40:s=1080x480:d=${durationSec.toFixed(2)}[caption_scrim]`,
      `[${preGradeOut}][caption_scrim]overlay=0:1440[v_scrim]`,
      // 4. Brain-rot color grade + 30fps + captions burn.
      `[v_scrim]fps=30${brainRot}${captionsFilter}[vfinal]`,
    ].join(';');
    args = [
      '-y',
      '-i', inputTopRel,
      '-i', audioRel,
      '-filter_complex', filterComplex,
      '-map', '[vfinal]', '-map', '1:a',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
      '-b:v', '5M', '-minrate', '5M', '-maxrate', '6M', '-bufsize', '10M',
      '-x264-params', 'nal-hrd=cbr',
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-r', '30', '-t', String(durationSec.toFixed(2)),
      outRel,
    ];
  } else {
    // ── SPLIT-SCREEN mode (legacy default) ──────────────────────────────
    const brollRel = path.relative(process.cwd(), brollPath).replace(/\\/g, '/');
    const splitRatio = Number(options.splitRatio || 0.65);
    const topH = Math.round((1920 * splitRatio) / 2) * 2;
    const botH = 1920 - topH;
    
    filterComplex = [
      // A-roll blurred-fill background
      `[0:v]scale=1080:${topH}:force_original_aspect_ratio=increase,crop=1080:${topH},gblur=sigma=22,setsar=1[abg]`,
      // A-roll foreground (full frame visible, no faces cropped)
      `[0:v]scale=1080:${topH}:force_original_aspect_ratio=decrease,setsar=1[afg_raw]`,
      // Apply adaptive EQ + unsharp to the foreground ONLY
      `[afg_raw]${eq},unsharp=5:5:0.7:5:5:0.3[afg]`,
      // Composite foreground over blurred background
      `[abg][afg]overlay=(W-w)/2:(H-h)/2[t]`,
      // B-roll untouched
      `[1:v]scale=1080:${botH}:force_original_aspect_ratio=increase,crop=1080:${botH},setsar=1[b]`,
      `[t][b]vstack=inputs=2[v0]`,
      // Brain-rot grade + captions
      `[v0]fps=30${brainRot}${captionsFilter}[vfinal]`,
    ].join(';');
    args = [
      '-y',
      '-i', topRel,
      '-ss', String(brollOffset), '-i', brollRel,
      '-i', audioRel,
      '-filter_complex', filterComplex,
      '-map', '[vfinal]', '-map', '2:a',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
      '-b:v', '5M', '-minrate', '5M', '-maxrate', '6M', '-bufsize', '10M',
      '-x264-params', 'nal-hrd=cbr',
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-r', '30', '-t', String(durationSec.toFixed(2)),
      outRel,
    ];
  }

  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100_000) {
    return { ok: false, reason: 'ffmpeg_failed', stderr: r.stderr ? r.stderr.slice(-600) : '', brollUsed: brollFile, brollOffset, mode };
  }

  if (mode === 'split_screen') appendHistory({ file: brollFile, offset: brollOffset, usedAt: new Date().toISOString() });
  return { ok: true, outputPath, brollUsed: brollFile, brollOffset, mode };
}

module.exports = {
  compose,
  pickBroll,
  // MASTER-REBUILD Phase 4 exports:
  probeArollYavg,
  adaptiveEq,
  probeSource,
  assessSourceQuality,
  scoreLighting,
  _internals: { probeDuration, pickOffset },
};

if (require.main === module) {
  // Smoke test: no real top/audio paths; just report which b-roll would be picked.
  console.log('would pick broll:', pickBroll());
}
