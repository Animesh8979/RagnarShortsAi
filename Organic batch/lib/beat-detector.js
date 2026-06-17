/**
 * lib/beat-detector.js — Node ↔ Python librosa bridge for onset/beat detection.
 *
 * Calls librosa via subprocess. Results are cached to disk keyed by source file hash
 * to avoid repeated Python overhead. Falls back gracefully if Python/librosa unavailable.
 *
 * Exports:
 *   - detectBeats(audioPath) → { ok, onsets: [sec], beats: [sec], tempo, rms: [{t, v}] }
 *   - detectOnsets(audioPath) → [sec]  (convenience shorthand)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'renders', '.beat-cache');
const PYTHON = process.env.LIBROSA_PY || path.join(ROOT, '.venv', 'Scripts', 'python.exe');

const LIBROSA_SCRIPT = `
import sys, json, os
try:
    import librosa
    import numpy as np
except ImportError:
    print(json.dumps({"ok": False, "reason": "librosa not installed"}))
    sys.exit(0)

audio_path = sys.argv[1]
try:
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time', backtrack=True).tolist()
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.frames_to_time(range(len(rms)), sr=sr).tolist()
    rms_vals = rms.tolist()
    rms_data = [{"t": round(t, 3), "v": round(float(v), 4)} for t, v in zip(rms_times, rms_vals)]
    # Downsample RMS to ~100 points max
    if len(rms_data) > 100:
        step = len(rms_data) // 100
        rms_data = rms_data[::step]
    print(json.dumps({
        "ok": True,
        "duration": round(duration, 3),
        "onsets": [round(o, 3) for o in onsets],
        "beats": [round(b, 3) for b in beats],
        "tempo": round(float(tempo) if hasattr(tempo, '__float__') else float(tempo[0]) if hasattr(tempo, '__getitem__') else 120.0, 1),
        "rms": rms_data
    }))
except Exception as e:
    print(json.dumps({"ok": False, "reason": str(e)[:200]}))
`;

function fileHash(filePath) {
  const h = crypto.createHash('md5');
  const buf = Buffer.alloc(65536);
  const fd = fs.openSync(filePath, 'r');
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const stat = fs.statSync(filePath);
  h.update(buf.subarray(0, n));
  h.update(String(stat.size));
  return h.digest('hex').slice(0, 12);
}

function detectBeats(audioPath) {
  if (!fs.existsSync(audioPath)) return { ok: false, reason: 'file_missing' };

  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}
  const hash = fileHash(audioPath);
  const cacheFile = path.join(CACHE_DIR, hash + '.json');
  if (fs.existsSync(cacheFile)) {
    try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (_) {}
  }

  const pyExe = fs.existsSync(PYTHON) ? PYTHON : 'python';
  const r = spawnSync(pyExe, ['-c', LIBROSA_SCRIPT, audioPath], {
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    maxBuffer: 10_000_000,
  });

  if (r.status !== 0 && r.status !== null) {
    return { ok: false, reason: 'python_error: ' + (r.stderr || '').slice(0, 200) };
  }

  try {
    const result = JSON.parse((r.stdout || '').trim().split('\n').pop());
    if (result.ok) {
      fs.writeFileSync(cacheFile, JSON.stringify(result));
    }
    return result;
  } catch (e) {
    return { ok: false, reason: 'parse_error: ' + (r.stdout || '').slice(0, 100) };
  }
}

function detectOnsets(audioPath) {
  const r = detectBeats(audioPath);
  return r.ok ? r.onsets : [];
}

module.exports = { detectBeats, detectOnsets };
