/**
 * lib/whisper-local.js — L110 T3.1
 *
 * Local faster-whisper word-level transcription via a Python subprocess
 * (D:\python_env\python.exe + tools/whisper_local.py). CPU INT8 — no GPU,
 * no network at inference (after first model download), no Groq dependency.
 * This kills the chronic Groq-Whisper caption dropouts/timeouts (one of which
 * broke B3's captions earlier today).
 *
 * Returns the same shape as the Groq path so it's a drop-in for
 * lib/whisper-realign.js + lib/caption-builder.js:
 *   { ok, source, wordBoundaries:[{word,startSeconds,durationSeconds}] }
 *
 * Enabled by L110_WHISPER_LOCAL=1. Falls back (caller's responsibility) to
 * Groq if Python/model unavailable.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PY = process.env.PYTHON_EMBED || path.join('D:\\python_env', 'python.exe');
const SCRIPT = path.join(ROOT, 'tools', 'whisper_local.py');

function isAvailable() {
  return fs.existsSync(PY) && fs.existsSync(SCRIPT);
}

/**
 * Transcribe audio → word boundaries via local faster-whisper.
 * @param {object} opts { audioPath, model? }
 * @returns {{ok, source, wordBoundaries?, reason?}}
 */
function transcribe(opts) {
  const audioPath = opts && opts.audioPath;
  if (!audioPath || !fs.existsSync(audioPath)) return { ok: false, source: 'whisper-local', reason: 'audio_missing' };
  if (!isAvailable()) return { ok: false, source: 'whisper-local', reason: 'python_or_script_missing' };

  // Force HF cache + temp to D:\ for the subprocess; clear venv interference.
  const env = Object.assign({}, process.env, {
    VIRTUAL_ENV: '',
    PYTHONHOME: '',
    HF_HOME: process.env.HF_HOME || path.join(ROOT, '.runtime-cache', 'hf'),
    HUGGINGFACE_HUB_CACHE: process.env.HUGGINGFACE_HUB_CACHE || path.join(ROOT, '.runtime-cache', 'hf'),
    TMP: path.join('D:\\python_env', 'tmp'),
    TEMP: path.join('D:\\python_env', 'tmp'),
    WHISPER_MODEL: opts.model || process.env.WHISPER_MODEL || 'small.en',
    HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
    HF_HUB_DISABLE_TELEMETRY: '1',
  });

  const r = spawnSync(PY, [SCRIPT, audioPath], { encoding: 'utf8', env, timeout: 5 * 60 * 1000, maxBuffer: 50_000_000 });
  if (r.status !== 0 && !r.stdout) {
    return { ok: false, source: 'whisper-local', reason: 'subprocess_failed: ' + (r.stderr || '').slice(-200) };
  }
  let parsed;
  try {
    // The JSON is the last line of stdout (model logs may precede).
    const line = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
    parsed = JSON.parse(line);
  } catch (e) {
    return { ok: false, source: 'whisper-local', reason: 'bad_json: ' + (r.stdout || '').slice(-200) };
  }
  if (!parsed.ok || !Array.isArray(parsed.words)) {
    return { ok: false, source: 'whisper-local', reason: parsed.reason || 'no_words' };
  }
  const wordBoundaries = parsed.words.map((w) => ({
    word: w.word,
    startSeconds: Number(w.start) || 0,
    durationSeconds: Math.max(0.05, Number(w.end) - Number(w.start)),
  }));
  return { ok: true, source: 'whisper-local', model: parsed.model, wordBoundaries };
}

module.exports = { transcribe, isAvailable };

if (require.main === module) {
  require('./env-d-drive-only');
  const audio = process.argv[2];
  if (!audio) { console.error('Usage: node lib/whisper-local.js <audio.mp3>'); process.exit(2); }
  console.log('transcribing via local faster-whisper (first run downloads model to D:)...');
  const t0 = Date.now();
  const r = transcribe({ audioPath: audio });
  console.log(JSON.stringify({ ok: r.ok, source: r.source, model: r.model, words: (r.wordBoundaries || []).length, ms: Date.now() - t0, sample: (r.wordBoundaries || []).slice(0, 8), reason: r.reason }, null, 2));
  process.exit(r.ok ? 0 : 1);
}
