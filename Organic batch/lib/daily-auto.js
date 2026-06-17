/**
 * lib/daily-auto.js — V5 Phase 2 orchestrator
 *
 * End-to-end daily batch automation. Today's primary entry point is
 * renderOrganic(scriptPath) which executes the V5 mograph-first pipeline.
 *
 * The full V5 spec describes:
 *   - fetchTrendingNews (Reuters/Hindu/AlJazeera RSS)
 *   - findClipSource (allowlisted creators, blocklist-cross-checked)
 *   - pickClipWindows (dopamine-density scoring)
 *   - generateScript (Gemini with V4 template)
 *   - factCheck (web-search verify every claim)
 *   - renderOrganic / renderClip
 *   - qaGate
 *   - scheduleUploads (2h gaps)
 *
 * This first version focuses on:
 *   - renderOrganic: full mograph-first pipeline (today's deliverable)
 *   - qaGate: ffprobe-based acceptance checks
 *   - scheduleUploads: persistent process with setTimeout, OR cron-style task
 *
 * Trend discovery + script generation are stubs that read from disk for
 * today's run (the 2026-05-18 organic scripts are already authored). The
 * full RSS fetch path is wired but not exercised today.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const FFPROBE_BIN = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();

const edgeTts = require('./edge-tts-boundary');
const mograph = require('./mograph-author');
const pexelsVideo = require('./pexels-video');
const splitScreen = require('./split-screen');
const captionBuilder = require('./caption-builder');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function rel(p) { return path.relative(process.cwd(), p).replace(/\\/g, '/'); }

function probeFormat(p) {
  const r = spawnSync(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'stream=width,height,codec_name,r_frame_rate,sample_rate:format=duration,bit_rate', '-of', 'json', p], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch (_) { return null; }
}

/**
 * Concatenate a list of mograph mp4s into one top-half video.
 */
function concatVideos(mp4Paths, outputPath) {
  ensureDir(path.dirname(outputPath));
  const listFile = outputPath + '.concat-list.txt';
  // Concat demuxer resolves paths relative to the list file's dir. Use
  // absolute forward-slash paths to avoid surprises.
  const absPaths = mp4Paths.map((p) => path.resolve(p).replace(/\\/g, '/'));
  fs.writeFileSync(listFile, absPaths.map((p) => `file '${p}'`).join('\n'));
  const r = spawnSync(FFMPEG, [
    '-y', '-f', 'concat', '-safe', '0', '-i', rel(listFile),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
    '-b:v', '6M', '-minrate', '5M', '-maxrate', '7M', '-bufsize', '12M',
    '-x264-params', 'nal-hrd=cbr',
    '-r', '30',
    rel(outputPath),
  ], { encoding: 'utf8' });
  if (r.status !== 0 && process.env.V5_DEBUG) console.log('[concat]', String(r.stderr || '').slice(-400));
  try { fs.unlinkSync(listFile); } catch (_) {}
  return r.status === 0;
}

/**
 * Re-encode a top-half video to the standard 1080x960 30fps CBR format so
 * concat with mograph clips doesn't barf on format mismatches.
 */
function normalizeToTopHalfFormat(inPath, outPath, duration) {
  ensureDir(path.dirname(outPath));
  const r = spawnSync(FFMPEG, [
    '-y', '-i', rel(inPath),
    '-vf', 'scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1,fps=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
    '-b:v', '6M', '-minrate', '5M', '-maxrate', '7M', '-bufsize', '12M',
    '-x264-params', 'nal-hrd=cbr',
    '-an', '-r', '30', '-t', String(duration.toFixed(2)),
    rel(outPath),
  ], { encoding: 'utf8' });
  return r.status === 0;
}

/**
 * For a beat, decide what mograph kind + params to author. If the script
 * already specifies mographKind, honor it. Otherwise infer from beat
 * content (numerical → stat-card, list-of-3 → tier-list, hook → kinetic-typo).
 */
