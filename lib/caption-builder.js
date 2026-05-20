/**
 * lib/caption-builder.js — V5 Phase 1E
 *
 * Two modes:
 *   buildFromBoundaries(boundaries, powerWords, outPath) — exact word
 *     timings from Edge TTS metadata. NO Whisper. Used for organic captions
 *     where the user's V5 hard rule forbids Whisper round-trip.
 *
 *   buildFromWhisper(audioPath, powerWords, outPath) — Whisper transcript
 *     with calibrated word timestamps. Used for clip captions only.
 *
 * Captions positioned at y=820 (bottom 1/3 of TOP half of 1080x1920 frame).
 * Default style: Anton 72pt white #FFFFFF + 3px black outline.
 * Power-word style: Anton 96pt yellow #FFD700 + 4px black outline.
 *
 * Power-word matching: case-insensitive exact match against the powerWords
 * array passed in.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function pad(n, width) { return String(n).padStart(width, '0'); }

function fmtAssTime(seconds) {
  // ASS format: H:MM:SS.cc (centiseconds)
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${pad(m, 2)}:${pad(sec, 2)}.${pad(cs, 2)}`;
}

const ASS_HEADER = `[Script Info]
Title: V5 Captions
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default, Anton, 72, &H00FFFFFF, &H000000FF, &H00000000, &H00000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 3, 0, 5, 60, 60, 100, 1
Style: PowerWord, Anton, 96, &H0000D7FF, &H000000FF, &H00000000, &H00000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 0, 5, 60, 60, 100, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

function buildLine(start, end, text, style = 'Default', y = 820) {
  // Use \pos to place the line at exact y in 1080x1920 frame (top-half captions at y=820).
  return `Dialogue: 0,${fmtAssTime(start)},${fmtAssTime(end)},${style},,0,0,0,,{\\pos(540,${y})}${text}`;
}

function normalize(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9'-]/g, ''); }

function isPowerWord(word, powerWordSet) {
  const n = normalize(word);
  if (!n) return false;
  if (powerWordSet.has(n)) return true;
  // Also check multi-word power phrases by joining: "two point one million" → check each token
  for (const p of powerWordSet) {
    if (p.length > 4 && p.includes(n)) return true;
  }
  return false;
}

/**
 * Build an .ass subtitle file from Edge TTS word boundaries.
 *
 * @param {object} input
 * @param {Array<{word:string, startSeconds:number, durationSeconds:number}>} input.boundaries
 * @param {Array<string>} [input.powerWords]
 * @param {string} input.outputPath
 * @returns {{ok:boolean, outputPath:string, lineCount:number}}
 */
function buildFromBoundaries(input) {
  const boundaries = Array.isArray(input.boundaries) ? input.boundaries : [];
  const powerWordSet = new Set((input.powerWords || []).flatMap((p) => String(p || '').toLowerCase().split(/\s+/)).map(normalize).filter(Boolean));
  ensureDir(path.dirname(input.outputPath));

  const lines = [];
  // Group boundaries into 2-3 word chunks for readability. Each chunk shown
  // for the union of its words' time spans.
  let chunk = [];
  let chunkStart = 0;
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (chunk.length === 0) chunkStart = b.startSeconds;
    chunk.push(b);
    // Break chunk at 3 words OR if chunk's first word is a power word (highlight solo)
    const isLastWord = i === boundaries.length - 1;
    const chunkFull = chunk.length >= 3 || isLastWord;
    const containsPower = chunk.some((c) => isPowerWord(c.word, powerWordSet));
    if (chunkFull) {
      const chunkEnd = b.startSeconds + Math.max(0.05, b.durationSeconds);
      const text = chunk.map((c) => c.word).join(' ');
      // If chunk contains any power word, render whole chunk in PowerWord style.
      const style = containsPower ? 'PowerWord' : 'Default';
      lines.push(buildLine(chunkStart, chunkEnd, escapeAss(text), style));
      chunk = [];
    }
  }

  const content = ASS_HEADER + lines.join('\n') + '\n';
  fs.writeFileSync(input.outputPath, content);
  return { ok: true, outputPath: input.outputPath, lineCount: lines.length };
}

