/**
 * lib/esrgan-upscaler.js — Phase 6.3
 *
 * Wraps `D:\AI_Tools\realesrgan\realesrgan-ncnn-vulkan.exe`. Two modes:
 *
 *   upscaleImage(inPath, outPath, opts)
 *     → upscale a single still (PNG/JPG). Used by the organic lane when a
 *       FLUX still scores low on sharpness (Laplacian variance < 100).
 *
 *   upscaleVideo(inPath, outPath, opts)
 *     → upscale every frame of a video. Used by the CLIP lane to rescue
 *       sub-720p creator sources that otherwise get rejected by
 *       `assessSourceQuality`.
 *
 * Real-ESRGAN is Vulkan-accelerated (no CUDA needed), so it runs on the
 * 4GB GTX 1650 without contending with Remotion's chrome-headless-shell.
 *
 * The binary takes -n <model_name> for the model. Default
 * `realesr-animevideov3` is best for stylized content; `realesrgan-x4plus`
 * is best for photographic / real-world video — we use the latter.
 *
 * Note: video mode does NOT preserve audio. Caller is responsible for
 * extracting + remuxing audio if needed (clip-source-fetcher already
 * handles its own audio pipeline downstream).
 */

'use strict';

require('./env-d-drive-only');

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ESRGAN_BIN = process.env.ESRGAN_BIN || 'D:\\AI_Tools\\realesrgan\\realesrgan-ncnn-vulkan.exe';

function isAvailable() {
  return fs.existsSync(ESRGAN_BIN);
}

/**
 * upscaleImage(inPath, outPath, { scale=2, model='realesrgan-x4plus' })
 */
function upscaleImage(inPath, outPath, opts = {}) {
  if (!isAvailable()) return { ok: false, reason: 'esrgan_binary_missing: ' + ESRGAN_BIN };
  if (!fs.existsSync(inPath)) return { ok: false, reason: 'input_missing: ' + inPath };
  const scale = opts.scale || 2;
  const model = opts.model || 'realesrgan-x4plus';
  try { fs.mkdirSync(path.dirname(outPath), { recursive: true }); } catch (_) {}

  const args = ['-i', inPath, '-o', outPath, '-s', String(scale), '-n', model];
  const r = spawnSync(ESRGAN_BIN, args, { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  if (r.status !== 0 || !fs.existsSync(outPath)) {
    return { ok: false, reason: `esrgan_image_exit_${r.status}: ${(r.stderr || '').slice(-200)}` };
  }
  return { ok: true, path: outPath, scale, model };
}

/**
 * upscaleVideo(inPath, outPath, { scale=2 })
 *
 * Strategy: extract frames → upscale each frame with ESRGAN → re-encode
 * to MP4. Audio is dropped (caller can remux).
 *
 * This is SLOW (~10s/frame on the 4GB box) — used ONLY for source-rescue
 * (sub-720p → 1080p) when the source content is otherwise excellent.
 * NOT a per-render step on every batch.
 */
async function upscaleVideo(inPath, outPath, opts = {}) {
  if (!isAvailable()) return { ok: false, reason: 'esrgan_binary_missing' };
  if (!fs.existsSync(inPath)) return { ok: false, reason: 'input_missing' };
  const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
  const FFPROBE = (() => { try { return require('ffprobe-static').path; } catch (_) { return 'ffprobe'; } })();
  const tmpRoot = process.env.TEMP || path.join(ROOT, '.runtime-cache', 'tmp');
  const sessionDir = path.join(tmpRoot, `esrgan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const framesIn = path.join(sessionDir, 'in');
  const framesOut = path.join(sessionDir, 'out');
  fs.mkdirSync(framesIn, { recursive: true });
  fs.mkdirSync(framesOut, { recursive: true });

  try {
    // 1. Extract frames at source FPS (probe first).
    const probeR = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=nokey=1:noprint_wrappers=1', inPath], { encoding: 'utf8' });
    let fps = 30;
    const m = String(probeR.stdout || '').match(/^(\d+)\/(\d+)/);
    if (m) fps = Math.round(Number(m[1]) / Number(m[2]) || 30);
    console.log(`[esrgan-video] source fps=${fps}; extracting frames...`);

    const extract = spawnSync(FFMPEG, ['-y', '-i', inPath, '-vsync', '0', '-q:v', '2', path.join(framesIn, 'f-%06d.png')], { encoding: 'utf8' });
    if (extract.status !== 0) return { ok: false, reason: 'frame_extract_failed' };

    // 2. Upscale every frame.
    const scale = opts.scale || 2;
    const model = opts.model || 'realesrgan-x4plus';
    const list = fs.readdirSync(framesIn).filter((f) => f.endsWith('.png'));
    console.log(`[esrgan-video] upscaling ${list.length} frames (${scale}x, ${model})...`);
    const t0 = Date.now();
    const r = spawnSync(ESRGAN_BIN, ['-i', framesIn, '-o', framesOut, '-s', String(scale), '-n', model], { encoding: 'utf8', timeout: 60 * 60 * 1000 });
    if (r.status !== 0) return { ok: false, reason: `esrgan_batch_exit_${r.status}: ${(r.stderr || '').slice(-200)}` };
    console.log(`[esrgan-video] upscale done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // 3. Re-encode frames → MP4. No audio.
    const encode = spawnSync(FFMPEG, [
      '-y', '-framerate', String(fps), '-i', path.join(framesOut, 'f-%06d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20',
      outPath,
    ], { encoding: 'utf8' });
    if (encode.status !== 0 || !fs.existsSync(outPath)) {
      return { ok: false, reason: 'reencode_failed' };
    }
    return { ok: true, path: outPath, frameCount: list.length, scale, model };
  } finally {
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { upscaleImage, upscaleVideo, isAvailable };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--image' && args[1] && args[2]) {
    const r = upscaleImage(args[1], args[2], { scale: Number(args[3]) || 2 });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }
  if (args[0] === '--video' && args[1] && args[2]) {
    upscaleVideo(args[1], args[2], { scale: Number(args[3]) || 2 }).then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    });
    return;
  }
  console.log('Usage:');
  console.log('  node lib/esrgan-upscaler.js --image <in.png> <out.png> [scale=2]');
  console.log('  node lib/esrgan-upscaler.js --video <in.mp4> <out.mp4> [scale=2]');
  console.log('  available:', isAvailable() ? 'yes (' + ESRGAN_BIN + ')' : 'no');
}
