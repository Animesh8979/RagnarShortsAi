/**
 * lib/retention-postfx.js — L110 T1 + Phase 3 T3
 *
 * Shared final-step retention pass applied to BOTH lanes' output MP4s:
 *   1. first-frame muted-readable hook (T1.1) — THE growth lever
 *   2. seamless-loop smoothing (T1.2)
 *   3. audio ramp + loudness lock (Phase 3 T3) — −28→−12 dB swell in 0-3s,
 *      then −14 LUFS / LRA ≤ 2 for punchy consistent loudness.
 *      Gated by AUDIO_RAMP_ENABLED=1 (auto-enabled for clip lane).
 *
 * Runs in place (writes to a temp then replaces the final). Each sub-step
 * self-falls-back to a copy on failure, so this never breaks a render.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();

/**
 * @param {object} opts
 * @param {string} opts.finalPath      the video to enhance in place
 * @param {string} opts.hookText       title / clip moment for the first-frame hook
 * @param {boolean} [opts.audioRamp]   force audio ramp on; if omitted uses AUDIO_RAMP_ENABLED env
 * @returns {{ok, applied:string[], hook?:string}}
 */
function apply(opts) {
  const finalPath = opts && opts.finalPath;
  const hookText = (opts && opts.hookText) || '';
  if (!finalPath || !fs.existsSync(finalPath)) return { ok: false, applied: [], reason: 'final_missing' };
  const applied = [];
  let hook;

  // 1. First-frame hook
  try {
    const ffh = require('./first-frame-hook');
    const tmp = finalPath.replace(/\.mp4$/i, '-hook.mp4');
    const r = ffh.applyFirstFrameHook({ inputPath: finalPath, outputPath: tmp, hookText });
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

  // 3. Audio ramp + loudness lock (reference-DNA — Phase 3 T3)
  // Swell: quadratic ramp from −28 dBFS → 0 dBFS across 0-2.5s (mimics reference clip).
  // Loudness: loudnorm to −14 LUFS / LRA ≤ 2 / TP ≤ −1 — punchy, platform-perfect.
  // Only fires if the video has an audio stream AND the gate is open.
  const rampEnabled = opts && opts.audioRamp != null
    ? opts.audioRamp
    : (process.env.AUDIO_RAMP_ENABLED === '1');
  if (rampEnabled) {
    try {
      const tmp = finalPath.replace(/\.mp4$/i, '-ramp.mp4');
      // Probe for audio stream first — skip pure-video files
      const probe = spawnSync(FFMPEG, [
        '-i', finalPath, '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-'
      ], { encoding: 'utf8', timeout: 10_000 });
      const hasAudio = probe.status === 0 || (probe.stderr || '').includes('Audio:');
      if (hasAudio) {
        // ramp: pow(t/2.5, 2) gives −∞→0 dBFS quadratic curve (0 at t=0, 1 at t=2.5s)
        // combined with loudnorm for the full clip
        const r = spawnSync(FFMPEG, [
          '-y', '-i', finalPath,
          '-af', "volume='if(lt(t,2.5),pow(t/2.5,2),1)':eval=frame,loudnorm=I=-14:TP=-1:LRA=2",
          '-c:v', 'copy',
          '-c:a', 'aac', '-b:a', '160k',
          '-movflags', '+faststart',
          tmp
        ], { encoding: 'utf8', timeout: 180_000 });
        if (r.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 10000) {
          fs.copyFileSync(tmp, finalPath);
          applied.push('audio-ramp-loudnorm');
        }
        try { fs.unlinkSync(tmp); } catch (_) {}
      }
    } catch (_) {}
  }

  // 4. Reference-style clip editing (gated by REFERENCE_CLIP_ENGINE=1)
  if (process.env.REFERENCE_CLIP_ENGINE === '1') {
    try {
      const { applyReferenceTechniques } = require('./reference-clip-engine');
      const refResult = applyReferenceTechniques({ inputPath: finalPath, outputPath: finalPath });
      if (refResult.ok && refResult.techniques.length) {
        applied.push('reference-style:' + refResult.techniques.join('+'));
      }
    } catch (_) {}
  }

  return { ok: true, applied, hook };
}

module.exports = { apply };
