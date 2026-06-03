/**
 * lib/aesthetic-qa.js — V7 aesthetic QA gate
 *
 * Per V7 spec, this gate is what V5 mograph would fail and V7 cinematic
 * scenes should pass. It samples 5 frames from a rendered scene, sends
 * each to Gemini 2.5 Flash Vision with a Cleo Abram / Vox / TLDR / Harris
 * / Nat-Geo aesthetic reference prompt, and scores 6 dimensions:
 *
 *   - Depth and dimensionality   (3D depth + DoF, or flat?)
 *   - Lighting quality           (motivated lighting, or flat texture?)
 *   - Composition                (cinematic framing, or centered slide?)
 *   - Detail density             (rewards inspection, or empty?)
 *   - Color grade                (subtle film LUT, or raw render?)
 *   - Aesthetic match            (would fit Cleo or Vox aesthetic?)
 *
 * Pass criteria: average overall >= 70 AND (would_fit_cleo OR would_fit_vox).
 *
 * On failure, returns the top_issue string so the caller can feed it back
 * into the next scene iteration.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const fetch = require('node-fetch');

const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE_BIN = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();
// Phase A — free-tier key fails on gemini-2.5-*. Default to 1.5-flash.
const MODEL = process.env.AESTHETIC_QA_MODEL || 'gemini-1.5-flash';
const TIMEOUT_MS = 60_000;

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

function probeDuration(p) {
  const r = spawnSync(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8' });
  const v = parseFloat(String(r.stdout || '').trim());
  return Number.isFinite(v) ? v : 0;
}

function extractFrames(mp4Path, outDir) {
  ensureDir(outDir);
  const dur = probeDuration(mp4Path);
  if (!dur || dur < 0.5) return { ok: false, reason: 'duration_too_short', frames: [] };
  const pcts = [0.01, 0.25, 0.5, 0.75, 0.99];
  const frames = [];
  for (let i = 0; i < pcts.length; i++) {
    const t = Math.max(0.02, Math.min(dur - 0.05, dur * pcts[i]));
    const fp = path.join(outDir, `aqa-frame-${i + 1}-${Math.round(pcts[i] * 100)}pct.jpg`);
    const r = spawnSync(FFMPEG, ['-y', '-ss', t.toFixed(3), '-i', mp4Path, '-frames:v', '1', '-q:v', '2', fp], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(fp) && fs.statSync(fp).size > 1000) {
      frames.push({ position: pcts[i], timeSec: t, path: fp });
    }
  }
  return { ok: frames.length >= 3, frames, durationSec: dur };
}

const PROMPT = `You are reviewing a still from a YouTube Short. Compare it to the reference channels: Cleo Abram, Vox shorts, TLDR News, Johnny Harris, Nat Geo Explorer shorts.

These channels render cinema-grade motion design: 3D depth with depth-of-field racks, motivated lighting with rim and key lights, cinematic compositions (rule of thirds, off-center), high detail density (particles, atmospheric haze, gradients), and a subtle film LUT (warm shadows, cool highlights, slight desaturation, vignette + chromatic aberration + grain).

Score each dimension 0-100 independently:
- depth_and_dimensionality (3D depth + DoF blur visible, or flat?)
- lighting_quality (real key/fill/rim lights catching surfaces with proper falloff, or flat texture?)
- composition (off-center / rule-of-thirds / has-foreground-and-background, or centered slide?)
- detail_density (particles, gradients, multiple visual elements, or empty?)
- color_grade (subtle film LUT, consistent palette, mood, or raw render?)
- aesthetic_match (would this fit in a Cleo Abram / Vox short, 0-100?)

Additionally answer:
- would_fit_cleo (true/false): Would this frame work in a Cleo Abram video?
- would_fit_vox (true/false): Would this frame work in a Vox short?
- top_issue (string, <=200 chars): If the frame is below 70, what's the one biggest issue to fix?
- recommend ("ship" | "iterate" | "reshoot")
- overall: average of the 6 dimension scores

Reply with this JSON object only, no prose:
{
  "overall": <int 0-100>,
  "breakdown": {
    "depth_and_dimensionality": <int>,
    "lighting_quality": <int>,
    "composition": <int>,
    "detail_density": <int>,
    "color_grade": <int>,
    "aesthetic_match": <int>
  },
  "would_fit_cleo": <true|false>,
  "would_fit_vox": <true|false>,
  "top_issue": "<string>",
  "recommend": "ship" | "iterate" | "reshoot"
}`;

async function callGeminiVision(frameBase64) {
  if (!process.env.GEMINI_API_KEY) return { ok: false, reason: 'no_gemini_api_key' };
  // L114 — Gemini MODEL LADDER + vision (no single-model 503 "Gemini down").
  // Same vision path lib/render-qa.js uses: parts = [prompt, inline_data image].
  const parts = [
    { text: PROMPT },
    { inline_data: { mime_type: 'image/jpeg', data: frameBase64 } },
  ];
  const g = await require('./gemini-call').geminiGenerate({ parts, json: true, temperature: 0.2 });
  if (!g.ok) return { ok: false, reason: 'vision_' + g.reason };
  return { ok: true, text: g.text };
}

function parseJson(text) {
  try { return JSON.parse(String(text || '').trim()); }
  catch (_) {
    const c = String(text || '').replace(/```json|```/g, '').trim();
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(c.slice(a, b + 1)); } catch (_) { return null; }
  }
}

/**
 * Run aesthetic QA on a rendered scene MP4.
 *
 * @param {object} input
 * @param {string} input.videoPath
 * @param {string} [input.qaDir]
 * @param {number} [input.passThreshold=70]
 * @returns {Promise<{ok:boolean, overall:number, byFrame:Array, would_fit_cleo:boolean, would_fit_vox:boolean, top_issues:Array, recommend:string, frames:Array, reason?:string}>}
 */
