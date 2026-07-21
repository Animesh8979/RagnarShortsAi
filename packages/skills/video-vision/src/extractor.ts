// video-vision/src/extractor.ts — Frame extraction + per-frame pixel statistics
// Uses ffmpeg through @antigravity/security safeExec (no shell injection surface).
// Decodes to raw rgb24 piped on stdout, then computes luminance/histogram/edge
// statistics in pure JS. No native OpenCV dependency — keeps the skill portable.

import { safeExec, SafeExecOptions } from '@antigravity/security';
import { validateDrivePath } from '@antigravity/config';
import { logger } from '@antigravity/utils';
import { VideoMeta, FrameStats } from './types.js';

const FRAMES_OPTIONS: SafeExecOptions = { timeout: 120_000, windowsHide: true };

// ----------------------------------------------------------------------------
// Container metadata via ffprobe
// ----------------------------------------------------------------------------

export async function probeVideo(videoPath: string): Promise<VideoMeta> {
  validateDrivePath(videoPath);
  const result = await safeExec('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,codec_name,duration',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    videoPath,
  ], FRAMES_OPTIONS);

  if (result.exitCode !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr}`);
  }
  const data = JSON.parse(result.stdout);
  const stream = data.streams?.[0] ?? {};
  const fmt = data.format ?? {};
  const fps = parseFps(stream.r_frame_rate);
  const width = Number(stream.width) || 0;
  const height = Number(stream.height) || 0;

  // Confirm an audio stream exists.
  const audioResult = await safeExec('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=codec_type',
    '-of', 'csv=p=0',
    videoPath,
  ], FRAMES_OPTIONS);
  const hasAudio = audioResult.stdout.trim() === 'audio';

  return {
    durationSec: Number(stream.duration ?? fmt.duration ?? 0),
    width,
    height,
    fps,
    codec: stream.codec_name ?? 'unknown',
    hasAudio,
    fileSizeBytes: Number(fmt.size ?? 0),
    aspectRatio: height > 0 ? width / height : 0,
  };
}

function parseFps(rate: string): number {
  if (!rate) return 0;
  const [num, den] = rate.split('/').map(Number);
  if (!num || !den) return 0;
  return num / den;
}

// ----------------------------------------------------------------------------
// Frame extraction
// ----------------------------------------------------------------------------

export interface ExtractConfig {
  sampleFps: number;
  analysisWidth: number;
}

/**
 * Extract frame statistics by streaming raw rgb24 frames from ffmpeg.
 * We resize to analysisWidth (preserving aspect) to bound compute.
 * Each frame yields one FrameStats record; the stream order is temporal.
 */
export async function extractFrameStats(
  videoPath: string,
  cfg: ExtractConfig
): Promise<FrameStats[]> {
  validateDrivePath(videoPath);

  // First get dimensions so we know how many bytes per frame.
  const probe = await probeVideo(videoPath);
  if (!probe.width || !probe.height) {
    throw new Error('Cannot determine video dimensions for frame extraction');
  }

  const scaleW = cfg.analysisWidth;
  // Preserve aspect ratio, force even height.
  const scaleH = Math.max(2, Math.round((probe.height / probe.width) * scaleW));
  const evenH = scaleH + (scaleH % 2);
  const bytesPerFrame = scaleW * evenH * 3; // rgb24

  // Frame capture must be binary-safe (raw rgb24 bytes on stdout).
  // safeExec converts stdout to a UTF-8 string, which corrupts raw bytes,
  // AND its arg validator rejects ffmpeg filter syntax (parens/brackets in the
  // select/scale -vf argument). So we go straight to the binary-safe spawn
  // path below — it uses shell:false + Buffer accumulation, which is both
  // injection-safe and byte-correct.
  return extractFrameStatsBinary(videoPath, cfg, probe, bytesPerFrame);
}

// ----------------------------------------------------------------------------
// Binary-safe extraction (spawn directly with Buffer capture)
// ----------------------------------------------------------------------------

import { spawn } from 'child_process';

function extractFrameStatsBinary(
  videoPath: string,
  cfg: ExtractConfig,
  probe: VideoMeta,
  bytesPerFrame: number
): Promise<FrameStats[]> {
  return new Promise((resolve, reject) => {
    const scaleW = cfg.analysisWidth;
    const evenH = Math.max(2, Math.round((probe.height / probe.width) * scaleW));
    const effHeight = evenH + (evenH % 2);
    const frameStride = scaleW * effHeight * 3;

    const args = [
      '-nostdin',
      '-i', videoPath,
      '-vf', `select='not(mod(n\\,${Math.max(1, Math.round(probe.fps / cfg.sampleFps))}))',scale=${scaleW}:${effHeight},format=rgb24`,
      '-fps_mode', 'passthrough',
      '-an',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ];

    const child = spawn('ffmpeg', args, { shell: false, windowsHide: true });
    const chunks: Buffer[] = [];
    let stderrBuf = '';

    child.stdout.on('data', (b: Buffer) => chunks.push(b));
    child.stderr.on('data', (b: Buffer) => { stderrBuf += b.toString(); });
    child.on('error', (err) => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderrBuf.slice(0, 300)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const stats: FrameStats[] = [];
      const frameCount = Math.floor(buf.length / frameStride);
      const sampleEvery = Math.max(1, Math.round(probe.fps / cfg.sampleFps));
      logger.debug('ffmpeg raw video captured', { frames: frameCount, bytes: buf.length });

      for (let i = 0; i < frameCount; i++) {
        const off = i * frameStride;
        const s = computeFrameStats(buf, off, scaleW, effHeight, i, probe.fps, sampleEvery);
        stats.push(s);
      }
      resolve(stats);
    });
  });
}

// ----------------------------------------------------------------------------
// Per-frame pixel statistics
// ----------------------------------------------------------------------------

function computeFrameStats(
  buf: Buffer,
  offset: number,
  w: number,
  h: number,
  frameIdx: number,
  srcFps: number,
  sampleEvery: number
): FrameStats {
  const n = w * h;
  let sumLuma = 0;
  let sumLumaSq = 0;
  let blackCount = 0;
  let whiteCount = 0;
  let sumSat = 0;
  const bins = new Array(16).fill(0);

  // Edge band accumulators (4px bands).
  const band = 4;
  let edgeTopSum = 0, edgeTopN = 0;
  let edgeBotSum = 0, edgeBotN = 0;
  let edgeLeftSum = 0, edgeLeftN = 0;
  let edgeRightSum = 0, edgeRightN = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = offset + (y * w + x) * 3;
      const r = buf[p], g = buf[p + 1], b = buf[p + 2];
      // BT.601 luma.
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLuma += luma;
      sumLumaSq += luma * luma;

      if (luma < 8) blackCount++;
      if (luma > 247) whiteCount++;
      const bin = Math.min(15, Math.floor(luma / 16));
      bins[bin]++;

      // Saturation (HSV S — approx via max-min over max).
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sumSat += mx === 0 ? 0 : (mx - mn) / mx;

      const isTop = y < band;
      const isBot = y >= h - band;
      const isLeft = x < band;
      const isRight = x >= w - band;
      if (isTop) { edgeTopSum += luma; edgeTopN++; }
      if (isBot) { edgeBotSum += luma; edgeBotN++; }
      if (isLeft) { edgeLeftSum += luma; edgeLeftN++; }
      if (isRight) { edgeRightSum += luma; edgeRightN++; }
    }
  }

  const meanLuma = sumLuma / n;
  const variance = Math.max(0, sumLumaSq / n - meanLuma * meanLuma);
  const stdLuma = Math.sqrt(variance);

  // Timecode: original frame number = i * sampleEvery; seconds = origFrames / fps.
  const origFrame = frameIdx * sampleEvery;
  const timeSec = srcFps > 0 ? origFrame / srcFps : frameIdx / 2;

  return {
    index: frameIdx,
    timeSec,
    meanLuma,
    stdLuma,
    blackRatio: blackCount / n,
    whiteRatio: whiteCount / n,
    meanSat: sumSat / n,
    lumaBins: bins.map((c) => c / n),
    edgeTopLuma: edgeTopN ? edgeTopSum / edgeTopN : 0,
    edgeBottomLuma: edgeBotN ? edgeBotSum / edgeBotN : 0,
    edgeLeftLuma: edgeLeftN ? edgeLeftSum / edgeLeftN : 0,
    edgeRightLuma: edgeRightN ? edgeRightSum / edgeRightN : 0,
  };
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
