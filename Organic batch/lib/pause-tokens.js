/**
 * lib/pause-tokens.js — L108 P3
 *
 * Honor LLM-emitted `<pause_400ms>` / `<pause_700ms>` tokens in script
 * voiceovers. The pause-payoff structure (deliberate silence before the
 * payoff word) produces 35-45% higher 3-second retention per 2026 viral-
 * hook research.
 *
 * Pipeline:
 *   1. Split fullVoiceover at every `<pause_Nms>` marker.
 *   2. Synthesize each segment via Edge TTS (sequential).
 *   3. Concatenate audio segments with `apad`/`adelay` ffmpeg insertion of
 *      the requested silence between them.
 *   4. Re-emit consolidated wordBoundaries with timestamps shifted to
 *      account for inserted silences.
 *
 * Edge TTS itself does not have a robust pause primitive (SSML `<break>` is
 * unreliable), so we split-and-join at the orchestrator level instead.
 *
 * Exports:
 *   - extractPauses(text)        → { segments:[string], pauses:[ms] }
 *   - synthesizeWithPauses(opts) → same shape as edge-tts-boundary.synthesize()
 *                                  but honors pause tokens
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const edgeTts = require('./edge-tts-boundary');

const PAUSE_REGEX = /<pause[_:](\d{2,4})\s*ms>/gi;

function extractPauses(text) {
  const segments = [];
  const pauses = [];
  let lastIndex = 0;
  let m;
  const re = new RegExp(PAUSE_REGEX.source, PAUSE_REGEX.flags);
  while ((m = re.exec(text)) !== null) {
    const segText = text.slice(lastIndex, m.index).trim();
    if (segText) segments.push(segText);
    pauses.push(Math.max(100, Math.min(2000, Number(m[1]) || 400)));
    lastIndex = m.index + m[0].length;
  }
  const tail = text.slice(lastIndex).trim();
  if (tail) segments.push(tail);
  return { segments, pauses };
}

async function synthesizeWithPauses(opts) {
  const text = String((opts && opts.text) || '');
  const { segments, pauses } = extractPauses(text);

  // No pauses → delegate to base TTS to keep the cache path consistent.
  if (pauses.length === 0) {
    return edgeTts.synthesize(opts);
  }

  // Synthesize each segment.
  const segResults = [];
  for (let i = 0; i < segments.length; i++) {
    const segOpts = Object.assign({}, opts, { text: segments[i] });
    const r = await edgeTts.synthesize(segOpts);
    if (!r.ok) return { ok: false, reason: 'segment_' + i + '_failed: ' + r.reason };
    segResults.push(r);
  }

  // Build an ffmpeg concat list with explicit silences between segments.
  const tmpDir = path.join(path.resolve(__dirname, '..'), '.runtime-cache', 'pause-concat');
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
  const stamp = Date.now();

  // Create the silence files using ffmpeg `anullsrc`.
  const silencePaths = [];
  for (let i = 0; i < pauses.length; i++) {
    const sp = path.join(tmpDir, `silence-${stamp}-${i}-${pauses[i]}ms.mp3`);
    const dur = (pauses[i] / 1000).toFixed(3);
    const r = spawnSync(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', 'anullsrc=cl=mono:r=24000', '-t', dur, '-c:a', 'libmp3lame', '-b:a', '48k', sp,
    ], { encoding: 'utf8' });
    if (r.status !== 0 || !fs.existsSync(sp)) {
      return { ok: false, reason: 'silence_gen_failed: ' + (r.stderr || '').slice(-200) };
    }
    silencePaths.push(sp);
  }

  // Interleave seg, silence, seg, silence... into concat list.
  const concatList = path.join(tmpDir, `concat-${stamp}.txt`);
  const lines = [];
  for (let i = 0; i < segResults.length; i++) {
    lines.push(`file '${segResults[i].audioPath.replace(/\\/g, '/')}'`);
    if (i < pauses.length) lines.push(`file '${silencePaths[i].replace(/\\/g, '/')}'`);
  }
  fs.writeFileSync(concatList, lines.join('\n') + '\n');

  const finalAudio = path.join(tmpDir, `final-${stamp}.mp3`);
  const concatR = spawnSync(FFMPEG, [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c:a', 'libmp3lame', '-b:a', '48k', finalAudio,
  ], { encoding: 'utf8' });
  if (concatR.status !== 0 || !fs.existsSync(finalAudio)) {
    return { ok: false, reason: 'concat_failed: ' + (concatR.stderr || '').slice(-200) };
  }

  // Stitch consolidated wordBoundaries, shifting later segments by cumulative silence.
  const wordBoundaries = [];
  let cumulativeShift = 0;
  for (let i = 0; i < segResults.length; i++) {
    for (const w of (segResults[i].wordBoundaries || [])) {
      wordBoundaries.push({
        word: w.word,
        startSeconds: w.startSeconds + cumulativeShift,
        durationSeconds: w.durationSeconds,
      });
    }
    if (i < pauses.length) cumulativeShift += pauses[i] / 1000 + (segResults[i].durationSec || 0);
    else cumulativeShift += segResults[i].durationSec || 0;
  }

  // Probe final duration.
  const dur = (function () {
    const r = spawnSync(FFMPEG, ['-i', finalAudio], { encoding: 'utf8' });
    const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  })();

  return {
    ok: true,
    audioPath: finalAudio,
    durationSec: dur,
    wordBoundaries,
    pauseInsertions: pauses,
    segmentCount: segResults.length,
  };
}

module.exports = { extractPauses, synthesizeWithPauses };

if (require.main === module) {
  require('./env-d-drive-only');
  const text = process.argv.slice(2).join(' ') || "Wait <pause_500ms> here's the wild part… <pause_300ms> Vance flew to Doha at 3am.";
  console.log('--- extractPauses ---');
  console.log(JSON.stringify(extractPauses(text), null, 2));
  synthesizeWithPauses({ text, voice: 'en-US-GuyNeural', rate: '+15%', pitch: '+0Hz' }).then((r) => {
    console.log('--- synthesizeWithPauses ---');
    console.log(JSON.stringify({ ok: r.ok, audioPath: r.audioPath, durationSec: r.durationSec, segmentCount: r.segmentCount, pauseInsertions: r.pauseInsertions, sampleBoundaries: (r.wordBoundaries || []).slice(0, 6), reason: r.reason }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