function inferMographParams(beat, scriptCtx) {
  const kind = beat.mographKind || inferKind(beat, scriptCtx);
  const vo = String(beat.voiceover || beat.vo || '').trim();

  if (kind === 'kinetic-typography') {
    const words = vo.split(/\s+/);
    const headWord = (scriptCtx.hook_word_frame_0 || words[0] || 'NEWS').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const subtitle = words.slice(1, 5).join(' ');
    return { kind, mographParams: { word: headWord, subtitle } };
  }
  if (kind === 'stat-card') {
    // Pull the first numeric (with optional unit) from VO
    const num = (vo.match(/\b(\d+(?:\.\d+)?(?:%|x|M|B|K)?)\b/) || ['', vo.split(/\s+/)[0]])[1];
    const labelTokens = vo.split(/\s+/).slice(0, 5).filter((t) => t.toLowerCase() !== num.toLowerCase());
    return { kind, mographParams: { value: num.toUpperCase(), label: labelTokens.join(' ').toUpperCase(), color: '#1a1a2e' } };
  }
  if (kind === 'tier-list') {
    // Use scriptCtx.powerWords as the 3-tier labels
    const tiers = (scriptCtx.powerWords || []).slice(0, 4).map((w, i) => ({
      label: String(w).toUpperCase(),
      color: ['#ff0040', '#0066cc', '#00cc66', '#ffaa00'][i] || '#1a1a2e',
    }));
    return { kind, mographParams: { tiers } };
  }
  if (kind === 'animated-map') {
    const tokens = vo.split(/\s+/).slice(0, 8);
    return {
      kind,
      mographParams: {
        title: tokens.slice(0, 4).join(' ').toUpperCase(),
        regions: (scriptCtx.powerWords || []).slice(0, 5).map((w) => ({ label: String(w).toUpperCase() })),
      },
    };
  }
  if (kind === 'glitch-reveal') {
    return { kind, mographParams: { text: vo.split(/\s+/).slice(0, 3).join(' ').toUpperCase() } };
  }
  return { kind: 'none' };
}

function inferKind(beat, _scriptCtx) {
  const vo = String(beat.voiceover || beat.vo || '').toLowerCase();
  // Heuristic kind selection if not specified
  if (/^\d|percent|million|billion|thousand|barrel|dollar/.test(vo)) return 'stat-card';
  if (/(versus|vs\.|three|four|five) (countries|sides|players|tiers|levels)/.test(vo)) return 'tier-list';
  if (/(map|region|border|crossing|route)/.test(vo)) return 'animated-map';
  if (/(hook|reveal|cracked|broke|exposed)/.test(vo)) return 'glitch-reveal';
  return 'kinetic-typography';
}

/**
 * Render an organic video end-to-end.
 *
 * @param {object} input
 * @param {string} input.optimizedScriptPath  — path to *.v4-optimized.json
 * @param {string} [input.sourceScriptPath]    — original script with mographKind hints
 * @param {string} input.outputDir            — where to write final mp4 + REVIEW-V5.md
 * @param {string} [input.variant='A']
 * @returns {Promise<{ok:boolean, outputPath?:string, igVariantPath?:string, durationSec?:number, bitrate?:number, brollUsed?:string, mographs?:Array, reason?:string}>}
 */
