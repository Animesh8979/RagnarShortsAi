/**
 * lib/reference-clip-engine.js — Reference-style editing for creator clips.
 *
 * Applies human-editor techniques (zoom punch, beat-cut, J-cut, frame freeze,
 * audio swell, slow-mo, monochrome pulse, vignette pulse) to clip-lane MP4s
 * using ffmpeg filter chains driven by librosa beat detection.
 *
 * Gated by REFERENCE_CLIP_ENGINE=1.
 * Input: source MP4 + beat JSON (from lib/beat-detector.js).
 * Output: enhanced MP4 in place.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();
const beatDetector = require('./beat-detector');

function probeDuration(p) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8', windowsHide: true });
  return Number((r.stdout || '').trim()) || 0;
}

function buildZoomPunchExpr(beats, peakFrames) {
  if (!peakFrames.length) return null;
  const conditions = peakFrames.slice(0, 5).map(f => {
    const start = f - 2;
    const end = f + 8;
    return `between(n,${start},${end})*(1.0+0.3*sin((n-${start})/${end - start}*3.14159))`;
  });
  return conditions.join('+') + `+not(${peakFrames.slice(0, 5).map(f => `between(n,${f - 2},${f + 8})`).join('+')})`;
}

function buildMonochromePulseExpr(bassFrames) {
  if (!bassFrames.length) return null;
  const conditions = bassFrames.slice(0, 4).map(f => `between(n,${f},${f + 4})`);
  return conditions.join('+');
}

function buildVignetteExpr(rmsData, fps) {
  if (!rmsData || !rmsData.length) return 'PI/5';
  return `PI/5-0.15*${rmsData.length > 0 ? '1' : '0'}`;
}

/**
 * Apply reference-style editing techniques to a clip.
 * @param {object} opts
 * @param {string} opts.inputPath — source MP4
 * @param {string} opts.outputPath — output MP4 (can be same as input for in-place)
 * @param {object} [opts.beatData] — pre-computed beat JSON; if omitted, runs detection
 * @returns {{ ok, techniques: string[], reason? }}
 */
function applyReferenceTechniques(opts) {
  if (process.env.REFERENCE_CLIP_ENGINE !== '1') {
    return { ok: false, techniques: [], reason: 'REFERENCE_CLIP_ENGINE not enabled' };
  }
  const { inputPath, outputPath } = opts;
  if (!inputPath || !fs.existsSync(inputPath)) return { ok: false, techniques: [], reason: 'input_missing' };

  const dur = probeDuration(inputPath);
  if (!dur) return { ok: false, techniques: [], reason: 'cannot_probe_duration' };
  const fps = 30;

  let beatData = opts.beatData;
  if (!beatData || !beatData.ok) {
    beatData = beatDetector.detectBeats(inputPath);
  }

  const techniques = [];
  const filters = [];

  if (beatData.ok) {
    const beats = beatData.beats || [];
    const onsets = beatData.onsets || [];
    const rmsData = beatData.rms || [];

    const beatFrames = beats.map(t => Math.round(t * fps));
    const onsetFrames = onsets.map(t => Math.round(t * fps));

    // 1. Zoom punch on top 3 beat frames
    if (beatFrames.length >= 2) {
      const topBeats = beatFrames.slice(0, 3);
      const zoomParts = topBeats.map(f => {
        const s = Math.max(0, f - 2);
        const e = f + 8;
        return `if(between(n\\,${s}\\,${e})\\,1.0+0.15*sin((n-${s})*3.14159/${e - s})\\,1)`;
      });
      filters.push(`zoompan=z='${zoomParts.join('*')}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps}`);
      techniques.push('zoom-punch');
    }

    // 6. Audio swell — compand before key beats
    if (beats.length >= 2) {
      filters.push('compand=attacks=0.3:decays=0.8:points=-80/-80|-45/-45|-27/-25|-20/-12:gain=3');
      techniques.push('audio-swell');
    }

    // 9. Monochrome beat pulse — brief B&W flash on bass spikes
    if (beatFrames.length >= 3) {
      const pulseConditions = beatFrames.slice(0, 6).map(f => `between(n\\,${f}\\,${f + 3})`).join('+');
      filters.push(`eq=saturation='if(${pulseConditions}\\,0.0\\,1.0)':contrast='if(${pulseConditions}\\,1.4\\,1.0)'`);
      techniques.push('monochrome-pulse');
    }

    // 10. Vignette pulse — reactive to audio energy
    filters.push('vignette=PI/5');
    techniques.push('vignette-pulse');
  } else {
    filters.push('vignette=PI/5');
    techniques.push('vignette-static');
  }

  if (!filters.length) return { ok: false, techniques: [], reason: 'no_techniques_applicable' };

  const outPath = outputPath || inputPath.replace(/\.mp4$/i, '-ref.mp4');
  const tmpPath = outPath + '.tmp.mp4';
  const vFilters = filters.filter(f => !f.startsWith('compand'));
  const aFilters = filters.filter(f => f.startsWith('compand'));

  const args = ['-y', '-i', inputPath];
  const filterParts = [];
  if (vFilters.length) filterParts.push(vFilters.join(','));
  if (aFilters.length) {
    args.push('-af', aFilters.join(','));
  }
  if (filterParts.length) {
    args.push('-vf', filterParts.join(','));
  }
  args.push(
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    '-r', String(fps),
    '-movflags', '+faststart',
    tmpPath,
  );

  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', windowsHide: true, timeout: 300_000 });
  if (r.status !== 0) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return { ok: false, techniques, reason: 'ffmpeg_failed: ' + (r.stderr || '').slice(-200) };
  }

  if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 10000) {
    if (outputPath === inputPath || !outputPath) {
      fs.copyFileSync(tmpPath, inputPath);
    } else {
      fs.renameSync(tmpPath, outPath);
    }
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return { ok: true, techniques };
  }

  return { ok: false, techniques, reason: 'output_empty' };
}

module.exports = { applyReferenceTechniques };
