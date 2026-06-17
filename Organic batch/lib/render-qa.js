/**
 * lib/render-qa.js — L114: Gemini-vision auto-QA gate (the quality "eyes").
 *
 * The pipeline has been blind to its own quality (the "dump" problem). This
 * feeds keyframes of a rendered short to Gemini 2.5 Flash VISION (free API) and
 * gets a ruthless art-director score + specific issues, so the orchestrator can
 * REJECT/RE-ROLL flat amateur renders before they ship. $0 (free Gemini tier),
 * no browser, no account risk. Fail-open (a QA outage never blocks shipping).
 *
 * Usage:
 *   const { qa } = require('./render-qa');
 *   const v = await qa({ videoPath });          // extracts frames + scores
 *   const v = await qa({ imagePaths: [png...] });// score given frames
 *   → { ok, score 0-100, verdict 'pass'|'reject', issues:[], summary }
 *   Gate with RENDER_QA_MIN (default 60). CLI: node lib/render-qa.js <video|image>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const fetch = require('node-fetch');

const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();
const TMP = fs.existsSync('D:/tmp') ? 'D:/tmp' : os.tmpdir();

const PROMPT = `You are a ruthless short-form video ART DIRECTOR reviewing keyframes from a vertical YouTube Short / Instagram Reel.
Rate the VISUAL PRODUCTION QUALITY 0-100 — be harsh and specific:
 - <40 = a flat, single-layer "AI slideshow": no depth/layering, hard cuts, weak/inconsistent type, looks auto-generated ("a dump").
 - 60-79 = competent: layered, graded, readable, some craft.
 - 80+ = a professionally-edited cinematic short: real depth, atmosphere, consistent design system, motion-graphics craft.
Judge: composition, foreground/background DEPTH & layering, color grade/atmosphere, typography, polish. (Ignore the subject matter; judge the CRAFT.)
Return STRICT JSON only: { "score": 0-100, "verdict": "pass"|"reject", "issues": ["specific flaw", ...], "summary": "one blunt sentence" }`;

const CLIP_PROMPT = `You are a ruthless CLIP CHANNEL ART DIRECTOR reviewing keyframes from a creator-clips vertical short (split-screen with gameplay/B-roll is intentional format, NOT a flaw).
Rate the CLIP PRODUCTION QUALITY 0-100 — be harsh and specific:
 - <30 = unwatchable: no hook, illegible captions, dead audio, misaligned split.
 - 40-59 = functional: readable captions, split aligned, basic hook present, decent audio.
 - 60-79 = good: strong hook, crisp captions hitting per second, beat-synced cuts, clean audio mix.
 - 80+ = elite: viral-worthy hook, kinetic captions perfectly synced, beat-cut editing, audio swell on impacts.
DO NOT penalize: split-screen format, gameplay/subway-surfers B-roll, template layout. These are INTENTIONAL and profitable.
DO judge: hook strength in frame 1, caption readability & hit rate, audio-visual sync, retention curve potential, overall engagement factor.
Return STRICT JSON only: { "score": 0-100, "verdict": "pass"|"reject", "issues": ["specific flaw", ...], "summary": "one blunt sentence" }`;

function videoDuration(p) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8' });
  return Number((r.stdout || '').trim()) || 0;
}

function extractFrames(videoPath, n) {
  const dur = videoDuration(videoPath) || 10;
  const dir = path.join(TMP, 'rqa-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = dur * (i + 0.5) / n;
    const o = path.join(dir, 'f' + i + '.png');
    spawnSync(FFMPEG, ['-y', '-ss', String(t.toFixed(2)), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=540:-1', o], { encoding: 'utf8' });
    if (fs.existsSync(o)) out.push(o);
  }
  return out;
}

async function qa(opts = {}) {
  const isClipFormat = opts.format === 'split_screen' || opts.format === 'clip' ||
    (opts.broll && /subwaysurfers|minecraft|gta|parkour/i.test(opts.broll));
  const defaultMin = isClipFormat ? Number(process.env.RENDER_QA_CLIPS_MIN || 0) : 60;
  const minScore = Number(isClipFormat ? process.env.RENDER_QA_CLIPS_MIN : process.env.RENDER_QA_MIN) || defaultMin;
  let imgs = Array.isArray(opts.imagePaths) ? opts.imagePaths.slice() : [];
  if (!imgs.length && opts.videoPath && fs.existsSync(opts.videoPath)) imgs = extractFrames(opts.videoPath, Math.max(2, Number(opts.frames) || 3));
  if (!imgs.length) return { ok: false, reason: 'no_images' };

  const prompt = isClipFormat ? CLIP_PROMPT : PROMPT;
  const parts = [{ text: prompt }];
  for (const p of imgs.slice(0, 4)) {
    try { parts.push({ inline_data: { mime_type: 'image/png', data: fs.readFileSync(p).toString('base64') } }); } catch (_) {}
  }
  // Route through the shared Gemini model ladder (lib/gemini-call) so a single
  // overloaded model (the "Gemini always down" 503) can't fail QA.
  const g = await require('./gemini-call').geminiGenerate({ parts, json: true, temperature: 0.2 });
  if (!g.ok) return { ok: false, reason: g.reason };
  const raw = g.text;

  let v;
  try { v = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')); }
  catch (_) { return { ok: false, reason: 'bad_json' }; }
  const score = Math.max(0, Math.min(100, Number(v.score) || 0));
  const verdict = v.verdict || (score >= minScore ? 'pass' : 'reject');
  return { ok: true, score, verdict, issues: Array.isArray(v.issues) ? v.issues : [], summary: String(v.summary || ''), minScore };
}

module.exports = { qa };

if (require.main === module) {
  require('./env-d-drive-only');
  const arg = process.argv[2];
  if (!arg) { console.error('Usage: node lib/render-qa.js <video.mp4 | frame.png>'); process.exit(2); }
  const opts = /\.(png|jpg|jpeg)$/i.test(arg) ? { imagePaths: [arg] } : { videoPath: arg };
  qa(opts).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
