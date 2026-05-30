/**
 * lib/seamless-loop.js — L110 T1.2
 *
 * 2026 research: seamless loops are REWARDED (since Mar-2025 every replay
 * counts as a new view, and a clean loop point keeps viewers in the >100%-
 * viewed signal that strongly boosts distribution).
 *
 * True frame-perfect last=first matching only works for content that actually
 * loops; our talking-head/news clips don't. So this does the next-best,
 * robust thing: a short crossfade of the TAIL back toward the HEAD frame +
 * a tiny audio fade, so YT's auto-loop restart reads as a smooth pulse rather
 * than a hard jarring cut. ffmpeg-only, $0, D:\ only.
 *
 * Disable via SKIP_SEAMLESS_LOOP=1.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();

function probeDuration(p) {
  const r = spawnSync(FFMPEG, ['-i', p], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
}

/**
 * Crossfade the tail toward the opening so the loop seam is smooth.
 * @param {object} opts
 * @param {string} opts.inputPath
 * @param {string} opts.outputPath
 * @param {number} [opts.xfadeSec=0.4]
 * @returns {{ok, outputPath?, reason?}}
 */
function applySeamlessLoop(opts) {
  const inputPath = opts && opts.inputPath;
  const outputPath = opts && opts.outputPath;
  if (!inputPath || !fs.existsSync(inputPath)) return { ok: false, reason: 'input_missing' };
  if (!outputPath) return { ok: false, reason: 'no_output' };
  if (process.env.SKIP_SEAMLESS_LOOP === '1') {
    try { fs.copyFileSync(inputPath, outputPath); return { ok: true, outputPath, skipped: true }; } catch (e) { return { ok: false, reason: e.message }; }
  }

  const dur = probeDuration(inputPath);
  if (dur < 3) { try { fs.copyFileSync(inputPath, outputPath); } catch (_) {} return { ok: true, outputPath, reason: 'too_short' }; }
  const xf = Number(opts.xfadeSec || 0.4);
  const offset = Math.max(0.1, dur - xf);

  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch (_) {}

  // Split the video: main stream + a copy of the opening `xf` seconds.
  // xfade(main, head) at offset=(dur-xf) → the last xf seconds dissolve into
  // the opening frames, so the wrap-around restart is smooth. Audio gets a
  // matching afade out at the tail.
  const filter = [
    `[0:v]split=2[v0][v1]`,
    `[v1]trim=0:${xf.toFixed(2)},setpts=PTS-STARTPTS[head]`,
    `[v0][head]xfade=transition=fade:duration=${xf.toFixed(2)}:offset=${offset.toFixed(2)}[vout]`,
    `[0:a]afade=t=out:st=${offset.toFixed(2)}:d=${xf.toFixed(2)}[aout]`,
  ].join(';');

  const r = spawnSync(FFMPEG, [
    '-y', '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    outputPath,
  ], { encoding: 'utf8', timeout: 5 * 60 * 1000 });

  if (r.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100_000) {
    try { fs.copyFileSync(inputPath, outputPath); return { ok: true, outputPath, fallbackCopy: true, reason: (r.stderr || '').slice(-200) }; } catch (e) { return { ok: false, reason: 'ffmpeg_and_copy_failed: ' + e.message }; }
  }
  return { ok: true, outputPath };
}

module.exports = { applySeamlessLoop, probeDuration };

if (require.main === module) {
  require('./env-d-drive-only');
  const inp = process.argv[2];
  const out = process.argv[3] || (inp && inp.replace(/\.mp4$/i, '-loop.mp4'));
  if (!inp) { console.error('Usage: node lib/seamless-loop.js <in.mp4> [out.mp4]'); process.exit(2); }
  const r = applySeamlessLoop({ inputPath: inp, outputPath: out });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
