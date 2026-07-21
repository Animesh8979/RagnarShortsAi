// video-vision/src/analyzer.ts — Flaw detectors produce a VisionReport
// Each detector targets a concrete class of Remotion-render flaw:
//   - black/white freeze frames (composition never started, or stuck overlay)
//   - frozen segments (identical consecutive frames — render hang)
//   - letterbox / pillarbox bands (wrong aspect after render)
//   - aspect-ratio deviation vs target platform (9:16 for Shorts/Reels)
//   - black-frame opening/closing (bad fade timing)
//   - brightness drift / clipping
//   - text-region legibility (luminance contrast where text overlay sits)
//   - duration mismatch vs expected
//   - missing audio / size / audio-sync (delegated container checks surfaced here)

import { VideoMeta, FrameStats, FlawIssue, VisionReport, AnalyzeOptions, IssueSeverity } from './types.js';
import { median } from './extractor.js';

const DEFAULTS: Required<AnalyzeOptions> = {
  sampleFps: 2,
  analysisWidth: 320,
  checkTextLegibility: true,
  expectedAspectRatio: 0.5625, // 9:16
  expectedDurationSec: 0,      // 0 = skip check
  durationTolerance: 0.05,
};

export function analyze(
  videoPath: string,
  meta: VideoMeta,
  frames: FrameStats[],
  optsIn: AnalyzeOptions = {}
): VisionReport {
  const opts = { ...DEFAULTS, ...optsIn } as Required<AnalyzeOptions>;
  const issues: FlawIssue[] = [];

  // --- container checks -----------------------------------------------------
  if (meta.fileSizeBytes < 10_000) {
    issues.push({
      code: 'tiny_file',
      severity: 'critical',
      message: 'Render file is under 10KB — almost certainly an empty or aborted render.',
    });
  }
  if (!meta.hasAudio) {
    issues.push({
      code: 'missing_audio',
      severity: 'error',
      message: 'No audio stream present — narration/music track was not muxed.',
    });
  }
  if (meta.durationSec <= 0) {
    issues.push({
      code: 'zero_duration',
      severity: 'critical',
      message: 'Duration reported as 0 — container is unreadable.',
    });
  }

  // aspect ratio deviation
  if (opts.expectedAspectRatio > 0 && meta.aspectRatio > 0) {
    const dev = Math.abs(meta.aspectRatio - opts.expectedAspectRatio) / opts.expectedAspectRatio;
    if (dev > 0.03) {
      issues.push({
        code: 'aspect_ratio_wrong',
        severity: dev > 0.08 ? 'error' : 'warn',
        message:
          `Aspect ratio ${meta.aspectRatio.toFixed(3)} deviates ${ (dev * 100).toFixed(1) }% from expected ${opts.expectedAspectRatio.toFixed(3)} (9:16). Will trigger letterboxing on Shorts/Reels.`,
      });
    }
  }

  // duration tolerance
  if (opts.expectedDurationSec > 0 && meta.durationSec > 0) {
    const dev = Math.abs(meta.durationSec - opts.expectedDurationSec);
    const tol = opts.expectedDurationSec * opts.durationTolerance;
    if (dev > tol) {
      issues.push({
        code: 'duration_mismatch',
        severity: 'warn',
        message: `Duration ${meta.durationSec.toFixed(2)}s differs from expected ${opts.expectedDurationSec}s by ${dev.toFixed(2)}s (tolerance ±${tol.toFixed(2)}s).`,
      });
    }
  }

  // --- frame checks --------------------------------------------------------
  if (frames.length === 0) {
    issues.push({
      code: 'no_frames_extracted',
      severity: 'critical',
      message: 'ffmpeg returned no analysable frames. The render may be corrupt or use an unsupported codec.',
    });
  } else {
    detectBlackFramesOpenClose(frames, issues);
    detectFreezeFrames(frames, issues);
    detectLetterboxBands(frames, issues);
    detectBrightnessDrift(frames, issues);
    detectClipping(frames, issues);
    detectLowSaturation(frames, issues);
    if (opts.checkTextLegibility) detectTextLegibility(frames, issues);
    detectFlicker(frames, issues);
  }

  // --- verdict + score -----------------------------------------------------
  const severityPenalty: Record<IssueSeverity, number> = {
    info: 0, warn: 6, error: 18, critical: 40,
  };
  let penalty = issues.reduce((acc, i) => acc + severityPenalty[i.severity], 0);
  const qualityScore = Math.max(0, Math.min(100, 100 - penalty));
  const passed = !issues.some((i) => i.severity === 'error' || i.severity === 'critical');

  return {
    videoPath,
    meta,
    frames,
    issues,
    passed,
    qualityScore,
    analyzedAt: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------------------
// Detectors
// ----------------------------------------------------------------------------

function detectBlackFramesOpenClose(frames: FrameStats[], issues: FlawIssue[]): void {
  const opening = frames.filter((f) => f.timeSec < 2.5);
  const openingBlack = opening.filter((f) => f.blackRatio > 0.92 && f.meanLuma < 10);
  if (openingBlack.length >= 2) {
    issues.push({
      code: 'black_frame_opening',
      severity: 'error',
      message: `Render opens with ${openingBlack.length} near-black frames in first 2.5s. Fade-in overlay may be covering the whole frame or composition failed to start.`,
      timecodes: openingBlack.map((f) => f.timeSec),
    });
  }

  const closing = frames.filter((f) => f.timeSec > (frames[frames.length - 1].timeSec - 2.5));
  const closingBlack = closing.filter((f) => f.blackRatio > 0.92 && f.meanLuma < 10);
  if (closingBlack.length >= 3) {
    issues.push({
      code: 'black_frame_closing',
      severity: 'warn',
      message: `Render ends with ${closingBlack.length} black frames — fade-out may extend too long, killing the final call-to-action.`,
      timecodes: closingBlack.map((f) => f.timeSec),
    });
  }
}

function detectFreezeFrames(frames: FrameStats[], issues: FlawIssue[]): void {
  // Two consecutive frames with near-zero std luma AND near-identical mean = a freeze.
  const frozenRanges: [number, number][] = [];
  let start = -1;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const meanDelta = Math.abs(cur.meanLuma - prev.meanLuma);
    const stdDelta = Math.abs(cur.stdLuma - prev.stdLuma);
    const isFrozen =
      cur.stdLuma < 1.5 && prev.stdLuma < 1.5 && meanDelta < 1.0 && stdDelta < 1.0;
    if (isFrozen) {
      if (start === -1) start = i - 1;
    } else {
      if (start !== -1) {
        const spanTime = frames[i - 1].timeSec - frames[start].timeSec;
        if (spanTime > 1.2) frozenRanges.push([frames[start].timeSec, frames[i - 1].timeSec]);
        start = -1;
      }
    }
  }
  if (start !== -1) {
    const spanTime = frames[frames.length - 1].timeSec - frames[start].timeSec;
    if (spanTime > 1.2) frozenRanges.push([frames[start].timeSec, frames[frames.length - 1].timeSec]);
  }
  if (frozenRanges.length) {
    issues.push({
      code: 'freeze_frame',
      severity: 'error',
      message: `Detected ${frozenRanges.length} frozen segment(s) longer than 1.2s. Render appears to hang — a Remotion Sequence may have no durationInFrames, or a still image Sequence overran.`,
      timecodes: frozenRanges.map((r) => r[0]),
    });
  }
}

function detectLetterboxBands(frames: FrameStats[], issues: FlawIssue[]): void {
  // A letterbox band is a uniform near-black (or uniform near-white) bar on edges
  // that persists across most of the video — means the inner content has been
  // scaled into only the central portion.
  const edgeBlackFrames = frames.filter((f) =>
    f.edgeTopLuma < 12 && f.edgeBottomLuma < 12 &&
    f.edgeLeftLuma < 12 && f.edgeRightLuma < 12
  );
  const ratio = edgeBlackFrames.length / Math.max(1, frames.length);
  if (ratio > 0.6) {
    issues.push({
      code: 'letterbox_bands',
      severity: 'error',
      message: `${(ratio * 100).toFixed(0)}% of frames show uniform dark edge bands on all four sides — content is being rendered into a smaller box than the canvas. Likely an aspect-ratio mismatch between the @{remotion composition width/height and the source footage.`,
    });
  }
  // vertical-only pillarbox (left+right black, content centered) -
  // happens when a 16:9 source is placed in 9:16 without scaling.
  const pillarboxFrames = frames.filter((f) =>
    f.edgeLeftLuma < 12 && f.edgeRightLuma < 12 &&
    f.edgeTopLuma > 40 && f.edgeBottomLuma > 40
  );
  if (pillarboxFrames.length / Math.max(1, frames.length) > 0.5) {
    issues.push({
      code: 'pillarbox_bands',
      severity: 'warn',
      message: 'Persistent pillarbox bars on left/right edges — 16:9 content embedded in a 9:16 composition without vertical fill. Adds ugly black bars to Shorts/Reels.',
    });
  }
}

function detectBrightnessDrift(frames: FrameStats[], issues: FlawIssue[]): void {
  const lumaSeries = frames.map((f) => f.meanLuma);
  const med = median(lumaSeries);
  // overall darkness
  if (med < 25) {
    issues.push({
      code: 'too_dark',
      severity: 'warn',
      message: `Median frame luminance is ${med.toFixed(1)}/255 — render looks muddy. Background gradient may be too aggressive or black overlay never lifted.`,
    });
  }
  if (med > 240) {
    issues.push({
      code: 'too_bright',
      severity: 'warn',
      message: `Median luminance ${med.toFixed(1)}/255 — frame is overexposed/white.`,
    });
  }
  // gradual drift across the video (sudden dimming) -
  // compare first 20% quartile to last 20% quartile.
  const q = Math.max(3, Math.floor(frames.length / 5));
  const firstMed = median(frames.slice(0, q).map((f) => f.meanLuma));
  const lastMed = median(frames.slice(-q).map((f) => f.meanLuma));
  if (Math.abs(firstMed - lastMed) > 60) {
    issues.push({
      code: 'brightness_drift',
      severity: 'warn',
      message: `Brightness drifts from ${firstMed.toFixed(0)} to ${lastMed.toFixed(0)} luminance across the video — mood transitions may be over-darkening the final CTA.`,
    });
  }
}

function detectClipping(frames: FrameStats[], issues: FlawIssue[]): void {
  const highClip = frames.filter((f) => f.whiteRatio > 0.4);
  if (highClip.length / Math.max(1, frames.length) > 0.3) {
    issues.push({
      code: 'white_clipping',
      severity: 'warn',
      message: `${highClip.length}/${frames.length} sampled frames have >40% near-white pixels — highlights are blown out.`,
      timecodes: highClip.slice(0, 5).map((f) => f.timeSec),
    });
  }
  const hardBlack = frames.filter((f) => f.blackRatio > 0.85);
  if (hardBlack.length >= 1 && hardBlack[0].timeSec < 2) {
    // already reported by black_frame_opening; skip duplicate.
  } else if (hardBlack.length / Math.max(1, frames.length) > 0.4) {
    issues.push({
      code: 'black_crush',
      severity: 'warn',
      message: `Heavy black crush — ${hardBlack.length}/${frames.length} frames are >85% black. Shadow detail is gone.`,
    });
  }
}

function detectLowSaturation(frames: FrameStats[], issues: FlawIssue[]): void {
  const lowSat = frames.filter((f) => f.meanSat < 0.08);
  const ratio = lowSat.length / Math.max(1, frames.length);
  if (ratio > 0.7) {
    issues.push({
      code: 'desaturated',
      severity: 'info',
      message: 'Most frames are near-grayscale (sat <0.08). Intentional? Neutrality is fine, but check that the mood-accent gradient is actually rendering.',
    });
  }
}

function detectTextLegibility(frames: FrameStats[], issues: FlawIssue[]): void {
  // Text overlay sits roughly in the top ~25% (headline) and middle ~42% (captions).
  // We can't OCR, but we CAN require a brightness contrast between the upper third
  // and the frame median — captions floating on a near-equal background are unreadable.
  // Approximation: split sampled frames into "top band luminance" via edgeTop as proxy
  // (since we only kept edge stats). This is a coarse heuristic.
  const lowContrastTop = frames.filter((f) => {
    const topLuma = f.edgeTopLuma;
    const bodyLuma = f.meanLuma;
    return Math.abs(topLuma - bodyLuma) < 18 && topLuma > 80; // bright flat = poor text contrast
  });
  if (lowContrastTop.length / Math.max(1, frames.length) > 0.4) {
    issues.push({
      code: 'text_low_contrast',
      severity: 'info',
      message: 'Headline region brightness is close to the body luminance across much of the video — white text over a bright background may be unreadable. Consider darkening the gradient top or adding a text shadow.',
    });
  }
}

function detectFlicker(frames: FrameStats[], issues: FlawIssue[]): void {
  // Rapid frame-to-frame luminance changes not explained by transitions.
  let bigJumps = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].meanLuma - frames[i - 1].meanLuma);
    if (d > 50) bigJumps++;
  }
  if (bigJumps > frames.length * 0.3 && frames.length > 10) {
    issues.push({
      code: 'flicker',
      severity: 'warn',
      message: `${bigJumps} large luminance jumps between sampled frames — may indicate flickering overlay or an animation timing bug.`,
    });
  }
}
