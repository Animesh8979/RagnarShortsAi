/**
 * lib/clip-moment-selector.js — L110 T2.1
 *
 * Upgrade clip moment selection from "loudest audio peak" to "most VIRAL
 * moment" using transcript + LLM scoring (SamurAIGPT-style, adapted). For each
 * candidate window we transcribe the speech (local faster-whisper) and have the
 * LLM score it 0-100 on hook / emotion / quotable / payoff / conflict. We then
 * pick the top-N non-overlapping windows. Audio peaks (lib/peak-detector.js)
 * become the candidate generator + tiebreaker, not the sole signal.
 *
 * $0 (local whisper + Groq/Gemini LLM), D:\ only, CPU. Gated by
 * L110_MOMENT_SELECTOR=1 (else caller uses the existing peak path).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const fetch = require('node-fetch');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();

const ROOT = path.resolve(__dirname, '..');

function extractWindowAudio(sourcePath, startSec, durSec, outPath) {
  const r = spawnSync(FFMPEG, ['-y', '-ss', String(startSec), '-i', sourcePath, '-t', String(durSec), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', outPath], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(outPath);
}

async function scoreWindows(windows) {
  // One LLM call scores all windows. windows: [{i, text}]
  const prompt = `You are a viral-clip judge. Score each numbered transcript window 0-100 for how likely a 28-second Short of it goes viral. Consider: hook strength, emotional spike, a quotable line, a payoff/punchline, conflict/stakes. A flat or context-only window scores low; a window with a punchline / shocking line / big reaction scores high.

WINDOWS:
${windows.map((w) => `[${w.i}] ${String(w.text || '').slice(0, 320)}`).join('\n')}

Return STRICT JSON: { "scores": { "0": 0-100, "1": 0-100, ... } }`;
  // Groq first, Gemini fallback.
  async function groq() {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } }), signal: AbortSignal.timeout(40_000),
    });
    if (!r.ok) throw new Error('groq_' + r.status);
    return (await r.json()).choices[0].message.content;
  }
  async function gemini() {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }), signal: AbortSignal.timeout(40_000) });
    if (!r.ok) throw new Error('gemini_' + r.status);
    return (await r.json()).candidates[0].content.parts[0].text;
  }
  let raw = null;
  for (const fn of [groq, gemini]) { try { raw = await fn(); break; } catch (_) {} }
  if (!raw) return {};
  try { return (JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')).scores) || {}; } catch (_) { return {}; }
}

/**
 * Select the best viral moments from a source.
 * @param {object} opts
 * @param {string} opts.sourcePath
 * @param {Array<{t:number,intensity_db:number}>} [opts.candidates]  from peak-detector; auto-detected if absent
 * @param {number} [opts.windowSec=32]
 * @param {number} [opts.topN=4]
 * @returns {Promise<{ok, moments:[{startSec,durationSec,score,intensity_db,text}], reason?}>}
 */
async function selectMoments(opts) {
  const sourcePath = opts && opts.sourcePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) return { ok: false, reason: 'source_missing' };
  if (process.env.L110_MOMENT_SELECTOR !== '1') return { ok: false, reason: 'disabled' };
  const windowSec = Number(opts.windowSec || 32);
  const topN = Number(opts.topN || 4);

  // 1. Candidate peaks (generator).
  let candidates = opts.candidates;
  if (!candidates) {
    try { candidates = await require('./peak-detector').detectPeaks({ inputPath: sourcePath, maxPeaks: 14 }); }
    catch (_) { candidates = []; }
  }
  if (!candidates || candidates.length < 2) return { ok: false, reason: 'no_candidates' };

  // 2. Transcribe each window (local whisper) → text.
  const local = require('./whisper-local');
  if (!local.isAvailable()) return { ok: false, reason: 'whisper_local_unavailable' };
  const tmpDir = path.join(ROOT, '.runtime-cache', 'moment-select');
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
  const windows = [];
  for (let i = 0; i < candidates.length; i++) {
    const startSec = Math.max(0, candidates[i].t - 6); // start ~6s before the peak
    const wavp = path.join(tmpDir, `w${i}-${Date.now()}.mp3`);
    if (!extractWindowAudio(sourcePath, startSec, windowSec, wavp)) continue;
    const tr = local.transcribe({ audioPath: wavp });
    try { fs.unlinkSync(wavp); } catch (_) {}
    const text = (tr.ok ? tr.wordBoundaries.map((w) => w.word).join(' ') : '').trim();
    windows.push({ i, startSec, intensity_db: candidates[i].intensity_db, text });
  }
  if (windows.length === 0) return { ok: false, reason: 'no_transcribable_windows' };

  // 3. LLM score.
  const scores = await scoreWindows(windows.filter((w) => w.text.length > 8));
  for (const w of windows) {
    const llm = Number(scores[String(w.i)]);
    // Combine LLM score (primary) with audio intensity (tiebreaker, normalized).
    w.score = Number.isFinite(llm) ? llm : 40;
    w.combined = w.score + Math.max(0, (w.intensity_db + 10)) * 0.5; // small loudness nudge
  }

  // 4. Top-N non-overlapping (min 4s apart in source).
  windows.sort((a, b) => b.combined - a.combined);
  const picked = [];
  for (const w of windows) {
    if (picked.length >= topN) break;
    if (picked.some((p) => Math.abs(p.startSec - w.startSec) < windowSec * 0.6)) continue;
    picked.push(w);
  }
  picked.sort((a, b) => a.startSec - b.startSec);

  return {
    ok: true,
    moments: picked.map((w) => ({ startSec: Math.round(w.startSec * 100) / 100, durationSec: windowSec, score: w.score, intensity_db: w.intensity_db, text: w.text.slice(0, 120) })),
  };
}

module.exports = { selectMoments };

if (require.main === module) {
  require('./env-d-drive-only');
  process.env.L110_MOMENT_SELECTOR = '1'; process.env.L110_WHISPER_LOCAL = '1';
  const src = process.argv[2];
  if (!src) { console.error('Usage: node lib/clip-moment-selector.js <source.mp4>'); process.exit(2); }
  selectMoments({ sourcePath: src, topN: 3 }).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