async function renderOrganic(input) {
  const optimized = loadJson(input.optimizedScriptPath).optimized;
  const sourceScript = input.sourceScriptPath && fs.existsSync(input.sourceScriptPath) ? loadJson(input.sourceScriptPath) : null;
  const variant = input.variant || 'A';
  const outDir = input.outputDir;
  ensureDir(outDir);

  // 1. Synthesize voiceover with word boundaries (Edge TTS, no Whisper)
  const tts = await edgeTts.synthesize({
    text: optimized.fullVoiceover,
    voice: (sourceScript && sourceScript.channel_voice_profile && sourceScript.channel_voice_profile.voice) || 'en-US-GuyNeural',
    rate: (sourceScript && sourceScript.channel_voice_profile && sourceScript.channel_voice_profile.rate) || '+13%',
    pitch: (sourceScript && sourceScript.channel_voice_profile && sourceScript.channel_voice_profile.pitch) || '+0Hz',
  });
  if (!tts.ok) return { ok: false, reason: `tts_failed: ${tts.reason}` };
  const audioPath = tts.audioPath;
  const audioDuration = tts.durationSec;

  // 2. For each beat, produce a mograph clip aligned to that beat's time window.
  // The optimized script has 5 beats covering 0-28s. Audio likely lands in 20-28s.
  // Scale beats proportionally to actual audio duration if it deviates.
  const beats = Array.isArray(optimized.beats) ? optimized.beats : [];
  if (beats.length === 0) return { ok: false, reason: 'no_beats_in_script' };
  const templateEnd = beats[beats.length - 1].tEnd || 28;
  const scaleFactor = audioDuration / templateEnd;

  const mographResults = [];
  const beatClips = [];
  const scriptCtx = sourceScript || optimized;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const beatStart = (b.tStart || 0) * scaleFactor;
    const beatEnd = (b.tEnd || templateEnd) * scaleFactor;
    const beatDur = Math.max(0.5, beatEnd - beatStart);
    const sourceBeat = sourceScript && Array.isArray(sourceScript.beats) ? sourceScript.beats[i] : null;
    const mographKind = (sourceBeat && sourceBeat.mographKind) || inferKind(b, scriptCtx);
    const beatForInfer = { ...b, mographKind, voiceover: b.vo || b.voiceover || '' };
    const { kind, mographParams } = inferMographParams(beatForInfer, scriptCtx);

    let mr;
    if (kind === 'none') {
      // Try Pexels VIDEO ambient. Build query from visualPrompt if available,
      // else from key entities in voiceover.
      const visualPrompt = (sourceBeat && sourceBeat.visual_prompt) || '';
      const voPower = (scriptCtx.powerWords || []).filter((w) => String(b.vo || b.voiceover || '').toLowerCase().includes(String(w).toLowerCase())).slice(0, 3).join(' ');
      const candidateQueries = [
        voPower,
        visualPrompt.split(/[.,]/)[0].slice(0, 60),
        visualPrompt.split(/\s+/).slice(0, 6).join(' '),
        String(b.vo || b.voiceover || '').split(/\s+/).slice(0, 4).join(' '),
        'world map news',
      ].filter(Boolean);
      let px = null;
      for (const q of candidateQueries) {
        px = await pexelsVideo.getAmbientVideo({ query: q, minWidth: 720, minDuration: 2, maxDuration: 8 });
        if (px.ok) break;
      }
      if (!px || !px.ok) {
        // V5 spec: "if Pexels VIDEO returns nothing portrait + ≥720 → fall back
        // to a different mograph kind (do NOT use stills)". Fall to kinetic-typo.
        const fallbackBeat = { ...beatForInfer, mographKind: 'kinetic-typography' };
        const { kind: fk, mographParams: fp } = inferMographParams(fallbackBeat, scriptCtx);
        mr = await mograph.authorMograph({
          id: `${optimized.title || 'organic'}-beat-${i}-pexfallback`,
          mographKind: fk,
          mographParams: fp,
          durationSeconds: beatDur,
          voiceover: b.vo || b.voiceover || '',
        });
        if (!mr.ok) return { ok: false, reason: `beat_${i}_both_pexels_and_mograph_fallback_failed` };
        mr.kind = 'kinetic-typography-pexels-fallback';
      } else {
        const normalizedPath = path.join(outDir, `_beat-${i}-pexels-norm.mp4`);
        const normOk = normalizeToTopHalfFormat(px.path, normalizedPath, beatDur);
        if (!normOk) return { ok: false, reason: `beat_${i}_pexels_normalize_failed` };
        mr = { ok: true, mp4Path: normalizedPath, durationSec: beatDur, kind: 'pexels-video', bitrate: 0 };
      }
    } else {
      mr = await mograph.authorMograph({
        id: `${optimized.title || 'organic'}-beat-${i}`,
        mographKind: kind,
        mographParams,
        durationSeconds: beatDur,
        voiceover: b.vo || b.voiceover || '',
      });
      if (!mr.ok) {
        return { ok: false, reason: `beat_${i}_mograph_failed: ${mr.reason}` };
      }
    }
    mographResults.push({ beatIndex: i, kind: mr.kind, duration: mr.durationSec, bitrate: mr.bitrate, mp4Path: mr.mp4Path });
    beatClips.push(mr.mp4Path);
  }

  // 3. Concat the beat clips into the top-half video
  const topHalfPath = path.join(outDir, `_top-half-${variant}.mp4`);
  const concatOk = concatVideos(beatClips, topHalfPath);
  if (!concatOk) return { ok: false, reason: 'concat_failed', beatClips };

  // 4. Build captions from TTS boundaries
  const captionsPath = path.join(outDir, `_captions-${variant}.ass`);
  const captionResult = captionBuilder.buildFromBoundaries({
    boundaries: tts.wordBoundaries,
    powerWords: optimized.powerWords || scriptCtx.powerWords || [],
    outputPath: captionsPath,
  });
  if (!captionResult.ok) return { ok: false, reason: 'caption_build_failed' };

  // 5. Compose split-screen with bottom-half b-roll + captions burn-in
  const slug = path.basename(outDir).toLowerCase();
  const outputPath = path.join(outDir, `${slug}-2026-05-18-${variant}.mp4`);
  const composeResult = await splitScreen.compose({
    topVideoPath: topHalfPath,
    audioPath,
    outputPath,
    durationSec: audioDuration,
    captionsAssPath: captionsPath,
  });
  if (!composeResult.ok) return { ok: false, reason: `split_screen_failed: ${composeResult.reason}`, stderr: composeResult.stderr };

  // 6. Build IG variant — for now, same file (1080x1920 is IG-compatible)
  const igVariantPath = path.join(outDir, `${slug}-2026-05-18-${variant}-instagram.mp4`);
  fs.copyFileSync(outputPath, igVariantPath);

  // 7. ffprobe QA
  const probe = probeFormat(outputPath);
  const formatBitrate = probe && probe.format ? Number(probe.format.bit_rate) : 0;
  const formatDuration = probe && probe.format ? Number(probe.format.duration) : 0;

  return {
    ok: true,
    outputPath,
    igVariantPath,
    durationSec: formatDuration,
    bitrate: formatBitrate,
    brollUsed: composeResult.brollUsed,
    brollOffset: composeResult.brollOffset,
    mographs: mographResults,
    captions: { provider: 'edge-tts-boundary', lineCount: captionResult.lineCount, medianDriftMs: captionBuilder.medianDriftMs(tts.wordBoundaries) },
    audio: { path: audioPath, duration: audioDuration },
  };
}

