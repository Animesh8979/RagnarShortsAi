/**
 * lib/scene-detect.js — L110 T4
 * PySceneDetect visual cut detection (CPU/opencv). Returns shot-start
 * timestamps so the moment-selector can seed candidate windows from REAL
 * visual cuts (cleaner than mid-shot audio peaks). $0, D:\, no GPU.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const PY = process.env.PYTHON_EMBED || path.join('D:\\python_env', 'python.exe');
const SCRIPT = path.join(ROOT, 'tools', 'scene_detect.py');

function isAvailable() { return fs.existsSync(PY) && fs.existsSync(SCRIPT); }

/** @returns {{ok, cuts?:number[], reason?}} */
function detectScenes(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) return { ok: false, reason: 'video_missing' };
  if (!isAvailable()) return { ok: false, reason: 'python_unavailable' };
  const env = Object.assign({}, process.env, { VIRTUAL_ENV: '', PYTHONHOME: '', TMP: 'D:\\python_env\\tmp', TEMP: 'D:\\python_env\\tmp' });
  const r = spawnSync(PY, [SCRIPT, videoPath], { encoding: 'utf8', env, timeout: 10 * 60 * 1000, maxBuffer: 50_000_000 });
  try {
    const line = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
    const j = JSON.parse(line);
    return j.ok ? { ok: true, cuts: j.cuts } : { ok: false, reason: j.reason };
  } catch (e) { return { ok: false, reason: 'bad_json: ' + (r.stdout || r.stderr || '').slice(-160) }; }
}

module.exports = { detectScenes, isAvailable };

if (require.main === module) {
  require('./env-d-drive-only');
  const v = process.argv[2];
  if (!v) { console.error('Usage: node lib/scene-detect.js <video.mp4>'); process.exit(2); }
  const r = detectScenes(v);
  console.log(JSON.stringify({ ok: r.ok, cutCount: (r.cuts || []).length, sample: (r.cuts || []).slice(0, 12), reason: r.reason }, null, 2));
  process.exit(r.ok ? 0 : 1);
}
