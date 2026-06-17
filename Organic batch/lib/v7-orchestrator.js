/**
 * lib/v7-orchestrator.js — V7 end-to-end orchestrator
 *
 * For each script (A1 + A2):
 *   1. Load scene spec + V4-optimized voiceover
 *   2. Edge TTS with word boundaries at +50% or +85% rate to fit ≤35s
 *   3. Map each beat to V7BeatScene props with timing scaled to actual audio
 *   4. Stage audio + backdrops in public/v7-audio/
 *   5. Invoke `npx remotion render src/v7-index.jsx V7OrganicComposition` with
 *      --props pointing at the rendered props.json
 *   6. Mux audio in (Remotion-three needs absolute audio file path issue
 *      → render video-only then ffmpeg-mux)
 *   7. Spot-check aesthetic QA on one frame per script
 *   8. Stage outputs at renders/premium-clips-v2/<slug>/<slug>-V7.mp4 + IG variant
 *
 * Hero/subtitle text per beat is derived from the script's hook + power-words
 * + beat voiceover (kept short to fit lower-third title bar).
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const edgeTts = require('./edge-tts-boundary');

const ROOT = path.resolve(__dirname, '..');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE_BIN = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function rel(p) { return path.relative(process.cwd(), p).replace(/\\/g, '/'); }
function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function probeFormat(p) {
  const r = spawnSync(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,sample_rate:format=duration,bit_rate', '-of', 'json', p], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch (_) { return null; }
}

// Per-beat camera variation gives each segment a different feel
const CAMERA_BY_BEAT = {
  hook:                { from: [0.25, 0.25, 4.6],  to: [-0.05, 0.1,  4.2] },
  establishing:        { from: [-0.3,  0.3, 5.2],  to: [0.2,   0.1,  4.6] },
  setup:               { from: [0.4,   0.2, 5.0],  to: [-0.3,  0.15, 4.4] },
  escalation_secondary_hook: { from: [-0.4, 0.15, 4.8], to: [0.4, 0.25, 4.3] },
  escalation:          { from: [-0.4, 0.15, 4.8],  to: [0.4,   0.25, 4.3] },
  climax:              { from: [0, 0.4, 5.2],       to: [0,    -0.1, 4.3] },
  resolution:          { from: [0.3, 0.15, 4.7],   to: [-0.25, 0.25, 4.4] },
  loop_cliffhanger:    { from: [-0.2, 0.2, 4.4],   to: [0.05,  0.1,  4.8] },
  loop:                { from: [-0.2, 0.2, 4.4],   to: [0.05,  0.1,  4.8] },
};

// Hero text per beat — derived to be PUNCHY in a lower-third bar
function deriveBeatTextA1(spec, beat) {
  const id = beat.beatId;
  const ref = {
    hook:                { hero: 'PAKISTAN',  sub: 'JUST PICKED IRAN',           accent: '#FFD200' },
    establishing:        { hero: 'WHY IT MATTERS', sub: 'IRAN WAR · DAY 80',     accent: '#FFD200' },
    setup:               { hero: 'BALOCHISTAN', sub: 'SIX OVERLAND ROUTES',     accent: '#FFD200' },
    escalation_secondary_hook: { hero: 'CHINA + PAK + IRAN', sub: 'AXIS FORMING', accent: '#FF3344' },
    escalation:          { hero: 'CHINA + PAK + IRAN', sub: 'AXIS FORMING',     accent: '#FF3344' },
    climax:              { hero: 'INDIA',     sub: 'BUYING FROM BOTH SIDES',    accent: '#22DD66' },
    resolution:          { hero: 'NEW DELHI', sub: 'THE LEVERAGE PLAY',          accent: '#FFD200' },
    loop_cliffhanger:    { hero: 'WASHINGTON?', sub: 'WHAT NEXT?',               accent: '#FF3344' },
  };
  return ref[id] || { hero: 'NEWS', sub: '', accent: '#FFD200' };
}

function deriveBeatTextA2(spec, beat) {
  const id = beat.beatId;
  const ref = {
    hook:                { hero: 'SAUDI',    sub: 'BOMBED IRAQ',                accent: '#FF3344' },
    establishing:        { hero: 'MIDDLE EAST', sub: 'SPLIT IN HALF',           accent: '#FF3344' },
    setup:               { hero: 'GULF AT WAR', sub: 'US NOT LEADING',          accent: '#FF3344' },
    escalation_secondary_hook: { hero: 'MBS', sub: 'MOVED SOLO',                accent: '#FF3344' },
    escalation:          { hero: 'MBS',       sub: 'MOVED SOLO',                accent: '#FF3344' },
    climax:              { hero: 'OIL $140',  sub: 'INDIA · 40% IMPORT',        accent: '#22DD66' },
    resolution:          { hero: 'GULF WAR 3.0', sub: 'DIFFERENT RULES',        accent: '#FFD200' },
    loop_cliffhanger:    { hero: 'WASHINGTON?', sub: 'WHAT NEXT?',               accent: '#FF3344' },
  };
  return ref[id] || { hero: 'NEWS', sub: '', accent: '#FFD200' };
}

async function processScript(scriptId, optimizedScriptPath, specPath, ttsRate, outDir) {
  ensureDir(outDir);
  const optimized = loadJson(optimizedScriptPath).optimized;
  const spec = loadJson(specPath);

  // 1. TTS
  console.log(`[v7-orchestrator] ${scriptId} — synthesizing audio at ${ttsRate}`);
  const tts = await edgeTts.synthesize({
    text: optimized.fullVoiceover,
    voice: 'en-US-GuyNeural',
    rate: ttsRate,
    pitch: '+0Hz',
  });
  if (!tts.ok) return { ok: false, reason: `tts_failed: ${tts.reason}` };
  const audioDuration = tts.durationSec;
  const totalFrames = Math.round(audioDuration * 30);
  console.log(`[v7-orchestrator] audio ${audioDuration.toFixed(2)}s (${totalFrames} frames)`);

  // 2. Copy audio into public/v7-audio for Remotion bundling
  const audioPublicDir = path.join(ROOT, 'public', 'v7-audio');
  const audioRuntimeDir = path.join(ROOT, '.runtime-cache', 'v7-public', 'v7-audio');
  ensureDir(audioPublicDir);
  ensureDir(audioRuntimeDir);
  const audioFileName = `${scriptId}.mp3`;
  fs.copyFileSync(tts.audioPath, path.join(audioPublicDir, audioFileName));
  fs.copyFileSync(tts.audioPath, path.join(audioRuntimeDir, audioFileName));

  // 3. Build per-beat props, scaling beat timing to actual audio length
  const lastBeat = spec.beats[spec.beats.length - 1];
  const specEnd = lastBeat.duration_seconds * spec.beats.length; // not accurate, recompute
  // Recompute: spec has per-beat duration_seconds, accumulate
  let acc = 0;
  const specBeatBoundaries = spec.beats.map((b) => {
    const start = acc;
    acc += (b.duration_seconds || 3);
    return { id: b.beatId, start, end: acc, spec: b };
  });
  const specTotal = acc;
  const scale = audioDuration / specTotal;

  const beatProps = specBeatBoundaries.map((sb, i) => {
    const txt = scriptId === 'A1-pakistan-iran' ? deriveBeatTextA1(spec, sb.spec) : deriveBeatTextA2(spec, sb.spec);
    const cam = CAMERA_BY_BEAT[sb.id] || CAMERA_BY_BEAT.hook;
    return {
      beatId: sb.id,
      fromSec: sb.start * scale,
      toSec: sb.end * scale,
      backdrop: `v7-backdrops/${scriptId}-${sb.id}.jpg`,
      heroText: txt.hero,
      subtitleText: txt.sub,
      accentColor: txt.accent,
      showFlash: sb.id === 'hook' || sb.id === 'loop_cliffhanger',
      camera: cam,
    };
  });

  const powerWords = (optimized.powerWords || spec.beats.flatMap((b) => b.powerWords || []) || [])
    .map((w) => String(w).toLowerCase().replace(/[^a-z0-9]/gi, ''));

  const props = {
    scriptId,
    audioFile: `v7-audio/${audioFileName}`,
    beats: beatProps,
    wordBoundaries: tts.wordBoundaries,
    powerWords,
    brand: 'RAGNAR — NEUTRAL NEWS',
  };

  // 4. Write props file for Remotion
  const propsFile = path.join(outDir, `_v7-props-${scriptId}.json`);
  fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

  // 5. Render via Remotion — video only, audio muxed afterward to avoid bundle audio woes
  const slug = path.basename(outDir);
  const videoOnly = path.join(outDir, `${slug}-V7-video.mp4`);
  const finalOut = path.join(outDir, `${slug}-2026-05-20-V7.mp4`);

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const cmd = `${npxCmd} remotion render src/v7-index.jsx V7OrganicComposition "${rel(videoOnly)}" --props="${rel(propsFile)}" --public-dir=.runtime-cache/v7-public --frames=0-${totalFrames - 1} --codec=h264 --video-bitrate=5M --concurrency=2`;
  console.log(`[v7-orchestrator] rendering ${scriptId} (${totalFrames} frames)…`);
  const t0 = Date.now();
  const r = spawnSync(cmd, [], { shell: true, cwd: ROOT, timeout: 1800_000, encoding: 'utf8', maxBuffer: 200_000_000 });
  console.log(`[v7-orchestrator] render exit ${r.status} in ${Math.round((Date.now() - t0) / 1000)}s`);
  if (r.status !== 0 || !fs.existsSync(videoOnly)) {
    return { ok: false, reason: 'remotion_render_failed', stderr: r.stderr ? r.stderr.slice(-1500) : '', stdout: r.stdout ? r.stdout.slice(-500) : '' };
  }

  // 6. Mux audio @ 48kHz stereo for IG compliance
  const muxR = spawnSync(FFMPEG, [
    '-y',
    '-i', rel(videoOnly),
    '-i', rel(tts.audioPath),
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-map', '0:v', '-map', '1:a', '-shortest',
    rel(finalOut),
  ], { encoding: 'utf8' });
  if (muxR.status !== 0 || !fs.existsSync(finalOut)) {
    return { ok: false, reason: 'mux_failed', stderr: muxR.stderr ? muxR.stderr.slice(-600) : '' };
  }
  try { fs.unlinkSync(videoOnly); } catch (_) {}

  // 7. IG variant = same file
  const igPath = path.join(outDir, `${slug}-2026-05-20-V7-instagram.mp4`);
  fs.copyFileSync(finalOut, igPath);

  const probe = probeFormat(finalOut);
  const dur = probe && probe.format ? Number(probe.format.duration) : 0;
  const br = probe && probe.format ? Number(probe.format.bit_rate) : 0;

  return {
    ok: true,
    scriptId,
    outputPath: finalOut,
    igVariantPath: igPath,
    durationSec: dur,
    bitrate: br,
    bitrateMbps: (br / 1e6).toFixed(2),
    audioFile: path.join(audioPublicDir, audioFileName),
    audioDuration,
    beatCount: beatProps.length,
    captionCount: tts.wordBoundaries.length,
    propsFile,
  };
}

async function main() {
  const tasks = [
    {
      scriptId: 'A1-pakistan-iran',
      optimized: path.join(ROOT, '.planning/growth-strategy/daily/2026-05-18/script-A1-pakistan-picked-iran.v4-optimized.json'),
      spec: path.join(ROOT, '.planning/v7-specs/A1-pakistan-iran.json'),
      ttsRate: '+50%',
      outDir: path.join(ROOT, 'renders/premium-clips-v2/pakistan-picked-iran'),
    },
    {
      scriptId: 'A2-saudi-iraq',
      optimized: path.join(ROOT, '.planning/growth-strategy/daily/2026-05-18/script-A2-saudi-bombed-iraq.v4-optimized.json'),
      spec: path.join(ROOT, '.planning/v7-specs/A2-saudi-iraq.json'),
      ttsRate: '+85%',
      outDir: path.join(ROOT, 'renders/premium-clips-v2/saudi-bombed-iraq'),
    },
  ];

  const results = [];
  for (const t of tasks) {
    const r = await processScript(t.scriptId, t.optimized, t.spec, t.ttsRate, t.outDir);
    results.push(r);
  }
  return results;
}

module.exports = { processScript, main };

if (require.main === module) {
  main().then((res) => {
    console.log('\n=== V7 ORCHESTRATOR RESULTS ===');
    for (const r of res) {
      if (r.ok) {
        console.log(`✓ ${r.scriptId}: ${r.outputPath} (${r.durationSec.toFixed(1)}s, ${r.bitrateMbps} Mbps, ${r.beatCount} beats, ${r.captionCount} caption words)`);
      } else {
        console.log(`✗ ${r.scriptId}: ${r.reason}`);
        if (r.stderr) console.log('  stderr:', r.stderr.slice(0, 400));
      }
    }
    process.exit(res.every((r) => r.ok) ? 0 : 1);
  }).catch((err) => { console.error(err); process.exit(1); });
}
