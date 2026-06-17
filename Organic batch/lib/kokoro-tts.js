/**
 * lib/kokoro-tts.js — L110 T1.4
 *
 * Kokoro-82M TTS (Apache-2.0, commercial-OK) as the primary voice. Runs on
 * CPU via ONNX (`device:"cpu"`) — it does NOT touch the GTX 1650 4GB VRAM at
 * all, so it is safe under the local-GPU ban. Far more natural/energetic than
 * Edge `GuyNeural`, which lifts 3-second retention.
 *
 * Returns the SAME shape as lib/edge-tts-boundary.js so it's a drop-in:
 *   { ok, audioPath, durationSec, wordBoundaries:[{word,startSeconds,durationSeconds}] }
 *
 * Kokoro emits audio but not word timings, so we derive word boundaries by
 * running the generated audio through lib/whisper-realign.js (Groq or, once
 * T3.1 lands, local faster-whisper). This keeps caption sync tight.
 *
 * Model + voices download to D:\ on first run (HF_HOME forced by
 * lib/env-d-drive-only.js). Disable via L110_KOKORO_TTS!=1 (falls back to Edge).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'kokoro');
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}

const MODEL_ID = process.env.KOKORO_MODEL || 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DTYPE = process.env.KOKORO_DTYPE || 'q8';
const VOICE = process.env.KOKORO_VOICE || 'am_adam'; // light energetic male; af_heart for female

let _ttsPromise = null;
function getTTS() {
  if (!_ttsPromise) {
    const { KokoroTTS } = require('kokoro-js');
    _ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, { dtype: DTYPE, device: 'cpu' });
  }
  return _ttsPromise;
}

function probeDuration(p) {
  const r = spawnSync(FFMPEG, ['-i', p], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
}

/**
 * Synthesize text → mp3 + word boundaries. Edge-compatible shape.
 * @param {object} opts { text, voice?, rate? (ignored — kokoro has its own pace) }
 */
async function synthesize(opts) {
  const text = String((opts && opts.text) || '').trim();
  if (!text) return { ok: false, reason: 'empty_text' };
  if (process.env.L110_KOKORO_TTS !== '1') {
    // Not enabled — defer to Edge.
    return require('./edge-tts-boundary').synthesize(opts);
  }

  let wavPath, mp3Path;
  // Callers (daily-auto-v8) pass an EDGE voice name like "en-US-GuyNeural" in
  // opts.voice. Kokoro only accepts its own ids (am_michael, af_heart, ...).
  // Use opts.voice only when it's a valid Kokoro id; otherwise our VOICE.
  const kokoroVoice = (opts.voice && /^[a-z]{2}_[a-z]+$/.test(opts.voice)) ? opts.voice : VOICE;
  try {
    const tts = await getTTS();
    const stamp = Date.now();
    wavPath = path.join(CACHE_DIR, `kokoro-${stamp}.wav`);
    mp3Path = path.join(CACHE_DIR, `kokoro-${stamp}.mp3`);
    // Kokoro ignores Edge's rate string; it has its own `speed` (1.0 = native).
    // User feedback: organics read too fast → default 0.9 (~10% slower, more
    // digestible). Tunable via KOKORO_SPEED.
    const speed = Math.max(0.5, Math.min(1.5, Number(process.env.KOKORO_SPEED || 0.9)));
    const audio = await tts.generate(text, { voice: kokoroVoice, speed });
    await audio.save(wavPath);
    // Convert to 24kHz mono mp3 (matches Edge output expectations downstream).
    const conv = spawnSync(FFMPEG, ['-y', '-i', wavPath, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', mp3Path], { encoding: 'utf8' });
    if (conv.status !== 0 || !fs.existsSync(mp3Path)) {
      return { ok: false, reason: 'kokoro_mp3_convert_failed' };
    }
  } catch (e) {
    // Any failure → fall back to Edge so the batch never stalls.
    console.log('[kokoro] failed (' + String(e && e.message || e).slice(0, 100) + ') — falling back to Edge TTS');
    return require('./edge-tts-boundary').synthesize(opts);
  }

  const durationSec = probeDuration(mp3Path);

  // Word boundaries via whisper-realign on the kokoro audio.
  let wordBoundaries = [];
  try {
    const wr = require('./whisper-realign');
    const r = await wr.realign({ audioPath: mp3Path, edgeBoundaries: [] });
    if (r.ok && Array.isArray(r.wordBoundaries) && r.wordBoundaries.length) {
      wordBoundaries = r.wordBoundaries;
    }
  } catch (_) {}

  if (wordBoundaries.length === 0) {
    // No word timings → captions would be empty; fall back to Edge (which
    // gives boundaries natively) rather than ship a caption-less video.
    console.log('[kokoro] no word boundaries from whisper — falling back to Edge TTS');
    return require('./edge-tts-boundary').synthesize(opts);
  }

  try { fs.unlinkSync(wavPath); } catch (_) {}
  return { ok: true, audioPath: mp3Path, durationSec, wordBoundaries, voice: kokoroVoice, engine: 'kokoro-82m' };
}

module.exports = { synthesize, getTTS };

if (require.main === module) {
  require('./env-d-drive-only');
  process.env.L110_KOKORO_TTS = '1';
  const text = process.argv.slice(2).join(' ') || "Okay so — Vance just flew to Doha at 3am. Here's the wild part.";
  console.log('synthesizing via Kokoro (first run downloads model to D:)...');
  synthesize({ text }).then((r) => {
    console.log(JSON.stringify({ ok: r.ok, engine: r.engine, audioPath: r.audioPath, durationSec: r.durationSec, words: (r.wordBoundaries || []).length, sample: (r.wordBoundaries || []).slice(0, 6), reason: r.reason }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
