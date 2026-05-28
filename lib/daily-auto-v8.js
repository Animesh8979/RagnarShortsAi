/**
 * lib/daily-auto-v8.js — MASTER-REBUILD orchestrator
 *
 * For each organic script:
 *   1. Load v8-trimmed script (~80 words at +25% TTS rate target)
 *   2. Edge TTS at +25% with word boundaries
 *   3. Per beat: hero-visual (FLUX still → parallax-animate) → motion clip
 *   4. Stage hero clips + audio in public/v8-public/
 *   5. Render via Remotion V8OrganicComposition with --public-dir=v8-public
 *   6. Render outputs 1080×1920 30fps h264 + AAC 48kHz stereo
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE_BIN = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();

const edgeTts = require('./edge-tts-boundary');
const hero = require('./hero-visual');
const parallax = require('./parallax-generator');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function rel(p) { return path.relative(process.cwd(), p).replace(/\\/g, '/'); }
function probeFormat(p) {
  const r = spawnSync(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,sample_rate:format=duration,bit_rate', '-of', 'json', p], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch (_) { return null; }
}

async function processScript(scriptId, optimizedPath, ttsRate, outDir) {
  ensureDir(outDir);
  const opt = loadJson(optimizedPath).optimized;

  // 1. Edge TTS at +25% (master-rebuild Phase 3 rate)
  console.log('[v8] ' + scriptId + ' synthesizing TTS at ' + ttsRate);
  const tts = await edgeTts.synthesize({
    text: opt.fullVoiceover,
    voice: 'en-US-GuyNeural',
    rate: ttsRate,
    pitch: '+0Hz',
  });
  if (!tts.ok) return { ok: false, reason: 'tts_failed:' + tts.reason };
  const audioDur = tts.durationSec;
  const totalFrames = Math.round(audioDur * 30);
  console.log('[v8] ' + scriptId + ' audio ' + audioDur.toFixed(2) + 's (' + totalFrames + 'f)');

  // 2. Public dir for Remotion bundling
  const v8Public = path.join(ROOT, '.runtime-cache', 'v8-public');
  ensureDir(v8Public);
  ensureDir(path.join(v8Public, 'v8-audio'));
  ensureDir(path.join(v8Public, 'v8-hero'));

  // Audio file → public/
  const audioFileName = scriptId + '.mp3';
  fs.copyFileSync(tts.audioPath, path.join(v8Public, 'v8-audio', audioFileName));

  // 3. Generate hero clip per beat (NVIDIA FLUX still → parallax-animate)
  const beats = Array.isArray(opt.beats) ? opt.beats : [];
  const lastBeat = beats[beats.length - 1];
  const specEnd = lastBeat.tEnd || lastBeat.endSec || 28;
  const scale = audioDur / specEnd;
  const heroResults = [];
  const beatProps = [];

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const fromSec = (b.tStart || 0) * scale;
    const toSec = (b.tEnd || specEnd) * scale;
    const dur = Math.max(0.5, toSec - fromSec);
    console.log('[v8] ' + scriptId + ' beat ' + i + ' (' + dur.toFixed(2) + 's): ' + (b.vo || b.voiceover || '').slice(0, 60));
    const heroResult = await hero.heroVisual({
      beat: { voiceover: b.vo || b.voiceover, visual_prompt: b.visualPrompt || b.visual_prompt },
      scriptContext: { topic: opt.title || scriptId },
      durationSec: dur,
      beatIndex: i,
    });
    if (!heroResult.ok) {
      return { ok: false, reason: 'hero_visual_failed_beat_' + i + ':' + heroResult.reason };
    }
    // Move motion clip into public/v8-hero/
    const ext = path.extname(heroResult.path) || '.webm';
    const heroFileName = scriptId + '-beat-' + i + ext;
    const heroDest = path.join(v8Public, 'v8-hero', heroFileName);
    fs.copyFileSync(heroResult.path, heroDest);
    heroResults.push({ beatIndex: i, fromSec, toSec, provider: heroResult.provider, move: heroResult.move, heroPath: heroDest });
    beatProps.push({ beatId: 'beat_' + i, fromSec, toSec, heroClip: 'v8-hero/' + heroFileName });
  }

  // 4. Build composition props
  const props = {
    scriptId,
    audioFile: 'v8-audio/' + audioFileName,
    beats: beatProps,
    wordBoundaries: tts.wordBoundaries,
    powerWords: (opt.powerWords || []).map((w) => String(w).toLowerCase().replace(/[^a-z0-9]/gi, '')),
    brand: 'RAGNAR — NEUTRAL NEWS',
  };
  const propsFile = path.join(outDir, '_v8-props-' + scriptId + '.json');
  fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

  // 5. Render V8OrganicComposition via Node API (tools/v8-render-api.js).
  //    Calling the Remotion CLI mangles Windows paths with spaces; the Node API
  //    takes JS strings and avoids argv parsing entirely. Uses Remotion's
  //    bundled chrome-headless-shell (already at node_modules/.remotion/...).
  const slug = path.basename(outDir);
  const videoOnly = path.join(outDir, slug + '-V8-video.mp4');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const finalOut = path.join(outDir, slug + '-' + dateStamp + '-V8.mp4');

  const apiScript = path.join(ROOT, 'tools', 'v8-render-api.js');
  const publicDirAbs = v8Public;
  console.log('[v8] ' + scriptId + ' rendering (' + totalFrames + 'f) via Node API...');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [apiScript, propsFile, videoOnly, publicDirAbs], {
    cwd: ROOT, timeout: 1800_000, encoding: 'utf8', maxBuffer: 200_000_000,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  console.log('[v8] ' + scriptId + ' render exit ' + r.status + ' in ' + Math.round((Date.now() - t0) / 1000) + 's');
  if (r.status !== 0 || !fs.existsSync(videoOnly)) {
    return { ok: false, reason: 'remotion_render_failed', stderr: (r.stderr || '').slice(-1500), stdout: (r.stdout || '').slice(-500) };
  }

  // 6. Mux audio at 48kHz stereo
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
    return { ok: false, reason: 'mux_failed', stderr: (muxR.stderr || '').slice(-600) };
  }
  try { fs.unlinkSync(videoOnly); } catch (_) {}

  const igPath = path.join(outDir, slug + '-' + dateStamp + '-V8-instagram.mp4');
  fs.copyFileSync(finalOut, igPath);

  const probe = probeFormat(finalOut);
  return {
    ok: true,
    scriptId,
    outputPath: finalOut,
    igVariantPath: igPath,
    durationSec: probe && probe.format ? Number(probe.format.duration) : 0,
    bitrate: probe && probe.format ? Number(probe.format.bit_rate) : 0,
    heroResults,
    audioDuration: audioDur,
    captionCount: tts.wordBoundaries.length,
  };
}

async function main() {
  const tasks = [
    {
      scriptId: 'A1-pakistan-iran',
      optimized: path.join(ROOT, '.planning/growth-strategy/daily/2026-05-21/script-A1-pakistan-picked-iran.v8-trimmed.json'),
      ttsRate: '+15%',
      outDir: path.join(ROOT, 'renders/premium-clips-v2/pakistan-picked-iran'),
    },
    {
      scriptId: 'A2-saudi-iraq',
      optimized: path.join(ROOT, '.planning/growth-strategy/daily/2026-05-21/script-A2-saudi-bombed-iraq.v8-trimmed.json'),
      ttsRate: '+15%',
      outDir: path.join(ROOT, 'renders/premium-clips-v2/saudi-bombed-iraq'),
    },
  ];

  const results = [];
  for (const t of tasks) {
    const r = await processScript(t.scriptId, t.optimized, t.ttsRate, t.outDir);
    results.push(r);
  }
  return results;
}

module.exports = { processScript, main };

if (require.main === module) {
  main().then((res) => {
    console.log('\n=== V8 ORCHESTRATOR RESULTS ===');
    for (const r of res) {
      if (r.ok) {
        console.log('✓ ' + r.scriptId + ': ' + r.outputPath + ' (' + r.durationSec.toFixed(1) + 's, ' + (r.bitrate / 1e6).toFixed(2) + ' Mbps)');
      } else {
        console.log('✗ ' + r.scriptId + ': ' + r.reason);
        if (r.stderr) console.log('  stderr:', r.stderr.slice(0, 400));
      }
    }
    process.exit(res.every((r) => r.ok) ? 0 : 1);
  }).catch((e) => { console.error(e); process.exit(1); });
}