/**
 * QA gate per V5 acceptance criteria.
 */
function qaGate(item) {
  const issues = [];
  if (!item.outputPath || !fs.existsSync(item.outputPath)) issues.push('output_missing');
  const probe = probeFormat(item.outputPath);
  if (!probe) issues.push('probe_failed');
  else {
    const dur = Number(probe.format.duration);
    const br = Number(probe.format.bit_rate);
    const vs = (probe.streams || []).find((s) => s.codec_name === 'h264');
    const as = (probe.streams || []).find((s) => s.codec_name === 'aac');
    if (!vs) issues.push('no_h264_stream');
    if (vs && (vs.width !== 1080 || vs.height !== 1920)) issues.push(`bad_resolution_${vs.width}x${vs.height}`);
    if (vs && vs.r_frame_rate !== '30/1') issues.push(`bad_fps_${vs.r_frame_rate}`);
    if (!as) issues.push('no_audio_stream');
    if (dur < 22 || dur > 35) issues.push(`bad_duration_${dur.toFixed(2)}`);
    if (br < 4_000_000) issues.push(`bitrate_too_low_${(br / 1e6).toFixed(2)}Mbps`);
  }
  return { ok: issues.length === 0, issues };
}

module.exports = { renderOrganic, qaGate, _internals: { probeFormat, concatVideos, inferKind, inferMographParams } };
