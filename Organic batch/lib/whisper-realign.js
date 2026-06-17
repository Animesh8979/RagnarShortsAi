/**
 * lib/whisper-realign.js — L108 P1
 *
 * Run Groq whisper-large-v3-turbo on a synthesized TTS audio to produce
 * word-level timestamps that are tighter than Edge TTS' onMetadata word
 * boundaries. The Edge boundaries fire at PHONEME ONSET inside a word —
 * Whisper produces actual word-START times across the full audio. Net
 * difference: ~30-80ms drift per word, which is the gap between "caption
 * shows up while still saying previous word" (Edge) vs "caption snaps in
 * on the consonant of the new word" (Whisper).
 *
 * For caller convenience, returns the SAME shape as edge-tts-boundary.js
 * so daily-auto-v8.js / caption-builder.js can drop it in:
 *   { ok, source, wordBoundaries: [{word, startSeconds, durationSeconds}], drift }
 *
 * drift.medianMs = median of |edgeWord.start - whisperWord.start| in ms.
 * source = 'groq-whisper' on success, falls back caller's edgeBoundaries
 * if Whisper fails (no key, network, etc).
 *
 * No Python install required. Uses existing GROQ_API_KEY.
 */

'use strict';

const fs = require('fs');
const fetch = require('node-fetch');

const DEFAULT_MODEL = 'whisper-large-v3-turbo';
const TIMEOUT_MS = 120_000;

/**
 * @param {object} input
 * @param {string} input.audioPath
 * @param {Array<{word, startSeconds, durationSeconds}>} input.edgeBoundaries  raw Edge TTS boundaries to compare drift against
 * @param {string} [input.model]
 * @returns {Promise<{ok:boolean, source:string, wordBoundaries?:Array, drift?:object, reason?:string}>}
 */
async function realign(input) {
  const audioPath = input && input.audioPath;
  const edgeBoundaries = Array.isArray(input.edgeBoundaries) ? input.edgeBoundaries : [];
  if (!audioPath || !fs.existsSync(audioPath)) {
    return { ok: false, source: 'edge-boundary', reason: 'audio_missing', wordBoundaries: edgeBoundaries };
  }

  // L110 T3.1 — try LOCAL faster-whisper first (CPU, offline, no Groq
  // dependency/timeouts). Falls through to Groq if Python/model unavailable.
  if (process.env.L110_WHISPER_LOCAL === '1') {
    try {
      const local = require('./whisper-local');
      if (local.isAvailable()) {
        const lr = local.transcribe({ audioPath });
        if (lr.ok && lr.wordBoundaries && lr.wordBoundaries.length) {
          const driftMs = [];
          const n = Math.min(edgeBoundaries.length, lr.wordBoundaries.length);
          for (let i = 0; i < n; i++) driftMs.push(Math.abs(lr.wordBoundaries[i].startSeconds - edgeBoundaries[i].startSeconds) * 1000);
          driftMs.sort((a, b) => a - b);
          return {
            ok: true, source: 'whisper-local', wordBoundaries: lr.wordBoundaries,
            drift: { medianMs: driftMs.length ? Math.round(driftMs[Math.floor(driftMs.length / 2)]) : 0, wordsAligned: n, model: lr.model },
          };
        }
      }
    } catch (_) { /* fall through to Groq */ }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, source: 'edge-boundary', reason: 'no_groq_api_key', wordBoundaries: edgeBoundaries };
  }
  const FormData = (function () { try { return require('form-data'); } catch (_) { return null; } })();
  if (!FormData) {
    return { ok: false, source: 'edge-boundary', reason: 'form_data_missing', wordBoundaries: edgeBoundaries };
  }

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model', input.model || DEFAULT_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  let json;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, source: 'edge-boundary', reason: `groq_http_${r.status}: ${t.slice(0, 200)}`, wordBoundaries: edgeBoundaries };
    }
    json = await r.json();
  } catch (err) {
    return { ok: false, source: 'edge-boundary', reason: `groq_fetch_failed: ${err && err.message || err}`, wordBoundaries: edgeBoundaries };
  }

  const words = Array.isArray(json.words) ? json.words : [];
  if (words.length === 0) {
    return { ok: false, source: 'edge-boundary', reason: 'no_words_in_whisper_response', wordBoundaries: edgeBoundaries };
  }

  const whisperBoundaries = words.map((w) => ({
    word: String(w.word || '').trim(),
    startSeconds: Number(w.start || 0),
    durationSeconds: Math.max(0.05, Number(w.end || 0) - Number(w.start || 0)),
  }));

  // Compute drift between Edge boundaries and Whisper boundaries by word index alignment.
  // Where word counts differ (Whisper may merge contractions, Edge may split possessives),
  // we align on min-length and report median.
  const driftMs = [];
  const n = Math.min(edgeBoundaries.length, whisperBoundaries.length);
  for (let i = 0; i < n; i++) {
    driftMs.push(Math.abs(whisperBoundaries[i].startSeconds - edgeBoundaries[i].startSeconds) * 1000);
  }
  driftMs.sort((a, b) => a - b);
  const medianMs = driftMs.length ? Math.round(driftMs[Math.floor(driftMs.length / 2)]) : 0;
  const maxMs = driftMs.length ? Math.round(driftMs[driftMs.length - 1]) : 0;

  return {
    ok: true,
    source: 'groq-whisper',
    wordBoundaries: whisperBoundaries,
    drift: {
      medianMs,
      maxMs,
      wordsAligned: n,
      edgeWordCount: edgeBoundaries.length,
      whisperWordCount: whisperBoundaries.length,
    },
  };
}

module.exports = { realign };

if (require.main === module) {
  require('./env-d-drive-only');
  const path = require('path');
  const audio = process.argv[2];
  if (!audio) { console.error('Usage: node lib/whisper-realign.js <audio.mp3>'); process.exit(2); }
  realign({ audioPath: audio, edgeBoundaries: [] }).then((r) => {
    console.log(JSON.stringify({
      ok: r.ok,
      source: r.source,
      reason: r.reason || null,
      drift: r.drift || null,
      sample: (r.wordBoundaries || []).slice(0, 10),
    }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
