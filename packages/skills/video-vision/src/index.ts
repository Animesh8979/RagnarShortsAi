// video-vision/src/index.ts — Public API of the @antigravity/sk-video-vision skill
//
// Exports:
//   - analyzeVideo(path, options): full VisionReport (container + frame flaws)
//   - probeVideo(path): container metadata only (cheap)
//   - extractFrameStats(path, cfg): raw per-frame statistics
//   - analyze(...): run detectors over already-extracted stats (pure)
//
// The skill is dependency-light: only @antigravity/security + @antigravity/utils,
// plus ffmpeg/ffprobe on PATH. No native OpenCV — frame stats are computed in JS
// from a raw rgb24 stream pinned to a configurable resolution.

export { probeVideo, extractFrameStats } from './extractor.js';
export { analyze } from './analyzer.js';

import { probeVideo, extractFrameStats } from './extractor.js';
import { analyze } from './analyzer.js';
import type { VisionReport, AnalyzeOptions } from './types.js';
import { validateDrivePath } from '@antigravity/config';
import { logger } from '@antigravity/utils';
import { safeExec } from '@antigravity/security';

/**
 * Run a full video-vision analysis: probe container, extract sampled frames,
 * compute per-frame statistics, and run all flaw detectors. Returns a VisionReport
 * with a boolean `passed` (the pipeline gate) and a 0-100 `qualityScore`.
 */
export async function analyzeVideo(
  videoPath: string,
  opts: AnalyzeOptions = {}
): Promise<VisionReport> {
  const resolved = validateDrivePath(videoPath);
  logger.info('video-vision: analyzing', { path: resolved });

  const meta = await probeVideo(resolved);
  const frames = await extractFrameStats(resolved, {
    sampleFps: opts.sampleFps ?? 2,
    analysisWidth: opts.analysisWidth ?? 320,
  });

  const report = analyze(resolved, meta, frames, {
    ...opts,
    analysisWidth: opts.analysisWidth ?? 320,
    sampleFps: opts.sampleFps ?? 2,
    checkTextLegibility: opts.checkTextLegibility ?? true,
    expectedAspectRatio: opts.expectedAspectRatio ?? 0.5625,
    expectedDurationSec: opts.expectedDurationSec ?? 0,
    durationTolerance: opts.durationTolerance ?? 0.05,
  });

  logger.info('video-vision: complete', {
    passed: report.passed,
    score: report.qualityScore,
    issues: report.issues.length,
  });
  return report;
}

/**
 * Convenience: write a JSON report next to the video.
 */
export async function analyzeAndReport(
  videoPath: string,
  reportPath: string,
  opts: AnalyzeOptions = {}
): Promise<VisionReport> {
  const report = await analyzeVideo(videoPath, opts);
  const resolved = validateDrivePath(reportPath);
  const { writeFile } = await import('@antigravity/utils');
  writeFile(resolved, JSON.stringify(report, null, 2));
  return report;
}

// Re-export select types for tools consuming the API.
export type { VisionReport, AnalyzeOptions, IssueSeverity, FlawIssue, VideoMeta, FrameStats } from './types.js';
