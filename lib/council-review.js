/**
 * lib/council-review.js — L119: the Supreme Council watches the FULL video.
 *
 * Where render-qa.js is one art-director scoring stills, this shows the whole
 * timeline (12 frames sampled start→end + the first/last-frame loop pair) to a
 * COUNCIL of personas in one Gemini-vision call and returns humanized verdicts:
 *
 *   - The Editor (film/TV cutter): pacing, transitions, grade cohesion, type craft
 *   - The YouTuber (100M-sub operator): hook strength, retention risk per beat, payoff
 *   - The Scroller (bored 19-year-old): would they actually stop? where do they swipe?
 *   - The Brand Director: does this look like ONE channel's work, premium or slop?
 *
 * Output: { ok, unified (0-100), shipVerdict: 'ship'|'fix'|'reject', seats:{...},
 *           topFixes:[...3 concrete actions...], swipeMoment }
 * Logged to renders/analytics/council-{date}.jsonl. CLI: node lib/council-review.js <mp4>
 * $0 (Gemini ladder via lib/gemini-call). Fail-open: errors return ok:false, never throw.
 */
'use strict';

require('./env-d-drive-only');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FFMPEG = require('ffmpeg-static') || 'ffmpeg';
const FFPROBE = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();

function probeDuration(p) {
  const r = spawnSync(FFPROBE, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8', windowsHide: true });
  const d = parseFloat((r.stdout || '').trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

function extractFrames(videoPath, n = 12) {
  const dur = probeDuration(videoPath);
  if (!dur) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'council-'));
  const frames = [];
  // even spread + force first and last frames (loop-seam judgment)
  const ts = [0.1];
  for (let i = 1; i < n - 1; i++) ts.push((dur * i) / (n - 1));
  ts.push(Math.max(0.1, dur - 0.15));
  for (let i = 0; i < ts.length; i++) {
    const out = path.join(dir, `f${String(i).padStart(2, '0')}.jpg`);
    const r = spawnSync(FFMPEG, ['-ss', ts[i].toFixed(2), '-i', videoPath, '-frames:v', '1', '-q:v', '4', '-vf', 'scale=540:-2', '-y', out], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (r.status === 0 && fs.existsSync(out)) frames.push({ t: ts[i], path: out });
  }
  return frames;
}

const COUNCIL_PROMPT = `You are a SUPREME COUNCIL of four people watching a 9:16 short-form video together. The frames are sampled in order across the ENTIRE video (timestamps given), first and last frames included. Judge the WHOLE piece — flow, arc, cohesion — not isolated stills.

THE SEATS (each scores 0-100 and speaks in their own voice, 2-3 blunt sentences):
1. "editor" — veteran film/TV editor. Pacing, cut rhythm, grade cohesion, typography craft, whether the footage is USED or buried.
2. "youtuber" — operator of a 100M-sub shorts channel. Hook in frame 1 (muted-readable?), retention risk per section, payoff delivery, would THIS get an 80% view-through.
3. "scroller" — bored 19-year-old on a phone. Honest gut: do you stop? WHERE exactly do you swipe away (timestamp)? What would have kept you?
4. "brand" — brand/creative director. Does this look like ONE premium channel's work or auto-generated slop? Would you be proud to ship it?

Return STRICT JSON only:
{
  "seats": {
    "editor":  { "score": 0-100, "verdict": "..." },
    "youtuber":{ "score": 0-100, "verdict": "..." },
    "scroller":{ "score": 0-100, "verdict": "...", "swipeAtSec": <number|null> },
    "brand":   { "score": 0-100, "verdict": "..." }
  },
  "unified": <weighted 0-100: scroller 35%, youtuber 30%, editor 20%, brand 15%>,
  "shipVerdict": "ship" | "fix" | "reject",   // ship>=70, fix 50-69, reject<50
  "topFixes": ["the 3 most concrete, mechanical fixes — name the timestamp/element"],
  "bestMoment": "the single strongest moment and why"
}
Be brutal and specific. Generic praise is forbidden.`;

async function councilReview(videoPath, opts = {}) {
  try {
    if (!fs.existsSync(videoPath)) return { ok: false, reason: 'video_missing: ' + videoPath };
    const frames = extractFrames(videoPath, opts.frames || 12);
    if (frames.length < 6) return { ok: false, reason: 'frame_extraction_failed (' + frames.length + ')' };

    const { geminiGenerate } = require('./gemini-call');
    const parts = [{ text: COUNCIL_PROMPT + '\n\nFrame timestamps (s): ' + frames.map((f) => f.t.toFixed(1)).join(', ') + (opts.context ? '\nContext: ' + String(opts.context).slice(0, 400) : '') }];
    for (const f of frames) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(f.path).toString('base64') } });
    }
    const res = await geminiGenerate({ parts, json: true, temperature: 0.4 });
    if (!res.ok) return { ok: false, reason: 'gemini_failed: ' + res.reason };
    const raw = res.text;
    let out;
    try {
      out = typeof raw === 'string' 
        ? JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')) 
        : raw;
    } catch (e) {
      return { ok: false, reason: 'council_bad_json' };
    }
    if (!out || !out.seats || typeof out.unified !== 'number') return { ok: false, reason: 'council_bad_shape' };
    out.ok = true;
    out.videoPath = videoPath;

    // log for the learning loop
    try {
      const logFile = path.join(ROOT, 'renders', 'analytics', 'council-' + new Date().toISOString().slice(0, 10) + '.jsonl');
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), video: path.basename(videoPath), unified: out.unified, shipVerdict: out.shipVerdict, seats: Object.fromEntries(Object.entries(out.seats).map(([k, v]) => [k, v.score])), topFixes: out.topFixes }) + '\n');
    } catch (_) {}

    // cleanup temp frames
    try { for (const f of frames) fs.unlinkSync(f.path); fs.rmdirSync(path.dirname(frames[0].path)); } catch (_) {}
    return out;
  } catch (e) {
    return { ok: false, reason: 'council_error: ' + String(e && e.message || e).slice(0, 160) };
  }
}

module.exports = { councilReview };

if (require.main === module) {
  const mp4 = process.argv[2];
  if (!mp4) { console.log('usage: node lib/council-review.js <video.mp4> [context...]'); process.exit(1); }
  councilReview(path.resolve(mp4), { context: process.argv.slice(3).join(' ') }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok && r.shipVerdict !== 'reject' ? 0 : 1);
  });
}
