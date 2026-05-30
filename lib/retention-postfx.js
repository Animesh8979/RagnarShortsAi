/**
 * lib/retention-postfx.js — L110 T1
 *
 * Shared final-step retention pass applied to BOTH lanes' output MP4s:
 *   1. first-frame muted-readable hook (T1.1) — THE growth lever
 *   2. seamless-loop smoothing (T1.2)
 *
 * Runs in place (writes to a temp then replaces the final). Each sub-step
 * self-falls-back to a copy on failure, so this never breaks a render.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {object} opts
 * @param {string} opts.finalPath   the video to enhance in place
 * @param {string} opts.hookText    title / clip moment for the first-frame hook
 * @returns {{ok, applied:string[], hook?:string}}
 */
function apply(opts) {
  const finalPath = opts && opts.finalPath;
  const hookText = (opts && opts.hookText) || '';
  if (!finalPath || !fs.existsSync(finalPath)) return { ok: false, applied: [], reason: 'final_missing' };
  const applied = [];
  let cur = finalPath;
  let hook;

  // 1. First-frame hook
  try {
    const ffh = require('./first-frame-hook');
    const tmp = finalPath.replace(/\.mp4$/i, '-hook.mp4');
    const r = ffh.applyFirstFrameHook({ inputPath: cur, outputPath: tmp, hookText });
    if (r.ok && !r.skipped && !r.fallbackCopy && fs.existsSync(tmp)) {
      fs.copyFileSync(tmp, finalPath);
      applied.push('first-frame-hook');
      hook = r.hook;
    }
    try { fs.unlinkSync(tmp); } catch (_) {}
  } catch (_) {}

  // 2. Seamless loop
  try {
    const loop = require('./seamless-loop');
    const tmp = finalPath.replace(/\.mp4$/i, '-loop.mp4');
    const r = loop.applySeamlessLoop({ inputPath: finalPath, outputPath: tmp });
    if (r.ok && !r.skipped && !r.fallbackCopy && fs.existsSync(tmp)) {
      fs.copyFileSync(tmp, finalPath);
      applied.push('seamless-loop');
    }
    try { fs.unlinkSync(tmp); } catch (_) {}
  } catch (_) {}

  return { ok: true, applied, hook };
}

module.exports = { apply };
