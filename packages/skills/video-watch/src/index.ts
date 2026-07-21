// video-watch/src/index.ts — File watcher + auto-QA for video renders
import * as fs from 'fs';
import * as path from 'path';

import { safeExec, SafeExecOptions } from '@antigravity/security';
import { validateDrivePath, getRenderPath } from '@antigravity/config';
import { logger, sleep } from '@antigravity/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface QaResult {
  passed: boolean;
  issues: string[];
  metadata?: VideoMetadata;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  fileSize: number;
}

export interface WatchOptions {
  intervalMs?: number;
  onVideoDetected?: (videoPath: string) => void;
  onQaCompleted?: (result: QaResult & { videoPath: string }) => void;
}

// ============================================================================
// VIDEO ANALYSIS (via ffprobe)
// ============================================================================

/**
 * Extract metadata from a video file using ffprobe.
 * Returns duration, dimensions, audio presence, and file size.
 */
export async function analyzeVideo(videoPath: string) {
  validateDrivePath(videoPath);

  // ffprobe -v quiet -print_format json -show_streams <file>
  const options: SafeExecOptions = { timeout: 30000 };
  const result = await safeExec(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', videoPath],
    options
  );

  if (result.exitCode !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr}`);
  }

  const data = JSON.parse(result.stdout);
  const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
  const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');

  return {
    duration: parseFloat(videoStream?.duration) || 0,
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    hasAudio: !!audioStream,
    fileSize: fs.statSync(videoPath).size,
  };
}

// ============================================================================
// QA LOGIC
// ============================================================================

export async function runQa(videoPath: string): Promise<QaResult> {
  const issues: string[] = [];
  let metadata: VideoMetadata | undefined;

  try {
    metadata = await analyzeVideo(videoPath);
  } catch (err) {
    return {
      passed: false,
      issues: [`Failed to analyze video: ${err}`],
    };
  }

  // Check 1: File size > 10KB
  if (metadata.fileSize < 10_000) {
    issues.push('File size too small (likely empty render)');
  }

  // Check 2: Audio track must exist
  if (!metadata.hasAudio) {
    issues.push('Missing audio track');
  }

  // Check 3: Duration must be > 0
  if (metadata.duration <= 0) {
    issues.push('Invalid or zero duration');
  }

  // TODO: Check 4 — Black frame detection (first 2s)
  // Requires frame extraction, skipped for now

  return {
    passed: issues.length === 0,
    issues,
    metadata,
  };
}

// ============================================================================
// FILE WATCHER
// ============================================================================

/**
 * Start watching a directory for new .mp4 files.
 * Runs QA automatically when a file is detected.
 */
export function startWatching(
  dirPath: string,
  options: WatchOptions = {}
) {
  const {
    intervalMs = 5000,
    onVideoDetected,
    onQaCompleted,
  } = options;

  validateDrivePath(dirPath);

  const knownFiles = new Set<string>();
  let running = true;

  // Scan loop
  const scan = async () => {
    while (running) {
      try {
        const files = await fs.promises.readdir(dirPath);
        const mp4Files = files.filter(f => f.endsWith('.mp4'));

        for (const file of mp4Files) {
          const fullPath = path.join(dirPath, file);
          if (knownFiles.has(fullPath)) continue;

          knownFiles.add(fullPath);
          logger.info('New video detected', { path: fullPath });

          if (onVideoDetected) onVideoDetected(fullPath);

          // Run QA
          const result = await runQa(fullPath);
          if (onQaCompleted) {
            onQaCompleted({ ...result, videoPath: fullPath });
          }

          if (!result.passed) {
            logger.warn('QA failed for video', {
              path: fullPath,
              issues: result.issues,
            });
          }
        }
      } catch (err) {
        logger.error('Watcher error', { error: String(err), dirPath });
      }

      await sleep(intervalMs);
    }
  };

  // Start in background
  const promise = scan();

  return {
    close: () => {
      running = false;
      // Allow current iteration to finish
    },
    // Exposed for testing
    _promise: promise,
  };
}

// ============================================================================
// BACKGROUND WATCHER STARTUP
// ============================================================================

/** Auto-start watching the configured render directory */
export function startDefaultWatcher(options: WatchOptions = {}) {
  const renderDir = getRenderPath();
  logger.info('Starting Video Watch on render directory', { renderDir });
  return startWatching(renderDir, options);
}
