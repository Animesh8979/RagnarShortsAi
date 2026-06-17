/**
 * lib/datamosh-filter.js — L108 P6
 *
 * Build an ffmpeg filter-chain fragment that applies a "datamosh"-style
 * RGB-split + motion-blur smear effect at specific timestamps. Replacing
 * teal-orange brain-rot grade as the 2026-Q1 chaos-clip look (per Agent 1
 * research). Gated by env `L108_DATAMOSH=1` and clip lane only.
 *
 * Technique: chromashift (3-frame R/B offset) + tmix=frames=6 (motion blur
 * smear) over a short window around each cut timestamp. Pure ffmpeg —
 * no AI model needed.
 *
 * Example output:
 *   "split=2[main][mosh];[mosh]chromashift=rx=3:bx=-3:ry=0:by=0,tmix=frames=6[moshed];
 *    [main][moshed]overlay=enable='between(t,0,1.5)':x=0:y=0"
 *
 * Exports:
 *   - buildDatamoshChain({ momentTimestamps, durationSec, windowMs })
 *     → string ffmpeg filter fragment (or empty if disabled)
 *
 *   - buildSidechainDuckingChain({ voiceLabel, musicLabel })
 *     → audio filter chain for music ducking under voice
 */

'use strict';

/**
 * Returns a filter fragment that datamosh-effects the first `windowMs` ms
 * of the video. Most useful for clip-lane hook section. If `L108_DATAMOSH`
 * env is not '1', returns empty string (passthrough).
 *
 * Output is meant to be inserted INTO an existing filter chain — caller
 * provides input/output labels via the `inputLabel` / `outputLabel` opts.
 *
 * @param {object} opts
 * @param {string} opts.inputLabel       e.g. 'v_grade' (label of the input video stream)
 * @param {string} opts.outputLabel      e.g. 'v_mosh' (label of the output video stream)
 * @param {number} [opts.windowSec=1.5]  duration of the moshed section (from t=0)
 * @returns {string} filter fragment (may be empty)
 */
function buildDatamoshChain(opts) {
  if (process.env.L108_DATAMOSH !== '1') return '';
  const inputLabel  = String((opts && opts.inputLabel)  || 'v_in').replace(/[\[\]]/g, '');
  const outputLabel = String((opts && opts.outputLabel) || 'v_mosh').replace(/[\[\]]/g, '');
  const windowSec   = Math.max(0.3, Math.min(3.0, Number(opts && opts.windowSec) || 1.5));

  // Branch the input: one untouched (`main`), one moshed.
  // The moshed branch gets:
  //   chromashift  — separate R/B channels by 3-4 px to create the "compression artifact" look
  //   tmix         — average 6 frames so motion smears (the dead-frame look)
  // Overlay the moshed branch over the main only during 0..windowSec.
  return [
    `[${inputLabel}]split=2[${inputLabel}_main][${inputLabel}_to_mosh]`,
    `[${inputLabel}_to_mosh]chromashift=rx=4:bx=-4:ry=0:by=0,tmix=frames=6[${inputLabel}_moshed]`,
    `[${inputLabel}_main][${inputLabel}_moshed]overlay=enable='between(t,0,${windowSec.toFixed(2)})':x=0:y=0[${outputLabel}]`,
  ].join(';');
}

/**
 * Build a sidechain-ducking audio filter chain that attenuates a music bed
 * under a voice track. Replaces static music gain with adaptive ducking.
 *
 * Output is a filter fragment with 2 inputs (voice + music) → 1 output (mixed).
 *
 * @param {object} opts
 * @param {string} opts.voiceLabel  e.g. '0:a' (input voice)
 * @param {string} opts.musicLabel  e.g. '1:a' (input music)
 * @param {string} opts.outLabel    e.g. 'aout' (output label)
 * @returns {string} filter fragment
 */
function buildSidechainDuckingChain(opts) {
  const voiceLabel = String((opts && opts.voiceLabel) || '0:a').replace(/[\[\]]/g, '');
  const musicLabel = String((opts && opts.musicLabel) || '1:a').replace(/[\[\]]/g, '');
  const outLabel   = String((opts && opts.outLabel)   || 'aout').replace(/[\[\]]/g, '');

  // sidechaincompress: threshold=0.02, ratio=10:1, attack=50ms, release=500ms.
  // The music (input 0 of the compressor) gets compressed when the voice
  // (sidechain input 1) exceeds threshold. amix combines voice + ducked music.
  return [
    `[${voiceLabel}]asplit=2[v_main][v_sc]`,
    `[${musicLabel}][v_sc]sidechaincompress=threshold=0.02:ratio=10:attack=50:release=500:makeup=2[m_ducked]`,
    `[v_main][m_ducked]amix=inputs=2:duration=first:dropout_transition=0[${outLabel}]`,
  ].join(';');
}

module.exports = { buildDatamoshChain, buildSidechainDuckingChain };

if (require.main === module) {
  console.log('--- datamosh (L108_DATAMOSH=1) ---');
  process.env.L108_DATAMOSH = '1';
  console.log(buildDatamoshChain({ inputLabel: 'v_grade', outputLabel: 'v_final', windowSec: 1.5 }));
  console.log('\n--- sidechain ducking ---');
  console.log(buildSidechainDuckingChain({ voiceLabel: '0:a', musicLabel: '1:a', outLabel: 'aout' }));
  process.exit(0);
}
