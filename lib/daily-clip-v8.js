/**
 * lib/daily-clip-v8.js — MASTER-REBUILD clipping pipeline (Phase 4 + 8)
 *
 * Builds reactive split-screen clips from the MrBeast 100 Pilots HD source.
 *   1. Extract 25-30s A-roll segments at chosen timestamps
 *   2. Extract audio from each segment
 *   3. Build word-level captions via Groq Whisper (allowed for clips, NOT organic)
 *   4. Run split-screen.compose() with Subway Surfers b-roll (NEW filtergraph:
 *      blurred-fill + adaptive EQ + unsharp on A-roll only, b-roll untouched)
 *   5. Mux audio at 48kHz stereo
 *   6. Build IG variant
 *
 * Channel routing: B1 + B2 → RagnarShortsUltimate + IG (vid1).
 */
'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();

const splitScreen = require('./split-screen');
const captionBuilder = require('./caption-builder');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function rel(p) { return path.relative(process.cwd(), p).replace(/\\/g, '/'); }

const CLIPS = [
  {
    id: 'B1',
    label: 'clip-B1-100pilots-emotional',
    sourceVideo: path.join(ROOT, '.runtime-cache/clip-sources/mrbeast-100pilots/100pilots-source.mp4'),
    startSec: 55,                  // "I DID IT FOR MY DAUGHTERS" emotional moment
    durationSec: 28,
    brollFile: 'subwaysurfers.mp4',
    outDir: path.join(ROOT, 'renders/creator-clips-v2/2026-05-21-B1'),
  },
  {
    id: 'B2',
    label: 'clip-B2-100pilots-finalrounds',
    sourceVideo: path.join(ROOT, '.runtime-cache/clip-sources/mrbeast-100pilots/100pilots-source.mp4'),
    startSec: 1432,                // Final rounds exhaustion / elimination drama
    durationSec: 28,
    brollFile: 'subwaysurfers.mp4',
    outDir: path.join(ROOT, 'renders/creator-clips-v2/2026-05-21-B2'),
  },
];

async function processClip(clip) {
  ensureDir(clip.outDir);
  const slug = path.basename(clip.outDir);
  console.log('\n=== ' + clip.id + ' (' + clip.label + ') ===');
  console.log('  Source: ' + path.basename(clip.sourceVideo));
  console.log('  Cut:    ' + clip.startSec + 's → +' + clip.durationSec + 's');

  // 1. Extract A-roll segment (25-30s, 1080p downscale)
  const arollPath = path.join(clip.outDir, slug + '-aroll.mp4');
  const arollR = spawnSync(FFMPEG, [
    '-y', '-ss', String(clip.startSec), '-i', rel(clip.sourceVideo),
    '-t', String(clip.durationSec),
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-b:v', '6M',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    rel(arollPath),
  ], { encoding: 'utf8' });
  if (arollR.status !== 0 || !fs.existsSync(arollPath)) {
    return { ok: false, reason: 'aroll_extract_failed', stderr: (arollR.stderr || '').slice(-600) };
  }
  console.log('  A-roll extracted: ' + fs.statSync(arollPath).size + ' bytes');

  // 2. Extract audio
  const audioPath = path.join(clip.outDir, slug + '-audio.m4a');
  const audR = spawnSync(FFMPEG, [
    '-y', '-i', rel(arollPath),
    '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    rel(audioPath),
  ], { encoding: 'utf8' });
  if (audR.status !== 0 || !fs.existsSync(audioPath)) {
    return { ok: false, reason: 'audio_extract_failed' };
  }

  // 3. Build word-level captions via Groq Whisper (clips path — allowed)
  const captionsAssPath = path.join(clip.outDir, slug + '-captions.ass');
  let captionsR;
  try {
    captionsR = await captionBuilder.buildFromWhisper({
      audioPath, outputPath: captionsAssPath,
      powerWords: ['daughters', 'jet', 'pilots', 'million', 'private', 'mrbeast', 'won', 'lose', 'first'],
    });
  } catch (e) {
    captionsR = { ok: false, reason: 'whisper_threw:' + (e && e.message || e) };
  }
  if (!captionsR || !captionsR.ok) {
    console.log('  ⚠ Whisper captions failed: ' + (captionsR && captionsR.reason));
    console.log('  → continuing without captions');
  } else {
    console.log('  Captions: ' + captionsR.lineCount + ' lines');
  }

  // 4. Probe A-roll YAVG for adaptive EQ
  const yavg = splitScreen.probeArollYavg(arollPath);
  console.log('  A-roll YAVG: ' + yavg + ' → lightingScore: ' + splitScreen.scoreLighting(yavg));

  // 5. Split-screen compose (NEW filtergraph: blurred-fill + adaptive EQ + unsharp)
  const splitOutPath = path.join(clip.outDir, slug + '-split.mp4');
  const compose = await splitScreen.compose({
    topVideoPath: arollPath,
    audioPath,
    outputPath: splitOutPath,
    durationSec: clip.durationSec,
    brollFile: clip.brollFile,
    arollYavg: yavg,
    captionsAssPath: (captionsR && captionsR.ok) ? captionsAssPath : undefined,
  });
  if (!compose.ok) {
    return { ok: false, reason: 'split_screen_failed:' + compose.reason, stderr: compose.stderr };
  }
  console.log('  Split: ' + fs.statSync(splitOutPath).size + ' bytes ' + (compose.brollUsed) + ' @ ' + compose.brollOffset + 's');

  // 6. Final IG-compliant rename (already 48kHz stereo from compose)
  const dateStamp = new Date().toISOString().slice(0, 10);
  const finalPath = path.join(clip.outDir, slug + '-' + dateStamp + '-V8.mp4');
  fs.copyFileSync(splitOutPath, finalPath);
  const igPath = path.join(clip.outDir, slug + '-' + dateStamp + '-V8-instagram.mp4');
  fs.copyFileSync(finalPath, igPath);
  return {
    ok: true,
    id: clip.id,
    outputPath: finalPath,
    igVariantPath: igPath,
    sizeBytes: fs.statSync(finalPath).size,
    yavg,
    brollUsed: compose.brollUsed,
    brollOffset: compose.brollOffset,
    captionLines: captionsR && captionsR.ok ? captionsR.lineCount : 0,
  };
}

async function main(clipList) {
  const list = Array.isArray(clipList) && clipList.length ? clipList : CLIPS;
  const results = [];
  for (const clip of list) {
    const r = await processClip(clip);
    results.push(r);
  }
  return results;
}

/**
 * processClips(specs) — render an arbitrary clip list (used by fresh-batch).
 * Each spec: { id, label, sourceVideo, startSec, durationSec, brollFile, outDir }
 */
async function processClips(specs) {
  return main(specs);
}

module.exports = { processClip, processClips, main, CLIPS };

if (require.main === module) {
  main().then((res) => {
    console.log('\n=== V8 CLIPPING RESULTS ===');
    for (const r of res) {
      if (r.ok) {
        console.log('✓ ' + r.id + ': ' + r.outputPath + ' (' + (r.sizeBytes / 1e6).toFixed(2) + ' MB, YAVG=' + r.yavg + ', b-roll=' + r.brollUsed + ')');
      } else {
        console.log('✗ ' + (r.id || 'clip') + ': ' + r.reason);
        if (r.stderr) console.log('  stderr:', r.stderr.slice(0, 400));
      }
    }
    process.exit(res.every((r) => r.ok) ? 0 : 1);
  }).catch((e) => { console.error(e); process.exit(1); });
}
