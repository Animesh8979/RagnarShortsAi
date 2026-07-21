// video-vision/src/types.ts — Shared types for frame-level video analysis

/** Per-frame luminance statistics extracted from a sampled pixel grid. */
export interface FrameStats {
  /** Frame index within the extraction stream (0-based). */
  index: number;
  /** Timestamp in seconds from the start of the video. */
  timeSec: number;
  /** Mean luminance 0-255. */
  meanLuma: number;
  /** Std-dev of luminance — flat frames (freeze/solid color) collapse near 0. */
  stdLuma: number;
  /** Fraction of pixels below 8/255 — near-black. */
  blackRatio: number;
  /** Fraction of pixels above 247/255 — near-white/clipped. */
  whiteRatio: number;
  /** Mean saturation 0-1 (HSV S channel). */
  meanSat: number;
  /** Histogram of luminance in 16 bins, each 0-1 of the frame. */
  lumaBins: number[];
  /** Mean luminance of the top edge band (letterbox/crop detector). */
  edgeTopLuma: number;
  /** Mean luminance of the bottom edge band. */
  edgeBottomLuma: number;
  /** Mean luminance of the left edge band. */
  edgeLeftLuma: number;
  /** Mean luminance of the right edge band. */
  edgeRightLuma: number;
}

/** Aggregate metadata about the container stream. */
export interface VideoMeta {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  hasAudio: boolean;
  fileSizeBytes: number;
  /** Display aspect ratio (width/height), e.g. 0.5625 for 9:16. */
  aspectRatio: number;
}

export type IssueSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface FlawIssue {
  /** Stable machine id, e.g. "black_frame_opening". */
  code: string;
  severity: IssueSeverity;
  /** Human-readable explanation of the flaw. */
  message: string;
  /** Timestamps (seconds) where the issue manifests, for targeted review. */
  timecodes?: number[];
}

export interface VisionReport {
  videoPath: string;
  meta: VideoMeta;
  frames: FrameStats[];
  issues: FlawIssue[];
  /** Overall verdict used by the pipeline gate. */
  passed: boolean;
  /** 0-100 score blending all checks — higher is better. */
  qualityScore: number;
  /** When the analysis ran. */
  analyzedAt: string;
}

/** Options controlling how aggressively we sample the video. */
export interface AnalyzeOptions {
  /** Target frames-per-second to sample. Lower = faster, coarser. Default 2. */
  sampleFps?: number;
  /** Downscale target width before pixel analysis. Default 320. */
  analysisWidth?: number;
  /** If true, also run text-region legibility estimate. Default false (costs more). */
  checkTextLegibility?: boolean;
  /** Expected aspect ratio; warn if render deviates. Default 0.5625 (9:16). */
  expectedAspectRatio?: number;
  /** Expected duration in seconds; warn if off by more than tolerance. */
  expectedDurationSec?: number;
  /** Tolerance fraction for duration check. Default 0.05 (±5%). */
  durationTolerance?: number;
}