async function runAestheticQA(input) {
  const videoPath = input.videoPath;
  if (!videoPath || !fs.existsSync(videoPath)) return { ok: false, reason: 'video_missing' };
  const passThreshold = Number(input.passThreshold || 70);
  const qaDir = input.qaDir || path.join(path.dirname(videoPath), `.aqa-${path.basename(videoPath, '.mp4')}`);
  const extracted = extractFrames(videoPath, qaDir);
  if (!extracted.ok) return { ok: false, reason: extracted.reason || 'frame_extraction_failed' };

  const perFrame = [];
  for (const f of extracted.frames) {
    const buf = fs.readFileSync(f.path);
    const b64 = buf.toString('base64');
    const llm = await callGeminiVision(b64);
    if (!llm.ok) {
      perFrame.push({ frame: f, ok: false, reason: llm.reason });
      continue;
    }
    const parsed = parseJson(llm.text);
    if (!parsed) {
      perFrame.push({ frame: f, ok: false, reason: 'parse_failed', raw: llm.text.slice(0, 400) });
      continue;
    }
    perFrame.push({ frame: f, ok: true, ...parsed });
    // Small delay between calls to avoid rate-limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  const successful = perFrame.filter((p) => p.ok && typeof p.overall === 'number');
  if (successful.length === 0) return { ok: false, reason: 'all_vision_calls_failed', byFrame: perFrame };

  const avgOverall = Math.round(successful.reduce((s, p) => s + p.overall, 0) / successful.length);
  const anyFitCleo = successful.some((p) => p.would_fit_cleo === true);
  const anyFitVox = successful.some((p) => p.would_fit_vox === true);
  const topIssues = successful.filter((p) => p.top_issue).map((p) => p.top_issue);

  // Spec: pass if avg overall >= 70 AND (anyFitCleo OR anyFitVox)
  const pass = avgOverall >= passThreshold && (anyFitCleo || anyFitVox);

  const result = {
    ok: pass,
    overall: avgOverall,
    threshold: passThreshold,
    would_fit_cleo: anyFitCleo,
    would_fit_vox: anyFitVox,
    top_issues: topIssues.slice(0, 3),
    recommend: pass ? 'ship' : (avgOverall >= 55 ? 'iterate' : 'reshoot'),
    byFrame: perFrame,
    frames: extracted.frames,
    durationSec: extracted.durationSec,
    model: MODEL,
    evaluatedAt: new Date().toISOString(),
  };

  // Write report next to video
  const reportPath = path.join(path.dirname(videoPath), `_aqa-${path.basename(videoPath, '.mp4')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  result.reportPath = reportPath;
  return result;
}

module.exports = { runAestheticQA, extractFrames, _internals: { parseJson } };

if (require.main === module) {
  const videoPath = process.argv[2];
  if (!videoPath) { console.error('Usage: node lib/aesthetic-qa.js <video.mp4>'); process.exit(2); }
  runAestheticQA({ videoPath }).then((r) => {
    console.log(JSON.stringify({
      ok: r.ok, overall: r.overall, would_fit_cleo: r.would_fit_cleo, would_fit_vox: r.would_fit_vox,
      recommend: r.recommend, top_issues: r.top_issues,
      byFrameSummary: (r.byFrame || []).map((p) => p.ok ? { pos: p.frame.position, overall: p.overall, fit_cleo: p.would_fit_cleo, fit_vox: p.would_fit_vox, top_issue: p.top_issue } : { pos: p.frame.position, error: p.reason }),
      reportPath: r.reportPath,
      reason: r.reason || null,
    }, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => { console.error(e); process.exit(1); });
}