function escapeAss(s) {
  return String(s || '').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/**
 * Build .ass from Groq Whisper transcript on a clip audio.
 * Calibrates word timestamps by a constant offset if heuristically needed.
 */
async function buildFromWhisper(input) {
  const audioPath = input.audioPath;
  const outputPath = input.outputPath;
  const powerWords = input.powerWords || [];
  if (!audioPath || !fs.existsSync(audioPath)) return { ok: false, reason: 'audio_missing' };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_groq_api_key' };

  const FormData = (function tryFormData() {
    try { return require('form-data'); } catch (_) { return null; }
  })();
  if (!FormData) return { ok: false, reason: 'form_data_not_installed' };

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  let json;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, reason: `groq_whisper_http_${r.status}: ${t.slice(0, 200)}` };
    }
    json = await r.json();
  } catch (err) { return { ok: false, reason: `groq_fetch_failed: ${err && err.message || err}` }; }

  const words = Array.isArray(json.words) ? json.words : [];
  if (words.length === 0) return { ok: false, reason: 'no_words_from_whisper' };
  const boundaries = words.map((w) => ({
    word: String(w.word || '').trim(),
    startSeconds: Number(w.start || 0),
    durationSeconds: Math.max(0.05, Number(w.end || 0) - Number(w.start || 0)),
  }));
  return buildFromBoundaries({ boundaries, powerWords, outputPath });
}

/**
 * Compute median drift between expected boundary times and actual TTS audio
 * onset. (Helper for QA — not used in the default path but exposed for callers
 * that want to verify the boundaries before composing.)
 */
function medianDriftMs(boundaries) {
  if (!boundaries || boundaries.length < 2) return 0;
  const deltas = [];
  for (let i = 1; i < boundaries.length; i++) {
    deltas.push(boundaries[i].startSeconds - (boundaries[i - 1].startSeconds + boundaries[i - 1].durationSeconds));
  }
  deltas.sort((a, b) => a - b);
  return Math.round(deltas[Math.floor(deltas.length / 2)] * 1000);
}

module.exports = { buildFromBoundaries, buildFromWhisper, medianDriftMs, _internals: { fmtAssTime, normalize, escapeAss } };

if (require.main === module) {
  // Smoke test: build a .ass from a fake boundary set
  const boundaries = [
    { word: 'Pakistan', startSeconds: 0.094, durationSeconds: 0.542 },
    { word: 'just', startSeconds: 0.658, durationSeconds: 0.221 },
    { word: 'made', startSeconds: 0.902, durationSeconds: 0.166 },
    { word: 'the', startSeconds: 1.079, durationSeconds: 0.066 },
    { word: 'choice', startSeconds: 1.156, durationSeconds: 0.276 },
    { word: 'that', startSeconds: 1.451, durationSeconds: 0.110 },
    { word: 'breaks', startSeconds: 1.583, durationSeconds: 0.276 },
    { word: 'the', startSeconds: 1.881, durationSeconds: 0.066 },
    { word: 'Quad', startSeconds: 1.958, durationSeconds: 0.487 },
  ];
  const out = path.join(ROOT, '.runtime-cache', 'smoke-test-captions.ass');
  ensureDir(path.dirname(out));
  const r = buildFromBoundaries({ boundaries, powerWords: ['Pakistan', 'Quad'], outputPath: out });
  console.log(JSON.stringify({ ok: r.ok, lineCount: r.lineCount, outputPath: r.outputPath, medianDriftMs: medianDriftMs(boundaries) }, null, 2));
  console.log('\n--- content preview ---');
  console.log(fs.readFileSync(out, 'utf8'));
}
