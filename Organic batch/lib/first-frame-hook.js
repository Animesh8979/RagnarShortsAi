/**
 * lib/first-frame-hook.js — L110 T1.1 (THE #1 growth lever)
 *
 * 2026 research: 85% of Shorts are watched MUTED, and the algorithm decides
 * reach in a 30-60min window primarily by 3-second retention. A first frame
 * that is READABLE WITH SOUND OFF and stops the swipe is the single biggest
 * lever to clear the "80%-viewed" tier (≈10× distribution).
 *
 * This overlays a big, high-contrast, scrim-backed HOOK text over the first
 * ~1.0s of the final video (does NOT prepend — keeps duration + A/V sync).
 * The hook text is a punchy version of the title / clip moment.
 *
 * ffmpeg-only, $0, D:\ only. Disable via SKIP_FIRST_FRAME_HOOK=1.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();

// Escape text for ffmpeg drawtext (colons, quotes, backslashes, %).
function esc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\').replace(/'/g, "’").replace(/:/g, '\\:').replace(/%/g, '\\%')
    .replace(/\[/g, '(').replace(/\]/g, ')');
}

/**
 * Condense a title into a 3-7 word muted-readable hook. Keeps the punchiest
 * fragment (first clause), upper-cased for scroll-stop legibility.
 */
function deriveHookText(title) {
  let t = String(title || '').trim();
  // Drop trailing emoji clutter for the big-text frame (keep ≤1).
  t = t.replace(/\s*#\w+/g, '').trim();
  // First clause before . ! ? — or em-dash.
  const clause = t.split(/[—\-:.!?]/)[0].trim() || t;
  const words = clause.split(/\s+/);
  const hook = words.slice(0, 7).join(' ');
  return hook.toUpperCase().slice(0, 60);
}

/**
 * Overlay a first-frame hook on the first `holdSec` seconds.
 * @param {object} opts
 * @param {string} opts.inputPath
 * @param {string} opts.outputPath
 * @param {string} opts.hookText        raw title/moment (will be condensed)
 * @param {number} [opts.holdSec=1.0]
 * @param {number} [opts.y=520]         upper-third placement
 * @returns {{ok, outputPath?, hook?, reason?}}
 */
function applyFirstFrameHook(opts) {
  const inputPath = opts && opts.inputPath;
  const outputPath = opts && opts.outputPath;
  if (!inputPath || !fs.existsSync(inputPath)) return { ok: false, reason: 'input_missing' };
  if (!outputPath) return { ok: false, reason: 'no_output' };
  if (process.env.SKIP_FIRST_FRAME_HOOK === '1') {
    try { fs.copyFileSync(inputPath, outputPath); return { ok: true, outputPath, skipped: true }; } catch (e) { return { ok: false, reason: e.message }; }
  }
  const holdSec = Number(opts.holdSec || 1.0);
  const y = Number(opts.y || 520);
  const hook = esc(deriveHookText(opts.hookText));
  if (!hook) { try { fs.copyFileSync(inputPath, outputPath); } catch (_) {} return { ok: true, outputPath, reason: 'empty_hook' }; }

  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch (_) {}

  // drawtext: big Anton-ish bold, white, thick black border + dark box scrim,
  // word-wrapped (line_spacing), shown only during the first holdSec seconds,
  // with a quick 0.15s fade-in via alpha. Centered horizontally.
  const draw = [
    `drawtext=text='${hook}'`,
    `fontsize=84`,
    `fontcolor=white`,
    `borderw=6`,
    `bordercolor=black`,
    `box=1`,
    `boxcolor=black@0.55`,
    `boxborderw=28`,
    `x=(w-text_w)/2`,
    `y=${y}`,
    `line_spacing=12`,
    `enable='lt(t,${holdSec.toFixed(2)})'`,
    `alpha='if(lt(t,0.15),t/0.15,1)'`,
  ].join(':');

  const r = spawnSync(FFMPEG, [
    '-y', '-i', inputPath,
    '-vf', draw,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ], { encoding: 'utf8', timeout: 5 * 60 * 1000 });

  if (r.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100_000) {
    try { fs.copyFileSync(inputPath, outputPath); return { ok: true, outputPath, fallbackCopy: true, reason: (r.stderr || '').slice(-200) }; } catch (e) { return { ok: false, reason: 'ffmpeg_and_copy_failed: ' + e.message }; }
  }
  return { ok: true, outputPath, hook: deriveHookText(opts.hookText) };
}

module.exports = { applyFirstFrameHook, deriveHookText };

if (require.main === module) {
  require('./env-d-drive-only');
  const inp = process.argv[2];
  const hookText = process.argv[3] || 'US and Iran very close to a deal — Vance says';
  const out = process.argv[4] || (inp && inp.replace(/\.mp4$/i, '-hooked.mp4'));
  if (!inp) { console.error('Usage: node lib/first-frame-hook.js <in.mp4> "<hook title>" [out.mp4]'); process.exit(2); }
  console.log('hook →', deriveHookText(hookText));
  const r = applyFirstFrameHook({ inputPath: inp, outputPath: out, hookText });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
