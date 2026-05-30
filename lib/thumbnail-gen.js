/**
 * lib/thumbnail-gen.js — L110 T4.2
 *
 * Generate a high-CTR cover from a rendered video: pick the best-lit, sharp,
 * non-black candidate frame from the hook region, then overlay a big punchy
 * title with a scrim. Used for the YT channel-grid/shelf cover (Shorts in-feed
 * use the video itself, but the grid cover still affects browse CTR).
 *
 * ffmpeg-only, $0, D:\ only. No GPU. Optional FLUX enhancement is left off by
 * default (text-over-frame is enough + free).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const ROOT = path.resolve(__dirname, '..');

function probeDuration(p) {
  const r = spawnSync(FFMPEG, ['-i', p], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
}

// avg luma of a single frame at time t (0-255). Used to avoid black/blown frames.
function frameBrightness(video, t) {
  const r = spawnSync(FFMPEG, ['-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /YAVG=([\d.]+)/.exec(r.stderr || '');
  return m ? Number(m[1]) : 0;
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, '’').replace(/:/g, '\\:').replace(/%/g, '\\%').replace(/\[/g, '(').replace(/\]/g, ')');
}

/**
 * @param {object} opts { videoPath, outputPath, title, vertical? }
 * @returns {{ok, outputPath?, t?, brightness?, reason?}}
 */
function generateCover(opts) {
  const videoPath = opts && opts.videoPath;
  const outputPath = opts && opts.outputPath;
  if (!videoPath || !fs.existsSync(videoPath)) return { ok: false, reason: 'video_missing' };
  if (!outputPath) return { ok: false, reason: 'no_output' };
  const dur = probeDuration(videoPath);
  if (dur <= 0) return { ok: false, reason: 'bad_duration' };

  // Candidate times across the hook + early body (where the action is).
  const cands = [0.6, 1.2, 2.0, 3.0, 4.5, 6.0].filter((t) => t < dur);
  let best = { t: cands[0] || 1, score: -1 };
  for (const t of cands) {
    const b = frameBrightness(videoPath, t);
    // Prefer well-lit frames (YAVG 70-180); penalize too dark/blown.
    const score = b >= 70 && b <= 185 ? 100 - Math.abs(125 - b) : Math.max(0, 40 - Math.abs(125 - b) / 3);
    if (score > best.score) best = { t, score, brightness: b };
  }

  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch (_) {}

  const W = opts.vertical ? 1080 : 1280;
  const H = opts.vertical ? 1920 : 720;
  const title = esc(String(opts.title || '').toUpperCase().split(/\s+/).slice(0, 7).join(' ').slice(0, 60));
  const draw = title ? `,drawtext=text='${title}':fontsize=${opts.vertical ? 88 : 64}:fontcolor=white:borderw=6:bordercolor=black:box=1:boxcolor=black@0.5:boxborderw=24:x=(w-text_w)/2:y=h*0.66:line_spacing=10` : '';
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=contrast=1.12:saturation=1.18${draw}`;

  const r = spawnSync(FFMPEG, ['-y', '-ss', String(best.t), '-i', videoPath, '-frames:v', '1', '-vf', vf, '-q:v', '2', outputPath], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(outputPath)) {
    return { ok: false, reason: 'ffmpeg_failed: ' + (r.stderr || '').slice(-160) };
  }
  return { ok: true, outputPath, t: best.t, brightness: best.brightness };
}

module.exports = { generateCover };

if (require.main === module) {
  require('./env-d-drive-only');
  const v = process.argv[2];
  const title = process.argv[3] || 'Shane Gillis had Kill Tony in TEARS';
  const out = process.argv[4] || (v && v.replace(/\.mp4$/i, '-cover.jpg'));
  if (!v) { console.error('Usage: node lib/thumbnail-gen.js <video.mp4> "<title>" [out.jpg]'); process.exit(2); }
  const r = generateCover({ videoPath: v, outputPath: out, title, vertical: false });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
