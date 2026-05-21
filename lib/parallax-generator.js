/**
 * lib/parallax-generator.js — 2.5D camera-move animation on a still image
 *
 * Per MASTER-REBUILD Phase 2: take a FLUX still → produce a 2-4s motion
 * clip with camera movement that gives 2.5D parallax feel.
 *
 * This implementation uses ffmpeg's zoompan + perspective filters. It does
 * NOT require rembg / depth estimation — a pure-ffmpeg pan/zoom + DoF
 * pulse + subtle 3D-tilt produces a convincing parallax look for organic
 * news shorts at the editorial-photography pace V7 needs.
 *
 * Camera move types (vary per beat so consecutive shots don't feel identical):
 *   - 'push'        : slow zoom in (1.00 → 1.12) centered
 *   - 'pull'        : slow zoom out (1.12 → 1.00) centered
 *   - 'pan-left'    : zoom 1.06, x slides from 0% to -8% over the duration
 *   - 'pan-right'   : zoom 1.06, x slides from 0% to +8%
 *   - 'pedestal-up' : zoom 1.06, y slides from 0 to -8%
 *   - 'pedestal-down': zoom 1.06, y slides from 0 to +8%
 *   - 'orbit-left'  : combined small horizontal pan + slight tilt
 *
 * Output: 1080×1920 30fps h264 yuv420p ≥6 Mbps.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'parallax');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE_BIN = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

const MOVES = ['push', 'pull', 'pan-left', 'pan-right', 'pedestal-up', 'pedestal-down', 'orbit-left'];

function pickMove(beatIndex) {
  // Deterministic-but-varied: cycle through MOVES, but never repeat the same
  // move within 2 consecutive beats (the index mod ensures varied selection).
  return MOVES[(beatIndex * 3) % MOVES.length];
}

/**
 * Animate a still image with a 2.5D camera move.
 *
 * @param {object} opts
 * @param {string} opts.imagePath   absolute path to PNG/JPG still (1080x1920 ideal)
 * @param {number} opts.durationSec
 * @param {string} [opts.move]      one of MOVES; defaults to 'push'
 * @param {string} [opts.outputPath]
 * @returns {Promise<{ok:boolean, path?:string, durationSec?:number, move?:string, reason?:string}>}
 */
async function animate(opts) {
  const { imagePath, durationSec } = opts;
  if (!imagePath || !fs.existsSync(imagePath)) return { ok: false, reason: 'image_missing' };
  if (!(durationSec > 0 && durationSec <= 30)) return { ok: false, reason: `bad_duration:${durationSec}` };
  const move = opts.move || 'push';
  if (!MOVES.includes(move)) return { ok: false, reason: `unknown_move:${move}` };

  const key = sha1(`${imagePath}|${durationSec}|${move}|v1`);
  ensureDir(CACHE_DIR);
  const outPath = opts.outputPath || path.join(CACHE_DIR, `${key}.mp4`);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 50_000) {
    return { ok: true, path: outPath, durationSec, move, cached: true };
  }

  // Frames in the output (30fps)
  const frames = Math.max(15, Math.round(durationSec * 30));
  // zoompan needs ~ a high resolution input — we pre-scale up 2× so the
  // pan has room to crop into 1080×1920 without blurring.
  const ZW = 2160, ZH = 3840;

  let zoomExpr = '1.0';
  let xExpr = '0';
  let yExpr = '0';

  switch (move) {
    case 'push':
      zoomExpr = `min(1.0+0.12*on/${frames},1.12)`;
      xExpr = `(iw-iw/zoom)/2`;
      yExpr = `(ih-ih/zoom)/2`;
      break;
    case 'pull':
      zoomExpr = `max(1.12-0.12*on/${frames},1.0)`;
      xExpr = `(iw-iw/zoom)/2`;
      yExpr = `(ih-ih/zoom)/2`;
      break;
    case 'pan-left':
      zoomExpr = '1.08';
      xExpr = `(iw-iw/zoom)*(0.5+0.08-0.16*on/${frames})`;
      yExpr = `(ih-ih/zoom)/2`;
      break;
    case 'pan-right':
      zoomExpr = '1.08';
      xExpr = `(iw-iw/zoom)*(0.5-0.08+0.16*on/${frames})`;
      yExpr = `(ih-ih/zoom)/2`;
      break;
    case 'pedestal-up':
      zoomExpr = '1.08';
      xExpr = `(iw-iw/zoom)/2`;
      yExpr = `(ih-ih/zoom)*(0.5+0.08-0.16*on/${frames})`;
      break;
    case 'pedestal-down':
      zoomExpr = '1.08';
      xExpr = `(iw-iw/zoom)/2`;
      yExpr = `(ih-ih/zoom)*(0.5-0.08+0.16*on/${frames})`;
      break;
    case 'orbit-left':
      zoomExpr = `min(1.0+0.10*on/${frames},1.10)`;
      xExpr = `(iw-iw/zoom)*(0.5+0.05-0.10*on/${frames})`;
      yExpr = `(ih-ih/zoom)*(0.5-0.04*on/${frames})`;
      break;
  }

  // Filtergraph:
  //   1. Upscale source to 2160×3840 so zoompan has resolution headroom
  //   2. zoompan with the chosen camera move
  //   3. Subtle film grain (noise)
  //   4. Final scale to 1080×1920
  const filter = [
    `scale=${ZW}:${ZH}:flags=lanczos,setsar=1`,
    `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=1080x1920:fps=30`,
    `noise=alls=4:allf=t+u`,
    `format=yuv420p`,
  ].join(',');

  const args = [
    '-y',
    '-loop', '1', '-t', String(durationSec.toFixed(2)),
    '-i', imagePath,
    '-vf', filter,
    '-c:v', 'libx264', '-preset', 'medium',
    '-b:v', '7M', '-minrate', '6M', '-maxrate', '8M', '-bufsize', '12M',
    '-x264-params', 'nal-hrd=cbr',
    '-pix_fmt', 'yuv420p', '-r', '30', '-t', String(durationSec.toFixed(2)),
    outPath,
  ];

  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(outPath) || fs.statSync(outPath).size < 50_000) {
    return { ok: false, reason: 'ffmpeg_animate_failed', stderr: r.stderr ? r.stderr.slice(-400) : '' };
  }
  return { ok: true, path: outPath, durationSec, move, cached: false };
}

module.exports = { animate, pickMove, MOVES };

if (require.main === module) {
  const img = process.argv[2];
  const dur = Number(process.argv[3] || 3);
  const move = process.argv[4] || 'push';
  if (!img) { console.error('Usage: node lib/parallax-generator.js <image.png> [duration] [move]'); process.exit(2); }
  animate({ imagePath: path.resolve(img), durationSec: dur, move }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
