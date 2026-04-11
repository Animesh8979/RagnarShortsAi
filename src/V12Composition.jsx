import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const overlayStyle = {
  boxShadow: 'inset 0 0 150px rgba(0,0,0,0.85)',
};

const backgroundFadeStyle = {
  background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.28) 100%)',
};

const cinematicMediaStyle = {
  filter: 'saturate(1.08) contrast(1.06) brightness(0.95)',
};

const parseInterruptFrame = (entry, fps = 30) => {
  const match = String(entry || '').match(/(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return ((minutes * 60) + seconds) * fps;
};

/**
 * Phase 2B: Enhanced interrupt system supporting 6 interrupt types.
 * Handles both new typed format { frame, type, source } and legacy string format.
 */
const buildInterruptMoments = (patternInterrupts = [], fps = 30) =>
  (Array.isArray(patternInterrupts) ? patternInterrupts : [])
    .map((entry) => {
      // New typed format: { frame: number, type: string, source: string }
      if (entry && typeof entry === 'object' && Number.isFinite(entry.frame)) {
        return {
          frame: entry.frame,
          type: entry.type || 'zoom-pulse',
          source: entry.source || 'auto',
          action: entry.type || 'zoom-pulse',
        };
      }
      // Legacy string format: "00:12 flash"
      const frame = parseInterruptFrame(entry, fps);
      if (!Number.isFinite(frame)) {
        return null;
      }
      return {
        frame,
        type: /flash|cut/.test(String(entry || '')) ? 'flash-cut' : 'zoom-pulse',
        source: 'legacy',
        action: String(entry || '').toLowerCase(),
      };
    })
    .filter(Boolean);

const getInterruptZoomScale = (frame, interruptMoments = []) => {
  return interruptMoments.reduce((bestScale, interrupt) => {
    if (interrupt.type !== 'zoom-snap' && interrupt.type !== 'zoom-pulse') {
      return bestScale;
    }
    const distance = Math.abs(frame - interrupt.frame);
    const isSnap = interrupt.type === 'zoom-snap';
    const range = isSnap ? 8 : 10;
    if (distance > range) {
      return bestScale;
    }
    const burst = isSnap
      ? (distance <= 2
        ? interpolate(distance, [0, 2], [1, 0.9], { extrapolateRight: 'clamp' })
        : interpolate(distance, [2, range], [0.9, 0], { extrapolateRight: 'clamp' }))
      : interpolate(distance, [0, range], [1, 0], { extrapolateRight: 'clamp' });
    const baseScale = isSnap ? 1.12 : 1.04;
    return Math.max(bestScale, 1 + ((baseScale - 1) * burst));
  }, 1);
};

const getInterruptFlashOpacity = (frame, interruptMoments = []) => {
  return interruptMoments.reduce((bestOpacity, interrupt) => {
    if (interrupt.type !== 'flash-cut' && interrupt.type !== 'color-grade-shift') {
      return bestOpacity;
    }
    const distance = Math.abs(frame - interrupt.frame);
    if (distance > 4) {
      return bestOpacity;
    }
    const burst = interpolate(distance, [0, 4], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const amplitude = interrupt.type === 'flash-cut' ? 0.24 : 0.16;
    return Math.max(bestOpacity, amplitude * burst);
  }, 0);
};

/** Camera shake effect for emotion-tagged interrupts */
const getCameraShakeOffset = (frame, interruptMoments = []) => {
  for (const interrupt of interruptMoments) {
    if (interrupt.type !== 'camera-shake') continue;
    const distance = Math.abs(frame - interrupt.frame);
    if (distance > 4) continue;
    const intensity = interpolate(distance, [0, 4], [3, 0], { extrapolateRight: 'clamp' });
    const shakeX = Math.sin(frame * 18) * intensity;
    const shakeY = Math.cos(frame * 22) * intensity;
    return { x: shakeX, y: shakeY };
  }
  return { x: 0, y: 0 };
};

/** Saturation spike for reveal/number interrupts */
const getSaturationSpike = (frame, interruptMoments = []) => {
  for (const interrupt of interruptMoments) {
    if (interrupt.type !== 'saturation-spike') continue;
    const distance = Math.abs(frame - interrupt.frame);
    if (distance > 8) continue;
    const spike = distance <= 3
      ? interpolate(distance, [0, 3], [1.5, 1.25], { extrapolateRight: 'clamp' })
      : interpolate(distance, [3, 8], [1.25, 1.0], { extrapolateRight: 'clamp' });
    return spike;
  }
  return 1.0;
};


const isStoryAnimatedMedia = (media) =>
  Boolean(
    media &&
      media.kind === 'image' &&
      (
        String(media.animationPreset || '').startsWith('story-') ||
        /ai story frame/i.test(String(media.tier || ''))
      )
  );

const getStoryImageMotion = (preset, frame, durationInFrames) => {
  const endFrame = Math.max(1, durationInFrames - 1);
  const midFrame = Math.max(1, Math.floor(endFrame / 2));
  const lateFrame = Math.max(midFrame, Math.floor(endFrame * 0.72));

  switch (preset) {
    case 'story-ai':
      return {
        scale: interpolate(frame, [0, midFrame, endFrame], [1.05, 1.16, 1.22], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, midFrame, endFrame], [-10, 12, -4], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, midFrame, endFrame], [18, -14, -4], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, midFrame, endFrame], [-0.5, 0.35, -0.1], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.08, 0.2], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [34, 64], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.14,
        perspectiveX: interpolate(frame, [0, midFrame, endFrame], [0.6, -0.5, 0.1], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, midFrame, endFrame], [-1.4, 1.2, -0.2], { extrapolateRight: 'clamp' }),
        focusPulse: interpolate(frame, [0, lateFrame, endFrame], [1, 1.02, 1.035], { extrapolateRight: 'clamp' }),
        parallaxScale: interpolate(frame, [0, endFrame], [10, 42], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.24,
        glowSweep: interpolate(frame, [0, endFrame], [32, 68], { extrapolateRight: 'clamp' }),
      };
    case 'story-creep-left':
      return {
        scale: interpolate(frame, [0, endFrame], [1.04, 1.2], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [-42, 10], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [18, -8], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [-1.4, 0.6], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.12, 0.22], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [18, 68], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.12,
        perspectiveX: -0.4,
        perspectiveY: interpolate(frame, [0, endFrame], [2.2, -0.8], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.22,
      };
    case 'story-creep-right':
      return {
        scale: interpolate(frame, [0, endFrame], [1.04, 1.2], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [36, -14], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [14, -10], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [1.3, -0.5], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.11, 0.25], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [72, 28], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.12,
        perspectiveX: 0.35,
        perspectiveY: interpolate(frame, [0, endFrame], [-2, 0.9], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.22,
      };
    case 'story-loom':
      return {
        scale: interpolate(frame, [0, endFrame], [1.0, 1.26], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [0, -6], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [28, -16], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [0.4, -0.4], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.08, 0.18], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [50, 50], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.16,
        perspectiveX: interpolate(frame, [0, endFrame], [0.8, -0.6], { extrapolateRight: 'clamp' }),
        focusPulse: interpolate(frame, [0, lateFrame, endFrame], [1, 1.03, 1.05], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.26,
      };
    case 'story-tilt-rise':
      return {
        scale: interpolate(frame, [0, endFrame], [1.05, 1.16], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [-10, 14], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [34, -22], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [-2.1, 0.8], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.1, 0.22], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [30, 62], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.1,
        perspectiveX: interpolate(frame, [0, endFrame], [-1.2, 0.8], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, endFrame], [-0.5, 1.3], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.18,
      };
    case 'story-drift-close':
      return {
        scale: interpolate(frame, [0, endFrame], [1.1, 1.18], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [-22, 16], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [8, -6], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [-0.8, 0.8], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.12, 0.2], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [22, 58], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.08,
        perspectiveX: interpolate(frame, [0, endFrame], [0.4, -0.4], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, endFrame], [1.4, -1.2], { extrapolateRight: 'clamp' }),
        focusPulse: interpolate(frame, [0, endFrame], [1, 1.015], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.16,
      };
    case 'story-rise-soft':
      return {
        scale: interpolate(frame, [0, endFrame], [1.03, 1.12], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [8, -6], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [30, -18], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [0.7, -0.3], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.08, 0.14], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [62, 46], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.09,
        perspectiveX: interpolate(frame, [0, endFrame], [0.2, -0.2], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, endFrame], [1.1, -0.5], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.14,
      };
    case 'story-reveal-tilt':
      return {
        scale: interpolate(frame, [0, midFrame, endFrame], [1.02, 1.1, 1.18], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [16, -10], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, midFrame, endFrame], [42, 6, -18], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [1.5, -0.6], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.06, 0.18], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [58, 36], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.1,
        perspectiveX: interpolate(frame, [0, endFrame], [-1.6, 0.7], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, endFrame], [0.8, -0.3], { extrapolateRight: 'clamp' }),
        focusPulse: interpolate(frame, [0, endFrame], [1, 1.02], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.18,
        glowSweep: interpolate(frame, [0, endFrame], [62, 42], { extrapolateRight: 'clamp' }),
      };
    case 'story-parallax':
      return {
        scale: interpolate(frame, [0, endFrame], [1.08, 1.14], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, midFrame, endFrame], [-18, 14, -8], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, midFrame, endFrame], [16, -10, 6], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, midFrame, endFrame], [-0.9, 0.5, -0.4], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.1, 0.16], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [40, 60], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.11,
        perspectiveX: interpolate(frame, [0, midFrame, endFrame], [0.7, -0.5, 0.2], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, midFrame, endFrame], [-1.5, 1.2, -0.4], { extrapolateRight: 'clamp' }),
        parallaxScale: interpolate(frame, [0, endFrame], [14, 52], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.22,
        glowSweep: interpolate(frame, [0, endFrame], [36, 64], { extrapolateRight: 'clamp' }),
      };
    case 'story-parallax-push':
      return {
        scale: interpolate(frame, [0, lateFrame, endFrame], [1.06, 1.16, 1.22], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, midFrame, endFrame], [-10, 8, -2], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [24, -12], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [-0.5, 0.25], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.08, 0.2], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [44, 54], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.13,
        perspectiveX: interpolate(frame, [0, endFrame], [0.9, -0.4], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, endFrame], [-1.4, 0.6], { extrapolateRight: 'clamp' }),
        focusPulse: interpolate(frame, [0, lateFrame, endFrame], [1, 1.03, 1.05], { extrapolateRight: 'clamp' }),
        parallaxScale: interpolate(frame, [0, endFrame], [18, 64], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.26,
        glowSweep: interpolate(frame, [0, endFrame], [42, 58], { extrapolateRight: 'clamp' }),
      };
    case 'story-parallax-sway':
      return {
        scale: interpolate(frame, [0, midFrame, endFrame], [1.07, 1.13, 1.16], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, midFrame, endFrame], [-22, 18, -12], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, midFrame, endFrame], [10, -8, 4], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, midFrame, endFrame], [-1.1, 0.7, -0.5], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.08, 0.16], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [26, 68], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.11,
        perspectiveX: interpolate(frame, [0, midFrame, endFrame], [0.5, -0.7, 0.3], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, midFrame, endFrame], [1.5, -1.3, 0.8], { extrapolateRight: 'clamp' }),
        parallaxScale: interpolate(frame, [0, endFrame], [16, 56], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.2,
        glowSweep: interpolate(frame, [0, endFrame], [28, 70], { extrapolateRight: 'clamp' }),
      };
    case 'story-parallax-orbit':
      return {
        scale: interpolate(frame, [0, lateFrame, endFrame], [1.05, 1.14, 1.19], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, midFrame, endFrame], [20, -16, 8], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, midFrame, endFrame], [22, -14, 10], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, midFrame, endFrame], [1.2, -0.8, 0.4], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.1, 0.18], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [64, 30], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.12,
        perspectiveX: interpolate(frame, [0, midFrame, endFrame], [-0.8, 0.9, -0.4], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, midFrame, endFrame], [-1.8, 1.4, -0.7], { extrapolateRight: 'clamp' }),
        focusPulse: interpolate(frame, [0, endFrame], [1, 1.025], { extrapolateRight: 'clamp' }),
        parallaxScale: interpolate(frame, [0, endFrame], [18, 60], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.24,
        glowSweep: interpolate(frame, [0, endFrame], [66, 34], { extrapolateRight: 'clamp' }),
      };
    case 'story-impact-punch':
      return {
        scale: interpolate(frame, [0, midFrame, lateFrame, endFrame], [1.04, 1.12, 1.2, 1.24], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, midFrame, lateFrame, endFrame], [-6, 10, -2, 0], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, midFrame, lateFrame, endFrame], [18, -6, -18, -10], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, midFrame, endFrame], [-0.3, 0.5, -0.1], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.1, 0.24], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [48, 54], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.16,
        perspectiveX: interpolate(frame, [0, endFrame], [0.4, -0.3], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, endFrame], [-0.8, 0.6], { extrapolateRight: 'clamp' }),
        focusPulse: interpolate(frame, [0, lateFrame, endFrame], [1, 1.035, 1.055], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.28,
        glowSweep: 52,
      };
    case 'story-float':
    default:
      return {
        scale: interpolate(frame, [0, midFrame, endFrame], [1.06, 1.15, 1.11], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, midFrame, endFrame], [-14, 12, -5], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, midFrame, endFrame], [10, -8, 4], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, midFrame, endFrame], [-0.8, 0.5, -0.2], { extrapolateRight: 'clamp' }),
        flareOpacity: interpolate(frame, [0, endFrame], [0.1, 0.18], { extrapolateRight: 'clamp' }),
        flareX: interpolate(frame, [0, endFrame], [26, 64], { extrapolateRight: 'clamp' }),
        blurScaleOffset: 0.1,
        perspectiveX: interpolate(frame, [0, midFrame, endFrame], [0.4, -0.4, 0.1], { extrapolateRight: 'clamp' }),
        perspectiveY: interpolate(frame, [0, midFrame, endFrame], [-1.1, 0.9, -0.2], { extrapolateRight: 'clamp' }),
        parallaxScale: interpolate(frame, [0, endFrame], [12, 46], { extrapolateRight: 'clamp' }),
        shadowOpacity: 0.18,
        glowSweep: interpolate(frame, [0, endFrame], [28, 66], { extrapolateRight: 'clamp' }),
      };
  }
};

const getEditorialImageMotion = (variant, frame, durationInFrames) => {
  const endFrame = Math.max(1, durationInFrames - 1);
  const midFrame = Math.max(1, Math.floor(endFrame / 2));

  switch (variant) {
    case 'editorial-pan-left':
      return {
        scale: interpolate(frame, [0, endFrame], [1.04, 1.15], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [22, -18], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [8, -4], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [0.5, -0.35], { extrapolateRight: 'clamp' }),
      };
    case 'editorial-pan-right':
      return {
        scale: interpolate(frame, [0, endFrame], [1.05, 1.16], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [-20, 18], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [10, -6], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [-0.6, 0.3], { extrapolateRight: 'clamp' }),
      };
    case 'editorial-push':
    default:
      return {
        scale: interpolate(frame, [0, midFrame, endFrame], [1.03, 1.12, 1.18], { extrapolateRight: 'clamp' }),
        driftX: interpolate(frame, [0, endFrame], [-8, 8], { extrapolateRight: 'clamp' }),
        driftY: interpolate(frame, [0, endFrame], [12, -10], { extrapolateRight: 'clamp' }),
        rotate: interpolate(frame, [0, endFrame], [-0.25, 0.2], { extrapolateRight: 'clamp' }),
      };
  }
};

const getBackgroundThemeSpec = (themeName) => {
  switch (themeName) {
    case 'story-embers':
      return {
        base: 'linear-gradient(145deg, #090506 0%, #2a0908 34%, #6e1f0e 68%, #f3b66c 100%)',
        wash: 'linear-gradient(180deg, rgba(255, 161, 64, 0.16) 0%, rgba(20, 4, 2, 0.44) 100%)',
        pattern: 'repeating-linear-gradient(125deg, rgba(255, 200, 120, 0.08) 0px, rgba(255, 200, 120, 0.08) 2px, transparent 2px, transparent 26px)',
        edgeGlow: 'radial-gradient(circle at 50% 18%, rgba(255, 190, 92, 0.24) 0%, rgba(255, 190, 92, 0) 48%)',
        orbAColor: 'rgba(255, 140, 52, 0.34)',
        orbBColor: 'rgba(255, 212, 144, 0.24)',
      };
    case 'story-vault':
      return {
        base: 'linear-gradient(145deg, #05060b 0%, #0f1321 32%, #34211b 67%, #b77b52 100%)',
        wash: 'linear-gradient(180deg, rgba(193, 122, 66, 0.16) 0%, rgba(8, 10, 16, 0.42) 100%)',
        pattern: 'repeating-linear-gradient(90deg, rgba(255, 232, 190, 0.06) 0px, rgba(255, 232, 190, 0.06) 1px, transparent 1px, transparent 30px)',
        edgeGlow: 'radial-gradient(circle at 18% 20%, rgba(255, 210, 170, 0.18) 0%, rgba(255, 210, 170, 0) 44%)',
        orbAColor: 'rgba(255, 178, 102, 0.28)',
        orbBColor: 'rgba(112, 78, 52, 0.3)',
      };
    case 'story-shadow':
      return {
        base: 'linear-gradient(155deg, #02040a 0%, #091728 36%, #312033 68%, #8b5e49 100%)',
        wash: 'linear-gradient(180deg, rgba(120, 195, 255, 0.1) 0%, rgba(10, 5, 18, 0.4) 100%)',
        pattern: 'repeating-linear-gradient(140deg, rgba(150, 214, 255, 0.06) 0px, rgba(150, 214, 255, 0.06) 2px, transparent 2px, transparent 24px)',
        edgeGlow: 'radial-gradient(circle at 82% 12%, rgba(158, 214, 255, 0.2) 0%, rgba(158, 214, 255, 0) 40%)',
        orbAColor: 'rgba(96, 178, 255, 0.24)',
        orbBColor: 'rgba(255, 187, 137, 0.16)',
      };
    case 'story-dream':
      return {
        base: 'linear-gradient(145deg, #061018 0%, #113647 34%, #316a6f 68%, #efe2b3 100%)',
        wash: 'linear-gradient(180deg, rgba(188, 247, 255, 0.12) 0%, rgba(6, 14, 18, 0.34) 100%)',
        pattern: 'repeating-linear-gradient(110deg, rgba(215, 255, 250, 0.08) 0px, rgba(215, 255, 250, 0.08) 2px, transparent 2px, transparent 28px)',
        edgeGlow: 'radial-gradient(circle at 52% 16%, rgba(242, 226, 182, 0.26) 0%, rgba(242, 226, 182, 0) 50%)',
        orbAColor: 'rgba(151, 236, 219, 0.26)',
        orbBColor: 'rgba(255, 235, 172, 0.2)',
      };
    case 'story-mist':
      return {
        base: 'linear-gradient(150deg, #07111b 0%, #153148 35%, #50606b 70%, #e7dfc8 100%)',
        wash: 'linear-gradient(180deg, rgba(225, 240, 255, 0.12) 0%, rgba(8, 12, 16, 0.32) 100%)',
        pattern: 'repeating-linear-gradient(95deg, rgba(235, 244, 255, 0.07) 0px, rgba(235, 244, 255, 0.07) 2px, transparent 2px, transparent 32px)',
        edgeGlow: 'radial-gradient(circle at 26% 20%, rgba(214, 238, 255, 0.2) 0%, rgba(214, 238, 255, 0) 42%)',
        orbAColor: 'rgba(177, 216, 255, 0.22)',
        orbBColor: 'rgba(248, 241, 220, 0.2)',
      };
    case 'story-moonlit':
      return {
        base: 'linear-gradient(150deg, #030814 0%, #11284a 40%, #30445e 68%, #b2c1d6 100%)',
        wash: 'linear-gradient(180deg, rgba(185, 219, 255, 0.12) 0%, rgba(4, 8, 18, 0.38) 100%)',
        pattern: 'repeating-linear-gradient(120deg, rgba(210, 228, 255, 0.07) 0px, rgba(210, 228, 255, 0.07) 2px, transparent 2px, transparent 26px)',
        edgeGlow: 'radial-gradient(circle at 70% 14%, rgba(211, 232, 255, 0.22) 0%, rgba(211, 232, 255, 0) 45%)',
        orbAColor: 'rgba(120, 169, 255, 0.22)',
        orbBColor: 'rgba(236, 245, 255, 0.18)',
      };
    case 'story-memory':
      return {
        base: 'linear-gradient(145deg, #14100a 0%, #3d2817 35%, #7b5332 68%, #f0d1a4 100%)',
        wash: 'linear-gradient(180deg, rgba(255, 226, 183, 0.14) 0%, rgba(18, 10, 6, 0.36) 100%)',
        pattern: 'repeating-linear-gradient(100deg, rgba(255, 229, 182, 0.08) 0px, rgba(255, 229, 182, 0.08) 2px, transparent 2px, transparent 30px)',
        edgeGlow: 'radial-gradient(circle at 54% 18%, rgba(255, 213, 156, 0.24) 0%, rgba(255, 213, 156, 0) 48%)',
        orbAColor: 'rgba(255, 191, 126, 0.24)',
        orbBColor: 'rgba(127, 79, 39, 0.24)',
      };
    case 'ai-grid':
      return {
        base: 'linear-gradient(145deg, #041017 0%, #0a2640 34%, #106667 68%, #9ef2df 100%)',
        wash: 'linear-gradient(180deg, rgba(102, 255, 223, 0.16) 0%, rgba(3, 11, 14, 0.38) 100%)',
        pattern: 'repeating-linear-gradient(90deg, rgba(160, 255, 244, 0.08) 0px, rgba(160, 255, 244, 0.08) 1px, transparent 1px, transparent 22px)',
        edgeGlow: 'radial-gradient(circle at 50% 18%, rgba(140, 255, 232, 0.2) 0%, rgba(140, 255, 232, 0) 46%)',
        orbAColor: 'rgba(82, 230, 219, 0.24)',
        orbBColor: 'rgba(156, 255, 211, 0.18)',
      };
    case 'ai-lab':
      return {
        base: 'linear-gradient(150deg, #050816 0%, #0d1f45 34%, #135d7a 67%, #c6f4e5 100%)',
        wash: 'linear-gradient(180deg, rgba(125, 212, 255, 0.14) 0%, rgba(3, 6, 20, 0.38) 100%)',
        pattern: 'repeating-linear-gradient(130deg, rgba(144, 224, 255, 0.08) 0px, rgba(144, 224, 255, 0.08) 2px, transparent 2px, transparent 24px)',
        edgeGlow: 'radial-gradient(circle at 18% 16%, rgba(171, 231, 255, 0.2) 0%, rgba(171, 231, 255, 0) 42%)',
        orbAColor: 'rgba(94, 190, 255, 0.22)',
        orbBColor: 'rgba(196, 255, 233, 0.18)',
      };
    case 'ai-signal':
      return {
        base: 'linear-gradient(145deg, #020d0c 0%, #08362f 35%, #116b54 68%, #c2f7cb 100%)',
        wash: 'linear-gradient(180deg, rgba(121, 255, 163, 0.14) 0%, rgba(4, 12, 8, 0.36) 100%)',
        pattern: 'repeating-linear-gradient(110deg, rgba(179, 255, 198, 0.07) 0px, rgba(179, 255, 198, 0.07) 2px, transparent 2px, transparent 26px)',
        edgeGlow: 'radial-gradient(circle at 74% 16%, rgba(182, 255, 199, 0.22) 0%, rgba(182, 255, 199, 0) 44%)',
        orbAColor: 'rgba(74, 240, 168, 0.24)',
        orbBColor: 'rgba(204, 255, 180, 0.16)',
      };
    case 'geo-alert':
      return {
        base: 'linear-gradient(150deg, #120408 0%, #3c0d15 33%, #7a1c21 67%, #f0aa66 100%)',
        wash: 'linear-gradient(180deg, rgba(255, 110, 88, 0.15) 0%, rgba(19, 6, 8, 0.42) 100%)',
        pattern: 'repeating-linear-gradient(135deg, rgba(255, 185, 134, 0.08) 0px, rgba(255, 185, 134, 0.08) 2px, transparent 2px, transparent 24px)',
        edgeGlow: 'radial-gradient(circle at 50% 18%, rgba(255, 173, 120, 0.22) 0%, rgba(255, 173, 120, 0) 46%)',
        orbAColor: 'rgba(255, 108, 92, 0.28)',
        orbBColor: 'rgba(255, 199, 137, 0.18)',
      };
    case 'geo-radar':
      return {
        base: 'linear-gradient(145deg, #031018 0%, #133048 35%, #244a5c 68%, #c8d8b0 100%)',
        wash: 'linear-gradient(180deg, rgba(203, 255, 168, 0.12) 0%, rgba(4, 10, 16, 0.38) 100%)',
        pattern: 'repeating-linear-gradient(90deg, rgba(206, 255, 171, 0.07) 0px, rgba(206, 255, 171, 0.07) 1px, transparent 1px, transparent 18px)',
        edgeGlow: 'radial-gradient(circle at 22% 16%, rgba(212, 255, 180, 0.2) 0%, rgba(212, 255, 180, 0) 42%)',
        orbAColor: 'rgba(162, 255, 181, 0.2)',
        orbBColor: 'rgba(113, 177, 255, 0.14)',
      };
    case 'geo-map':
      return {
        base: 'linear-gradient(145deg, #07101e 0%, #0e2850 34%, #23436c 67%, #d6c8ad 100%)',
        wash: 'linear-gradient(180deg, rgba(132, 170, 255, 0.12) 0%, rgba(6, 9, 16, 0.38) 100%)',
        pattern: 'repeating-linear-gradient(120deg, rgba(226, 215, 186, 0.08) 0px, rgba(226, 215, 186, 0.08) 2px, transparent 2px, transparent 30px)',
        edgeGlow: 'radial-gradient(circle at 78% 18%, rgba(214, 203, 168, 0.2) 0%, rgba(214, 203, 168, 0) 44%)',
        orbAColor: 'rgba(126, 170, 255, 0.18)',
        orbBColor: 'rgba(228, 213, 172, 0.16)',
      };
    case 'market-pressure':
      return {
        base: 'linear-gradient(145deg, #0b101d 0%, #18243f 33%, #6d2f24 67%, #f2bc72 100%)',
        wash: 'linear-gradient(180deg, rgba(255, 165, 112, 0.14) 0%, rgba(8, 10, 18, 0.38) 100%)',
        pattern: 'repeating-linear-gradient(100deg, rgba(255, 208, 150, 0.08) 0px, rgba(255, 208, 150, 0.08) 2px, transparent 2px, transparent 22px)',
        edgeGlow: 'radial-gradient(circle at 50% 18%, rgba(255, 192, 126, 0.22) 0%, rgba(255, 192, 126, 0) 46%)',
        orbAColor: 'rgba(255, 120, 89, 0.24)',
        orbBColor: 'rgba(121, 168, 255, 0.14)',
      };
    case 'market-night':
      return {
        base: 'linear-gradient(150deg, #040812 0%, #10204f 34%, #22406b 68%, #7fd7c8 100%)',
        wash: 'linear-gradient(180deg, rgba(112, 221, 204, 0.12) 0%, rgba(4, 8, 18, 0.38) 100%)',
        pattern: 'repeating-linear-gradient(90deg, rgba(153, 232, 219, 0.08) 0px, rgba(153, 232, 219, 0.08) 1px, transparent 1px, transparent 20px)',
        edgeGlow: 'radial-gradient(circle at 24% 18%, rgba(128, 216, 205, 0.22) 0%, rgba(128, 216, 205, 0) 44%)',
        orbAColor: 'rgba(86, 173, 255, 0.18)',
        orbBColor: 'rgba(136, 236, 207, 0.18)',
      };
    case 'trend-spotlight':
      return {
        base: 'linear-gradient(145deg, #0d0b11 0%, #231824 34%, #835036 68%, #ffd9a6 100%)',
        wash: 'linear-gradient(180deg, rgba(255, 185, 118, 0.16) 0%, rgba(12, 8, 12, 0.36) 100%)',
        pattern: 'repeating-linear-gradient(120deg, rgba(255, 221, 176, 0.08) 0px, rgba(255, 221, 176, 0.08) 2px, transparent 2px, transparent 28px)',
        edgeGlow: 'radial-gradient(circle at 56% 18%, rgba(255, 216, 163, 0.24) 0%, rgba(255, 216, 163, 0) 48%)',
        orbAColor: 'rgba(255, 154, 102, 0.22)',
        orbBColor: 'rgba(255, 230, 184, 0.18)',
      };
    case 'trend-pulse':
      return {
        base: 'linear-gradient(145deg, #071019 0%, #17314f 34%, #256770 68%, #fff1b8 100%)',
        wash: 'linear-gradient(180deg, rgba(153, 238, 255, 0.14) 0%, rgba(6, 10, 16, 0.34) 100%)',
        pattern: 'repeating-linear-gradient(95deg, rgba(194, 245, 255, 0.08) 0px, rgba(194, 245, 255, 0.08) 2px, transparent 2px, transparent 24px)',
        edgeGlow: 'radial-gradient(circle at 74% 18%, rgba(255, 241, 184, 0.22) 0%, rgba(255, 241, 184, 0) 46%)',
        orbAColor: 'rgba(110, 224, 255, 0.2)',
        orbBColor: 'rgba(255, 222, 140, 0.16)',
      };
    case 'world-wire':
    default:
      return {
        base: 'linear-gradient(145deg, #08121d 0%, #143a52 35%, #3e6b6f 68%, #d1f2ff 100%)',
        wash: 'linear-gradient(180deg, rgba(183, 238, 255, 0.12) 0%, rgba(4, 10, 16, 0.32) 100%)',
        pattern: 'repeating-linear-gradient(110deg, rgba(204, 244, 255, 0.08) 0px, rgba(204, 244, 255, 0.08) 2px, transparent 2px, transparent 28px)',
        edgeGlow: 'radial-gradient(circle at 50% 18%, rgba(209, 242, 255, 0.24) 0%, rgba(209, 242, 255, 0) 48%)',
        orbAColor: 'rgba(121, 220, 244, 0.2)',
        orbBColor: 'rgba(214, 246, 255, 0.18)',
      };
  }
};

const BackgroundWorld = ({ themeName, durationInFrames, mediaKind = 'gradient', mode = 'base' }) => {
  const frame = useCurrentFrame();
  const endFrame = Math.max(1, durationInFrames - 1);
  const midFrame = Math.max(1, Math.floor(endFrame / 2));
  const spec = getBackgroundThemeSpec(themeName);
  const patternX = interpolate(frame, [0, endFrame], [0, 100], { extrapolateRight: 'clamp' });
  const patternY = interpolate(frame, [0, endFrame], [100, 0], { extrapolateRight: 'clamp' });
  const orbAX = interpolate(frame, [0, endFrame], [18, 74], { extrapolateRight: 'clamp' });
  const orbAY = interpolate(frame, [0, midFrame, endFrame], [16, 44, 28], { extrapolateRight: 'clamp' });
  const orbBX = interpolate(frame, [0, endFrame], [80, 28], { extrapolateRight: 'clamp' });
  const orbBY = interpolate(frame, [0, midFrame, endFrame], [78, 42, 68], { extrapolateRight: 'clamp' });
  const pulse = interpolate(frame, [0, midFrame, endFrame], [0.85, 1, 0.9], { extrapolateRight: 'clamp' });
  const baseOpacity = mediaKind === 'gradient' ? 1 : mediaKind === 'image' ? 0.48 : 0.32;
  const washOpacity = mediaKind === 'gradient' ? 0.24 : mediaKind === 'image' ? 0.18 : 0.14;

  if (mode === 'wash') {
    return (
      <AbsoluteFill style={{ opacity: washOpacity, mixBlendMode: 'soft-light' }}>
        <AbsoluteFill style={{ background: spec.wash }} />
        <AbsoluteFill
          style={{
            background: spec.pattern,
            backgroundSize: '180% 180%',
            backgroundPosition: `${patternX}% ${patternY}%`,
            opacity: 0.72,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at ${orbAX}% ${orbAY}%, ${spec.orbAColor} 0%, rgba(0, 0, 0, 0) 46%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity: baseOpacity }}>
      <AbsoluteFill style={{ background: spec.base }} />
      <AbsoluteFill
        style={{
          background: spec.pattern,
          backgroundSize: '200% 200%',
          backgroundPosition: `${patternX}% ${patternY}%`,
          opacity: 0.78,
          mixBlendMode: 'soft-light',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${orbAX}% ${orbAY}%, ${spec.orbAColor} 0%, rgba(0, 0, 0, 0) 52%)`,
          transform: `scale(${1.02 * pulse})`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${orbBX}% ${orbBY}%, ${spec.orbBColor} 0%, rgba(0, 0, 0, 0) 50%)`,
          transform: `scale(${1.08 - ((pulse - 0.85) * 0.4)})`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill style={{ background: spec.edgeGlow }} />
    </AbsoluteFill>
  );
};

const GradientMesh = ({ themeName, durationInFrames, mediaKind = 'gradient' }) => (
  <BackgroundWorld themeName={themeName} durationInFrames={durationInFrames} mediaKind={mediaKind} />
);

const SceneMedia = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const media = scene && scene.media ? scene.media : { kind: 'gradient', src: null };
  const backgroundTheme = scene && scene.backgroundTheme ? scene.backgroundTheme : 'world-wire';

  if (media.kind === 'image') {
    const storyAnimated = isStoryAnimatedMedia(media);
    const zoomFrames = Math.max(1, Math.min(durationInFrames, fps * 10));
    const baseScale = interpolate(frame, [0, zoomFrames - 1], [1, 1.3], {
      extrapolateRight: 'clamp',
    });
    const storyMotion = storyAnimated
      ? getStoryImageMotion(media.animationPreset || 'story-float', frame, durationInFrames)
      : null;
    const editorialMotion = !storyAnimated
      ? getEditorialImageMotion(scene && scene.motionVariant ? scene.motionVariant : 'editorial-push', frame, durationInFrames)
      : null;

    // Ken Burns enhancement: alternate zoom-in/zoom-out per scene index for visual variety
    const sceneIdx = scene && scene.sceneIndex != null ? scene.sceneIndex : 0;
    const kenBurnsDir = sceneIdx % 2 === 0 ? 1 : -1; // alternate zoom direction
    const kenBurnsBoost = !storyAnimated ? interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, kenBurnsDir * 0.04], { extrapolateRight: 'clamp' }) : 0;

    // Scale pulse at scene transitions (first 6 frames of each scene) — creates subtle visual "pop"
    const pulseFrame = frame - (scene && scene.startFrame ? scene.startFrame : 0);
    const scenePulse = pulseFrame >= 0 && pulseFrame < 6
      ? interpolate(pulseFrame, [0, 2, 5], [1.02, 0.98, 1.0], { extrapolateRight: 'clamp' })
      : 1.0;

    const scale = (storyAnimated ? storyMotion.scale : editorialMotion ? editorialMotion.scale : baseScale) + kenBurnsBoost;
    const finalScale = scale * scenePulse;
    const driftX = storyAnimated ? storyMotion.driftX : editorialMotion ? editorialMotion.driftX : 0;
    const driftY = storyAnimated ? storyMotion.driftY : editorialMotion ? editorialMotion.driftY : 0;
    const rotate = storyAnimated ? storyMotion.rotate : editorialMotion ? editorialMotion.rotate : 0;
    const flareOpacity = storyAnimated ? storyMotion.flareOpacity : 0;
    const flareX = storyAnimated ? storyMotion.flareX : 50;
    const blurScaleOffset = storyAnimated ? storyMotion.blurScaleOffset : 0.1;
    const perspectiveX = storyAnimated
      ? (Number.isFinite(Number(storyMotion.perspectiveX)) ? Number(storyMotion.perspectiveX) : driftY * 0.04)
      : 0;
    const perspectiveY = storyAnimated
      ? (Number.isFinite(Number(storyMotion.perspectiveY)) ? Number(storyMotion.perspectiveY) : driftX * -0.04)
      : 0;
    const focusPulse = storyAnimated
      ? (Number.isFinite(Number(storyMotion.focusPulse)) ? Number(storyMotion.focusPulse) : 1)
      : 1;
    const shadowOpacity = storyAnimated
      ? (Number.isFinite(Number(storyMotion.shadowOpacity)) ? Number(storyMotion.shadowOpacity) : 0.18)
      : 0;
    const glowSweep = storyAnimated
      ? (Number.isFinite(Number(storyMotion.glowSweep)) ? Number(storyMotion.glowSweep) : flareX)
      : flareX;
    const isParallax = media.depthSrc != null;
    const parallaxScaleAmount = isParallax
      ? (storyAnimated && storyMotion && Number.isFinite(Number(storyMotion.parallaxScale))
          ? Number(storyMotion.parallaxScale)
          : interpolate(frame, [0, durationInFrames], [10, 52]))
      : 0;

    return (
      <AbsoluteFill>
        {isParallax ? (
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <filter id={`parallax-${sceneIdx}`}>
              <feImage href={staticFile(media.depthSrc)} result="depthmap" preserveAspectRatio="none" crossOrigin="anonymous"/>
              <feDisplacementMap
                in="SourceGraphic"
                in2="depthmap"
                scale={parallaxScaleAmount}
                xChannelSelector="R"
                yChannelSelector="R"
              />
            </filter>
          </svg>
        ) : null}
        <GradientMesh themeName={backgroundTheme} durationInFrames={durationInFrames} mediaKind={media.kind} />
        {storyAnimated ? (
          <AbsoluteFill
            style={{
              transform: `perspective(1800px) rotateX(${perspectiveX * -0.55}deg) rotateY(${perspectiveY * -0.55}deg) translateX(${driftX * -0.35}px) translateY(${driftY * -0.35}px) scale(${finalScale + blurScaleOffset})`,
            }}
          >
            <Img
              src={staticFile(media.src)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(22px) saturate(1.22) brightness(0.48)',
              }}
            />
          </AbsoluteFill>
        ) : null}
        <AbsoluteFill style={{ transform: `perspective(1800px) rotateX(${perspectiveX}deg) rotateY(${perspectiveY}deg) translateX(${driftX}px) translateY(${driftY}px) rotate(${rotate}deg) scale(${finalScale * focusPulse})` }}>
          <Img
            src={staticFile(media.src)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              ...cinematicMediaStyle,
              filter: `
                ${isParallax ? `url(#parallax-${sceneIdx})` : ''} 
                ${storyAnimated ? 'saturate(1.16) contrast(1.1) brightness(0.92)' : cinematicMediaStyle.filter}
              `.trim(),
            }}
          />
        </AbsoluteFill>
        {storyAnimated ? (
          <AbsoluteFill
            style={{
              background: `linear-gradient(118deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${0.025 + (flareOpacity * 0.28)}) 48%, rgba(255,255,255,0) 70%)`,
              transform: `translateX(${(glowSweep - 50) * 3.4}px)`,
              mixBlendMode: 'screen',
              opacity: 0.65,
            }}
          />
        ) : null}
        {storyAnimated ? (
          <AbsoluteFill
            style={{
              background: `radial-gradient(circle at ${flareX}% 24%, rgba(255, 183, 3, ${flareOpacity}) 0%, rgba(255, 183, 3, 0) 36%)`,
              mixBlendMode: 'screen',
            }}
          />
        ) : null}
        {storyAnimated ? (
          <AbsoluteFill
            style={{
              background: `radial-gradient(circle at 50% 46%, rgba(0,0,0,0) 34%, rgba(0,0,0,${shadowOpacity}) 100%)`,
              mixBlendMode: 'multiply',
            }}
          />
        ) : null}
        <BackgroundWorld themeName={backgroundTheme} durationInFrames={durationInFrames} mediaKind={media.kind} mode="wash" />
      </AbsoluteFill>
    );
  }

  if (media.kind === 'video') {
    const motionScale = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1.02, 1.06], {
      extrapolateRight: 'clamp',
    });

    return (
      <AbsoluteFill style={{ transform: `scale(${motionScale})` }}>
        <GradientMesh themeName={backgroundTheme} durationInFrames={durationInFrames} mediaKind={media.kind} />
        <OffthreadVideo
          muted
          src={staticFile(media.src)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', ...cinematicMediaStyle }}
        />
        <BackgroundWorld themeName={backgroundTheme} durationInFrames={durationInFrames} mediaKind={media.kind} mode="wash" />
      </AbsoluteFill>
    );
  }

  return <GradientMesh themeName={backgroundTheme} durationInFrames={durationInFrames} mediaKind={media.kind} />;
};

const FlashTransition = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const flashStart = Math.max(0, durationInFrames - 3);

  if (frame < flashStart) {
    return null;
  }

  const localFrame = frame - flashStart;
  const opacity = interpolate(localFrame, [0, 2], [1, 0], {
    extrapolateRight: 'clamp',
  });

  return <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity }} />;
};

const getCaptionFontSize = (captionLength) => {
  if (captionLength > 34) {
    return 44;
  }

  if (captionLength > 28) {
    return 48;
  }

  if (captionLength > 22) {
    return 54;
  }

  return 60;
};

const getAccentPalette = (accent) => {
  if (accent === 'story') {
    return {
      edge: '#ffb703',
      glow: 'rgba(255, 183, 3, 0.32)',
      fill: 'linear-gradient(135deg, rgba(35, 19, 5, 0.88) 0%, rgba(86, 35, 10, 0.72) 100%)',
    };
  }

  if (accent === 'news') {
    return {
      edge: '#ff5a5f',
      glow: 'rgba(255, 90, 95, 0.28)',
      fill: 'linear-gradient(135deg, rgba(36, 5, 8, 0.88) 0%, rgba(98, 22, 26, 0.72) 100%)',
    };
  }

  return {
    edge: '#6ee7f2',
    glow: 'rgba(110, 231, 242, 0.24)',
    fill: 'linear-gradient(135deg, rgba(3, 24, 34, 0.88) 0%, rgba(16, 62, 84, 0.72) 100%)',
  };
};

const EMPHASIS_STOPWORDS = new Set([
  'about', 'after', 'again', 'below', 'because', 'before', 'beyond', 'could', 'follow', 'future',
  'global', 'going', 'great', 'households', 'matter', 'matters', 'might', 'more', 'really', 'right',
  'still', 'their', 'there', 'these', 'thing', 'this', 'those', 'today', 'updates', 'watch', 'where',
]);

const normalizeBurstWord = (text) =>
  String(text || '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();

const isInterestingBurstWord = (text) => {
  const normalized = normalizeBurstWord(text);
  if (!normalized || normalized.length < 4) {
    return false;
  }
  return !EMPHASIS_STOPWORDS.has(normalized.toLowerCase());
};

const buildSceneDetail = (sentence) => {
  const compact = String(sentence || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }

  const words = compact.split(' ');
  return words.length <= 9 ? compact : `${words.slice(0, 9).join(' ')}...`;
};

const getSceneMomentumAccent = (scene, hookPackage) => {
  if (hookPackage && hookPackage.accent) {
    return getAccentPalette(hookPackage.accent).edge;
  }

  const theme = String(scene && scene.backgroundTheme ? scene.backgroundTheme : '');
  if (theme.startsWith('geo-') || theme.startsWith('market-')) return '#ff8c66';
  if (theme.startsWith('story-')) return '#ffb703';
  if (theme.startsWith('ai-')) return '#6ee7f2';
  return '#dce9ff';
};

const getActiveScene = (scenes, frame) => {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return null;
  }

  const current = scenes.find(
    (scene) => frame >= scene.startFrame && frame < scene.startFrame + scene.durationInFrames
  );
  return current || scenes[scenes.length - 1];
};

const getActiveCaptionChunk = (captionChunks, frame) =>
  captionChunks.reduce((selectedChunk, chunk) => {
    if (frame >= chunk.startFrame && frame < chunk.endFrame) {
      return chunk;
    }

    if (frame >= chunk.startFrame) {
      return chunk;
    }

    return selectedChunk;
  }, captionChunks[0] || null);

const getSourceChipLabel = (media) => {
  const tier = String(media && media.tier ? media.tier : '').toLowerCase();

  if (tier.includes('wikimedia')) {
    return 'REAL ARCHIVE';
  }
  if (tier.includes('dvids') || tier.includes('nasa')) {
    return 'OFFICIAL SOURCE';
  }
  if (tier.includes('pexels') || tier.includes('pixabay') || tier.includes('unsplash')) {
    return 'ILLUSTRATIVE B-ROLL';
  }
  if (tier.includes('mesh')) {
    return 'GRAPHIC BACKDROP';
  }

  return 'VISUAL CONTEXT';
};

const MomentumTransition = ({ durationInFrames, scene, accent = '#ffffff' }) => {
  const frame = useCurrentFrame();
  const transitionFrames = Math.min(10, Math.max(6, Math.floor(durationInFrames * 0.12)));
  const transitionStart = Math.max(0, durationInFrames - transitionFrames);

  if (frame < transitionStart) {
    return null;
  }

  const localFrame = frame - transitionStart;
  const progress = interpolate(localFrame, [0, transitionFrames - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const direction =
    scene && /left/.test(String(scene.motionVariant || ''))
      ? -1
      : scene && /right/.test(String(scene.motionVariant || ''))
        ? 1
        : 1;
  const streakShift = interpolate(progress, [0, 1], [direction * -38, direction * 112], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const streakOpacity = interpolate(progress, [0, 0.6, 1], [0, 0.55, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const flashOpacity = interpolate(progress, [0, 0.35, 1], [0, 0.22, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          opacity: streakOpacity,
          transform: `translateX(${streakShift}px) skewX(${direction * -16}deg)`,
        }}
      >
        <AbsoluteFill
          style={{
            background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${accent}66 44%, rgba(255,255,255,0) 100%)`,
            filter: 'blur(10px)',
            mixBlendMode: 'screen',
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundColor: '#ffffff',
          opacity: flashOpacity,
        }}
      />
    </AbsoluteFill>
  );
};

const SceneInsightLayer = ({ scenes = [], hookPackage = null }) => {
  const frame = useCurrentFrame();
  const activeScene = getActiveScene(scenes, frame);
  const heroEnd = Math.max(36, hookPackage && hookPackage.showUntilFrame ? hookPackage.showUntilFrame : 48);

  if (!activeScene || (hookPackage && hookPackage.accent === 'story')) {
    return null;
  }
  if (frame < heroEnd - 2) {
    return null;
  }

  const localFrame = Math.max(0, frame - activeScene.startFrame);
  const durationInFrames = Math.max(1, activeScene.durationInFrames || 1);
  const intro = interpolate(localFrame, [0, 8, 20], [0, 0.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outro = interpolate(localFrame, [Math.max(0, durationInFrames - 10), durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = intro * outro;
  const shift = interpolate(opacity, [0, 1], [28, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const palette = getAccentPalette(hookPackage && hookPackage.accent);
  const sourceLabel = activeScene && activeScene.media ? getSourceChipLabel(activeScene.media) : 'VISUAL CONTEXT';
  const queryLabel = activeScene && activeScene.media && activeScene.media.query
    ? String(activeScene.media.query).toUpperCase()
    : sourceLabel;
  const detailLine = buildSceneDetail(activeScene.sentence);
  const topOffset = frame < heroEnd ? '27.5%' : '15%';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 28 }}>
      <div
        style={{
          position: 'absolute',
          top: topOffset,
          right: '15%',
          width: '30%',
          minWidth: 250,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          opacity,
          transform: `translateY(${shift}px)`,
        }}
      >
        <div
          style={{
            alignSelf: 'flex-end',
            background: 'rgba(6, 8, 14, 0.62)',
            border: `1px solid ${palette.edge}`,
            borderRadius: 26,
            boxShadow: `0 20px 44px ${palette.glow}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '16px 18px',
            width: '100%',
          }}
        >
          <div
            style={{
              color: palette.edge,
              fontFamily: '"Arial Black", "Impact", sans-serif',
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Scene Focus
          </div>
          <div
            style={{
              color: '#ffffff',
              fontFamily: '"Arial Black", "Impact", sans-serif',
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 0.96,
              textTransform: 'uppercase',
            }}
          >
            {queryLabel}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.86)',
              fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1.14,
            }}
          >
            {detailLine}
          </div>
        </div>
        <div
          style={{
            alignSelf: 'flex-end',
            background: 'rgba(0,0,0,0.44)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 999,
            color: '#ffffff',
            fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: '0.05em',
            padding: '10px 16px',
            textTransform: 'uppercase',
          }}
        >
          {sourceLabel}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const EmphasisBurstLayer = ({ captionChunks = [], hookPackage = null }) => {
  const frame = useCurrentFrame();
  // Hide floating burst words for story videos — they clash with subtitle captions
  if (hookPackage && hookPackage.accent === 'story') {
    return null;
  }
  const activeChunk = captionChunks.find((chunk) => frame >= chunk.startFrame && frame < chunk.endFrame)
    || captionChunks.find((chunk) => frame >= chunk.startFrame)
    || null;

  if (!activeChunk || !Array.isArray(activeChunk.words) || activeChunk.words.length === 0) {
    return null;
  }

  const burstWord =
    activeChunk.words.find((word) => frame >= word.startFrame && frame < word.endFrame && isInterestingBurstWord(word.text))
    || activeChunk.words.find((word) => isInterestingBurstWord(word.text));

  if (!burstWord) {
    return null;
  }

  const safeBurstEndFrame = Math.max(burstWord.startFrame + 1, burstWord.endFrame);
  const burstPeakFrame = Math.min(safeBurstEndFrame - 1, burstWord.startFrame + 4);
  const wordProgress = burstPeakFrame > burstWord.startFrame
    ? interpolate(frame, [burstWord.startFrame, burstPeakFrame, safeBurstEndFrame], [0, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : interpolate(frame, [burstWord.startFrame, safeBurstEndFrame], [0, 0.8], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
  const burstSpring = spring({ frame: frame - burstWord.startFrame, fps: 30, config: { damping: 10, stiffness: 200 } });
  const scale = interpolate(burstSpring, [0, 1], [0.7, 1.08]);
  const lift = interpolate(burstSpring, [0, 1], [40, -12]);
  const opacity = interpolate(wordProgress, [0, 0.3, 1], [0, 0.2, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 18 }}>
      <div
        style={{
          position: 'absolute',
          left: '7%',
          right: '7%',
          bottom: '23.5%',
          display: 'flex',
          justifyContent: 'center',
          opacity,
          transform: `translateY(${lift}px) scale(${scale})`,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.78)',
            filter: 'blur(0.3px)',
            fontFamily: '"Arial Black", "Impact", sans-serif',
            fontSize: 138,
            fontWeight: 900,
            letterSpacing: '-0.05em',
            lineHeight: 0.92,
            textAlign: 'center',
            textShadow: '0 18px 44px rgba(0,0,0,0.55)',
            textTransform: 'uppercase',
            WebkitTextStroke: '2px rgba(0,0,0,0.26)',
          }}
        >
          {normalizeBurstWord(burstWord.text)}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const HookLayer = ({ hookPackage, scenes }) => {
  const frame = useCurrentFrame();
  const activeScene = getActiveScene(scenes, frame);
  const palette = getAccentPalette(hookPackage && hookPackage.accent);
  const isStoryHook = Boolean(hookPackage && hookPackage.accent === 'story');
  const heroEnd = Math.max(36, hookPackage && hookPackage.showUntilFrame ? hookPackage.showUntilFrame : 48);
  const heroOpacity = interpolate(frame, [0, 3, heroEnd - 10, heroEnd], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hookSpring = spring({ frame, fps: 30, config: { damping: 10, stiffness: 140 } });
  const heroShift = interpolate(hookSpring, [0, 1], [20, 0]);
  const heroScale = 1 + (1 - hookSpring) * 0.08;
  const chipOpacity = interpolate(frame, [2, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sourceLabel =
    hookPackage && hookPackage.showSourceChip && activeScene && activeScene.media
      ? getSourceChipLabel(activeScene.media)
      : null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 24 }}>
      {hookPackage ? (
        <AbsoluteFill
          style={{
            top: '6.5%',
            left: '5.5%',
            right: '5.5%',
            bottom: 'auto',
            opacity: heroOpacity,
            transform: `translateY(${heroShift}px) scale(${heroScale})`,
          }}
        >
          <div
            style={{
              alignSelf: 'flex-start',
              background: palette.fill,
              border: `1px solid ${palette.edge}`,
              borderRadius: 34,
              boxShadow: `0 24px 60px ${palette.glow}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxWidth: isStoryHook ? '80%' : '84%',
              padding: isStoryHook ? '18px 22px 20px 22px' : '20px 24px 22px 24px',
            }}
          >
            <div
              style={{
                color: palette.edge,
                fontFamily: '"Impact", "Arial Black", "Segoe UI", sans-serif',
                fontSize: isStoryHook ? 24 : 28,
                fontWeight: 900,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
              }}
            >
              {hookPackage.badge}
            </div>
            {hookPackage.powerText ? (
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: 'rgba(255,255,255,0.12)',
                  border: `1px solid ${palette.edge}`,
                  borderRadius: 999,
                  color: '#ffffff',
                  fontFamily: '"Arial Black", "Impact", sans-serif',
                  fontSize: isStoryHook ? 28 : 30,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  padding: '10px 14px',
                  textTransform: 'uppercase',
                }}
              >
                {hookPackage.powerText}
              </div>
            ) : null}
            <div
              style={{
                color: '#ffffff',
                fontFamily: '"Arial Black", "Impact", sans-serif',
                fontSize: isStoryHook ? 58 : 64,
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: isStoryHook ? 0.95 : 0.92,
                maxWidth: '92%',
                textTransform: 'uppercase',
                textShadow: '0 10px 30px rgba(0,0,0,0.58)',
              }}
            >
              {hookPackage.headline}
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
                fontSize: isStoryHook ? 24 : 28,
                fontWeight: 700,
                lineHeight: 1.18,
                maxWidth: '94%',
              }}
            >
              {hookPackage.subline}
            </div>
          </div>
        </AbsoluteFill>
      ) : null}

      {hookPackage ? (
        <AbsoluteFill
          style={{
            top: '6.3%',
            left: '5.5%',
            right: '5.5%',
            bottom: 'auto',
            alignItems: 'flex-start',
            display: 'flex',
            flexDirection: 'row',
            gap: 12,
            opacity: chipOpacity,
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.42)',
              border: `1px solid ${palette.edge}`,
              borderRadius: 999,
              boxShadow: `0 12px 28px ${palette.glow}`,
              color: '#ffffff',
              fontFamily: '"Arial Black", "Impact", sans-serif',
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: '0.08em',
              padding: '12px 16px',
              textTransform: 'uppercase',
            }}
          >
            {hookPackage.persistentBadge}
          </div>
          {sourceLabel ? (
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.42)',
                border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: 999,
                boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
                color: '#ffffff',
                fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
                fontSize: 21,
                fontWeight: 800,
                letterSpacing: '0.04em',
                padding: '12px 16px',
                textTransform: 'uppercase',
              }}
            >
              {sourceLabel}
            </div>
          ) : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Phase 2B: Full Retention Effects Layer
 * Handles all 6 interrupt types with dedicated visual treatments:
 *   - zoom-snap/zoom-pulse: handled via interruptScale on parent wrapper
 *   - camera-shake: translateX/Y oscillation overlay
 *   - saturation-spike: filter overlay
 *   - color-grade-shift: warm/cool overlay with mix-blend-mode
 *   - flash-cut: white radial gradient flash
 */
const RetentionEffectsLayer = ({ interruptMoments = [], hookPackage = null }) => {
  const frame = useCurrentFrame();
  const palette = getAccentPalette(hookPackage && hookPackage.accent);

  // Flash/color-grade effects
  const flashOpacity = getInterruptFlashOpacity(frame, interruptMoments);

  // Camera shake
  const shake = getCameraShakeOffset(frame, interruptMoments);
  const hasShake = Math.abs(shake.x) > 0.01 || Math.abs(shake.y) > 0.01;

  // Saturation spike
  const saturation = getSaturationSpike(frame, interruptMoments);
  const hasSaturation = saturation > 1.01;

  // Color grade shift detection
  const colorGradeActive = interruptMoments.some(i => {
    if (i.type !== 'color-grade-shift') return false;
    return Math.abs(frame - i.frame) <= 6;
  });
  const colorGradeOpacity = colorGradeActive
    ? interpolate(
        Math.min(...interruptMoments.filter(i => i.type === 'color-grade-shift').map(i => Math.abs(frame - i.frame))),
        [0, 6], [0.18, 0], { extrapolateRight: 'clamp' }
      )
    : 0;
  // Alternate warm/cool based on frame parity
  const isWarmGrade = (frame % 60) < 30;

  if (flashOpacity <= 0.001 && !hasShake && !hasSaturation && colorGradeOpacity <= 0.001) {
    return null;
  }

  return (
    <>
      {/* Flash cut effect */}
      {flashOpacity > 0.001 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 20,
            background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,${flashOpacity}) 0%, ${palette.glow} 38%, rgba(0,0,0,0) 74%)`,
            mixBlendMode: 'screen',
          }}
        />
      ) : null}

      {/* Camera shake overlay */}
      {hasShake ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 21,
            transform: `translate(${shake.x}px, ${shake.y}px)`,
            border: '2px solid rgba(255, 90, 95, 0.15)',
            borderRadius: 4,
            boxShadow: `inset 0 0 40px rgba(255, 0, 0, ${Math.abs(shake.x) * 0.03})`,
          }}
        />
      ) : null}

      {/* Saturation spike overlay */}
      {hasSaturation ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 19,
            backdropFilter: `saturate(${saturation}) contrast(${1 + (saturation - 1) * 0.2})`,
            WebkitBackdropFilter: `saturate(${saturation}) contrast(${1 + (saturation - 1) * 0.2})`,
          }}
        />
      ) : null}

      {/* Color grade shift overlay */}
      {colorGradeOpacity > 0.001 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 20,
            background: isWarmGrade
              ? `linear-gradient(135deg, rgba(255, 183, 77, ${colorGradeOpacity}) 0%, rgba(255, 87, 34, ${colorGradeOpacity * 0.6}) 100%)`
              : `linear-gradient(135deg, rgba(77, 182, 255, ${colorGradeOpacity}) 0%, rgba(34, 87, 255, ${colorGradeOpacity * 0.6}) 100%)`,
            mixBlendMode: 'overlay',
          }}
        />
      ) : null}
    </>
  );
};

const AvatarPresenterLayer = ({ avatarPackage = null, captionChunks = [], hookPackage = null }) => {
  const frame = useCurrentFrame();
  if (!avatarPackage || !avatarPackage.enabled || !avatarPackage.src) {
    return null;
  }

  const palette = getAccentPalette((avatarPackage && avatarPackage.accent) || (hookPackage && hookPackage.accent));
  const activeChunk = getActiveCaptionChunk(captionChunks, frame);
  const activeWordCount = activeChunk && Array.isArray(activeChunk.words)
    ? activeChunk.words.filter((word) => frame >= word.startFrame && frame < word.endFrame).length
    : 0;
  const speakingEnergy = Math.min(1, activeWordCount / 3);
  const pulse = 1 + (Math.sin(frame / 6) * 0.008) + (speakingEnergy * 0.024);
  const shimmer = 0.1 + (speakingEnergy * 0.1);
  const isStoryLayout = avatarPackage.layout === 'story-right';
  const shellWidth = isStoryLayout ? 288 : 240;
  const shellHeight = isStoryLayout ? 404 : 332;
  const shellStyle = isStoryLayout
    ? { right: '4.6%', bottom: '26.5%' }
    : { left: '4.8%', top: '19.5%' };
  const objectPosition = avatarPackage.objectPosition || (isStoryLayout ? '50% 18%' : '50% 18%');
  const speechBob = Math.sin(frame / 6.5) * (0.32 + (speakingEnergy * 0.9));
  const speechTilt = Math.sin(frame / 12) * (0.12 + (speakingEnergy * 0.32));
  const mediaDriftX = Math.sin(frame / 15) * (0.9 + (speakingEnergy * 1.4));
  const mediaDriftY = Math.cos(frame / 18) * (0.8 + (speakingEnergy * 1.2));
  const mediaScale = 1.03 + (Math.sin(frame / 26) * 0.01) + (speakingEnergy * 0.018);
  const waveBars = [0, 1, 2].map((index) =>
    18 + ((Math.sin((frame / 3.8) + (index * 0.9)) + 1) * 10 * (0.35 + speakingEnergy))
  );
  const enterOpacity = interpolate(frame, [0, 8, 18], [0, 0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const enterShift = interpolate(frame, [0, 10], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 29 }}>
      <div
        style={{
          position: 'absolute',
          width: shellWidth,
          height: shellHeight,
          opacity: enterOpacity,
          transform: `translateY(${enterShift + speechBob}px) rotate(${speechTilt}deg) scale(${pulse})`,
          ...shellStyle,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: 36,
            background: `radial-gradient(circle at 50% 12%, ${palette.glow} 0%, rgba(0, 0, 0, 0) 65%)`,
            filter: 'blur(14px)',
            opacity: 0.95,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 34,
            overflow: 'hidden',
            border: `1px solid ${palette.edge}`,
            boxShadow: `0 26px 56px rgba(0,0,0,0.46), 0 0 34px ${palette.glow}`,
            background: 'linear-gradient(180deg, rgba(6, 8, 14, 0.9) 0%, rgba(3, 4, 8, 0.82) 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(180deg, rgba(255,255,255,${0.06 + shimmer}) 0%, rgba(255,255,255,0) 24%)`,
              mixBlendMode: 'screen',
            }}
          />
          {avatarPackage.kind === 'video' ? (
            <OffthreadVideo
              muted
              src={staticFile(avatarPackage.src)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition,
                transform: `translateX(${mediaDriftX}px) translateY(${mediaDriftY}px) scale(${mediaScale})`,
              }}
            />
          ) : (
            <Img
              src={staticFile(avatarPackage.src)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition,
                filter: 'saturate(1.06) contrast(1.1) brightness(0.98)',
                transform: `translateX(${mediaDriftX}px) translateY(${mediaDriftY}px) scale(${mediaScale})`,
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: '16px 18px 18px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(3,4,8,0.9) 52%, rgba(3,4,8,0.96) 100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                color: palette.edge,
                fontFamily: '"Segoe UI", "Arial", sans-serif',
                fontSize: isStoryLayout ? 18 : 17,
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              {avatarPackage.label}
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontFamily: '"Segoe UI", "Arial", sans-serif',
                fontSize: isStoryLayout ? 17 : 16,
                fontWeight: 700,
                letterSpacing: '0.03em',
              }}
            >
              {avatarPackage.sublabel}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 5,
                height: 24,
              }}
            >
              {waveBars.map((height, index) => (
                <div
                  key={`wave-${index}`}
                  style={{
                    width: 7,
                    height,
                    borderRadius: 999,
                    background: index === 1 ? '#ffffff' : palette.edge,
                    boxShadow: `0 0 18px ${palette.glow}`,
                    opacity: 0.82 + (speakingEnergy * 0.18),
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const KaraokeBlock = ({ captionChunks, storyMode = false, enableV13Hacks = false }) => {
  const frame = useCurrentFrame();
  const activeChunk = getActiveCaptionChunk(captionChunks, frame);

  if (!activeChunk) {
    return null;
  }

  const activeWords = Array.isArray(activeChunk.words) ? activeChunk.words : [];
  if (activeWords.length === 0) {
    return null;
  }

  const enterSpring = spring({ frame: frame - activeChunk.startFrame, fps: 30, config: { damping: 12, stiffness: 180 } });
  const captionTextLength = activeWords.map((word) => word.text).join(' ').length;
  const captionFontSize = Math.max(storyMode ? 40 : 38, getCaptionFontSize(captionTextLength) - (storyMode ? 8 : 10));
  const blockLift = interpolate(enterSpring, [0, 1], [28, 0]);
  const blockScale = interpolate(enterSpring, [0, 1], [0.94, 1]);
  const activeWordCount = activeWords.filter((word) => frame >= word.startFrame && frame < word.endFrame).length;

  // Phase 4B: Dynamic caption sizing based on content
  const fullText = activeWords.map(w => w.text).join(' ');
  const wordCount = activeWords.length;
  const isQuestion = fullText.endsWith('?');
  const hasPowerWord = (() => {
    const fl = fullText.toLowerCase();
    const powerSet = [
      'kill', 'dead', 'murder', 'blood', 'war', 'crash', 'explosion', 'destroy', 'attack',
      'breaking', 'shocking', 'revealed', 'exposed', 'exclusive', 'urgent', 'massive',
      'khoon', 'maut', 'khatarnaak', 'barbaad', 'sansani', 'hungama',
    ];
    return powerSet.some(w => fl.includes(w));
  })();
  const isDramaticSingle = wordCount <= 2 && hasPowerWord;
  const isShortPhrase = wordCount >= 3 && wordCount <= 5;

  // Dynamic font size multiplier
  const dynamicFontSize = isDramaticSingle
    ? Math.min(72, captionFontSize * 1.6)
    : isShortPhrase
      ? captionFontSize * 1.08
      : captionFontSize;

  // Question tilt
  const questionTilt = isQuestion ? 0.5 : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: isDramaticSingle ? '3%' : '5.6%',
        right: isDramaticSingle ? '3%' : '5.6%',
        bottom: isDramaticSingle ? '26%' : '22%',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 34,
      }}
    >
      <div
        style={{
          alignContent: 'center',
          alignItems: 'center',
          background: isDramaticSingle
            ? 'linear-gradient(180deg, rgba(0, 0, 0, 0.92) 0%, rgba(20, 0, 0, 0.78) 100%)'
            : 'linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.56) 100%)',
          border: `1px solid ${activeWordCount > 0 ? 'rgba(255, 220, 96, 0.5)' : 'rgba(255, 255, 255, 0.22)'}`,
          borderRadius: isDramaticSingle ? 20 : 30,
          boxSizing: 'border-box',
          boxShadow: isDramaticSingle
            ? '0 22px 56px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 50, 50, 0.2)'
            : activeWordCount > 0
              ? '0 22px 56px rgba(0, 0, 0, 0.34), 0 0 22px rgba(255, 220, 96, 0.14)'
              : '0 22px 52px rgba(0, 0, 0, 0.34)',
          display: 'inline-flex',
          flexWrap: 'wrap',
          fontFamily: storyMode ? '"Trebuchet MS", "Segoe UI", sans-serif' : '"Impact", "Arial Black", "Segoe UI", sans-serif',
          fontSize: dynamicFontSize,
          fontWeight: storyMode ? 800 : 900,
          columnGap: storyMode ? 10 : 9,
          rowGap: 9,
          justifyContent: 'center',
          lineHeight: storyMode ? 1.1 : 1.08,
          maxWidth: isDramaticSingle ? '94%' : '88%',
          maxHeight: isDramaticSingle ? 220 : 180,
          opacity: interpolate(enterSpring, [0, 1], [0.78, 1]),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: isDramaticSingle
            ? '28px 42px'
            : isShortPhrase
              ? (storyMode ? '22px 34px' : '22px 38px')
              : (storyMode ? '20px 30px' : '20px 34px'),
          textAlign: 'center',
          textTransform: storyMode ? 'none' : 'uppercase',
          letterSpacing: isDramaticSingle ? '0.04em' : (storyMode ? '0.005em' : '0.02em'),
          transform: `translateY(${blockLift}px) scale(${blockScale}) rotate(${questionTilt}deg)`,
          whiteSpace: 'normal',
          width: 'auto',
        }}
      >
        {activeWords.map((word, wordIdx) => {
          const isActive = frame >= word.startFrame && frame < word.endFrame;
          const isLast = wordIdx === activeWords.length - 1;
          const safeWordEndFrame = Math.max(word.startFrame + 1, word.endFrame);
          const emphasisPeakFrame = Math.min(safeWordEndFrame - 1, word.startFrame + 5);
          const wordProgress = isActive
            ? emphasisPeakFrame > word.startFrame
              ? interpolate(frame, [word.startFrame, emphasisPeakFrame, safeWordEndFrame], [0, 1, 0.2], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : interpolate(frame, [word.startFrame, safeWordEndFrame], [0, 0.8], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
            : 0;

          const isV13 = enableV13Hacks;

          /**
           * Phase 4A: Expanded 4-tier power word dictionary (130+ words).
           * Red = danger/death, Gold = breaking/exclusive, Yellow = mystery, Green = positive.
           */
          const getWordColor = (t, active) => {
            if (!active) return '#ffffff';
            if (!isV13) return '#ffff00';
            const textL = t.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');

            // Red tier — danger, death, violence (40+ words)
            const redWords = [
              'kill', 'dead', 'murder', 'blood', 'war', 'crash', 'explosion', 'destroy', 'attack', 'threat',
              'danger', 'emergency', 'crisis', 'terror', 'chaos', 'disaster', 'catastrophe', 'collapse',
              'death', 'fatal', 'brutal', 'violent', 'massacre', 'genocide', 'bomb', 'nuclear', 'toxic',
              'khoon', 'maut', 'mari', 'khatarnaak', 'barbaad', 'qatl', 'shrap', 'bhayanak', 'khauf',
              'haunt', 'dar', 'aatma', 'chudail', 'tabahi', 'vinash', 'hatya', 'zeher',
            ];
            if (redWords.some(w => textL.includes(w))) return '#ff3333';

            // Gold tier — breaking news, shocking, exclusive (35+ words)
            const goldWords = [
              'breaking', 'shocking', 'revealed', 'exposed', 'exclusive', 'urgent', 'massive', 'historic',
              'unprecedented', 'bombshell', 'leaked', 'confirmed', 'official', 'explosive',
              'banned', 'arrested', 'caught', 'fired', 'scandal', 'corrupt', 'fraud', 'scam',
              'billion', 'million', 'trillion', 'crore', 'lakh',
              'sansani', 'hungama', 'giraftaar', 'pakda', 'nikla',
            ];
            if (goldWords.some(w => textL.includes(w))) return '#FFB703';

            // Green tier — positive, victory (20+ words)
            const greenWords = [
              'win', 'victory', 'record', 'success', 'breakthrough', 'milestone', 'hero', 'save',
              'cure', 'rescue', 'champion', 'legend', 'proud', 'celebrate', 'achieve', 'gold',
              'jeet', 'safalta', 'vijay', 'bachaya',
            ];
            if (greenWords.some(w => textL.includes(w))) return '#00E676';

            // Yellow tier — mystery, question (30+ words)
            const yellowWords = [
              'mystery', 'secret', 'truth', 'why', 'how', 'hidden', 'unknown', 'strange', 'weird',
              'impossible', 'unbelievable', 'incredible', 'insane', 'crazy', 'shocking',
              'raaz', 'khufiya', 'sirf', 'lekin', 'kyon', 'sach', 'sachhai', 'ajeeb', 'rahasya',
              'but', 'only', 'actually', 'really',
            ];
            if (yellowWords.some(w => textL.includes(w))) return '#ffff00';

            return '#00FFFF'; // Bright Cyan for normal active reading
          };
          const getGlow = (t, active) => {
             if (!active) return '0 4px 12px rgba(0,0,0,0.95)';
             const color = getWordColor(t, true);
             // Gold tier gets extra-strong glow ring
             if (color === '#FFB703') return `0 0 28px ${color}AA, 0 0 8px ${color}60, 0 5px 14px rgba(0,0,0,0.92)`;
             // Red tier gets intense red glow
             if (color === '#ff3333') return `0 0 24px ${color}90, 0 5px 14px rgba(0,0,0,0.92)`;
             // Green tier gets positive glow
             if (color === '#00E676') return `0 0 20px ${color}80, 0 5px 14px rgba(0,0,0,0.92)`;
             return `0 0 20px ${color}80, 0 5px 14px rgba(0,0,0,0.92)`;
          };

          // Phase 4B: Tier-aware scale multiplier
          const wordColor = getWordColor(word.text, true);
          const isGoldWord = wordColor === '#FFB703';
          const isRedWord = wordColor === '#ff3333';
          const tierScaleBoost = isGoldWord ? 0.20 : isRedWord ? 0.16 : 0.12;
          const tierShake = isRedWord && isActive ? Math.sin(frame * 14) * wordProgress * 1.2 : 0;

          return (
            <React.Fragment key={word.id}>
              <span
                style={{
                  color: getWordColor(word.text, isActive),
                  display: 'inline-block',
                  position: 'relative',
                  filter: isActive
                    ? isGoldWord
                      ? `drop-shadow(0 0 14px rgba(255,183,3,0.4)) drop-shadow(0 0 6px rgba(255,183,3,0.25))`
                      : 'drop-shadow(0 0 10px rgba(255,255,120,0.22))'
                    : 'none',
                  transform: isActive
                    ? `translateY(${interpolate(wordProgress, [0, 1], [6, -3])}px) translateX(${tierShake}px) scale(${1 + wordProgress * tierScaleBoost}) rotate(${interpolate(wordProgress, [0, 1], [-1.4, 0])}deg)`
                    : 'scale(1)',
                  transformOrigin: 'center center',
                  textShadow: getGlow(word.text, isActive),
                  WebkitTextStroke: storyMode ? '1.1px rgba(0,0,0,0.66)' : '1.5px rgba(0,0,0,0.66)',
                  transition: isActive ? 'none' : 'color 0.12s ease-out',
                }}
              >
                {word.text}
                {isActive ? (
                  <div style={{
                    position: 'absolute',
                    bottom: -2,
                    left: 0,
                    height: isGoldWord ? 4 : 3,
                    width: `${wordProgress * 100}%`,
                    background: isGoldWord
                      ? `linear-gradient(90deg, ${wordColor}, #FFEE58)`
                      : wordColor,
                    borderRadius: 2,
                    opacity: 0.85,
                    boxShadow: `0 0 ${isGoldWord ? 10 : 6}px ${wordColor}60`,
                  }} />
                ) : null}
              </span>
              {!isLast ? <span style={{ display: 'inline-block', width: '0.28em' }} /> : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const FollowOutroTag = ({ hookPackage = null }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const startFrame = Math.max(0, durationInFrames - 32);

  if (frame < startFrame) {
    return null;
  }

  const palette = getAccentPalette(hookPackage && hookPackage.accent);
  const closingCta = hookPackage && hookPackage.closingCtaText
    ? String(hookPackage.closingCtaText)
    : 'Follow now. The next development is already forming.';
  const kicker = hookPackage && hookPackage.loopBadge ? hookPackage.loopBadge : 'NEXT';
  const enter = interpolate(frame, [startFrame, startFrame + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = enter * exit;
  const lift = interpolate(opacity, [0, 1], [18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '8.6%',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 38,
      }}
    >
      <div
        style={{
          background: palette.fill,
          border: `1px solid ${palette.edge}`,
          borderRadius: 28,
          boxShadow: `0 18px 40px ${palette.glow}`,
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: '82%',
          opacity,
          padding: '14px 20px 16px 20px',
          transform: `translateY(${lift}px)`,
        }}
      >
        <div
          style={{
            color: palette.edge,
            fontFamily: '"Arial Black", "Impact", sans-serif',
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            color: '#ffffff',
            fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '0.01em',
            lineHeight: 1.08,
            textAlign: 'center',
          }}
        >
          {closingCta}
        </div>
      </div>
    </div>
  );
};

const LoopCallbackLayer = ({ hookPackage = null }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const startFrame = Math.max(0, durationInFrames - 18);

  if (!hookPackage || frame < startFrame) {
    return null;
  }

  const palette = getAccentPalette(hookPackage.accent);
  const opacity = interpolate(frame, [startFrame, startFrame + 5, durationInFrames], [0, 0.28, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [startFrame, durationInFrames], [0.96, 1.02], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 22, opacity }}>
      <div
        style={{
          position: 'absolute',
          top: '7%',
          left: '5.8%',
          maxWidth: '70%',
          background: 'rgba(0, 0, 0, 0.34)',
          border: `1px solid ${palette.edge}`,
          borderRadius: 22,
          boxShadow: `0 10px 28px ${palette.glow}`,
          padding: '12px 16px',
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            color: palette.edge,
            fontFamily: '"Arial Black", "Impact", sans-serif',
            fontSize: 17,
            fontWeight: 900,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {hookPackage.loopBadge || hookPackage.persistentBadge || hookPackage.badge}
        </div>
        <div
          style={{
            color: '#ffffff',
            fontFamily: '"Arial Black", "Impact", sans-serif',
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            lineHeight: 0.95,
            textTransform: 'uppercase',
          }}
        >
          {hookPackage.loopHeadline || hookPackage.headline}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CinematicFxLayer = ({ hookPackage = null }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const palette = getAccentPalette(hookPackage && hookPackage.accent);
  const isStory = Boolean(hookPackage && hookPackage.accent === 'story');
  const sweepProgress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [-16, 14], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pulseOpacity = interpolate(frame, [0, Math.max(1, durationInFrames / 2), Math.max(1, durationInFrames - 1)], [0.07, 0.11, 0.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hazeDrift = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [-2, 2], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 14 }}>
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at 50% 18%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 18%, rgba(0,0,0,0) 46%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.18) 100%)',
          mixBlendMode: 'screen',
          opacity: pulseOpacity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '-12%',
          background: `linear-gradient(115deg, rgba(255,255,255,0) 18%, ${palette.glow} 48%, rgba(255,255,255,0) 64%)`,
          mixBlendMode: isStory ? 'screen' : 'soft-light',
          opacity: isStory ? 0.24 : 0.18,
          transform: `translateX(${sweepProgress}%) rotate(-12deg)`,
        }}
      />
      {isStory ? (
        <div
          style={{
            position: 'absolute',
            inset: '-4%',
            background: 'radial-gradient(circle at 20% 72%, rgba(244, 140, 62, 0.08) 0%, rgba(244, 140, 62, 0.02) 24%, rgba(0,0,0,0) 54%), radial-gradient(circle at 78% 18%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 20%, rgba(0,0,0,0) 46%)',
            mixBlendMode: 'screen',
            opacity: 0.16,
            transform: `translateY(${hazeDrift}%) scale(1.02)`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const BackgroundMusic = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [Math.max(0, durationInFrames - 30), durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return <Audio loop src={staticFile('audio/lofi-tech.mp3')} volume={0.045 * fadeIn * fadeOut} />;
};

const encodeBytesToBase64 = (bytes) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const buildToneWavDataUri = (durationSeconds, sampleRate, generator) => {
  const sampleCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const sample = Math.max(-1, Math.min(1, generator(t, durationSeconds)));
    view.setInt16(44 + (index * bytesPerSample), Math.round(sample * 32767), true);
  }

  return `data:audio/wav;base64,${encodeBytesToBase64(new Uint8Array(buffer))}`;
};

/**
 * Phase 3A: Real SFX from library files.
 * Falls back to procedural data URIs if library files don't exist.
 */
const SFX_WHOOSH_VARIANTS = [
  'audio/sfx-library/whoosh/soft-swoosh.wav',
  'audio/sfx-library/whoosh/sharp-whoosh.wav',
  'audio/sfx-library/whoosh/heavy-sweep.wav',
  'audio/sfx-library/whoosh/reverse-whoosh.wav',
];
const SFX_IMPACT_HOOK = 'audio/sfx-library/impact/cinematic-hit.wav';
const SFX_OUTRO_MUSICAL = 'audio/sfx-library/musical/piano-hit.wav';
const SFX_STINGER_EMPHASIS = 'audio/sfx-library/stinger/reveal-sting.wav';

// Legacy fallback data URIs (kept for backward compatibility if library files missing)
const SFX_HOOK_HIT = buildToneWavDataUri(0.35, 22050, (t) => {
  const envelope = Math.exp(-7.5 * t);
  const s1 = Math.sin(2 * Math.PI * 72 * t);
  const s2 = Math.sin(2 * Math.PI * 144 * t);
  return ((s1 * 0.82) + (s2 * 0.28)) * envelope * 0.85;
});

const SFX_TRANSITION_WHOOSH = buildToneWavDataUri(0.24, 22050, (t, durationSeconds) => {
  const progress = durationSeconds <= 0 ? 0 : (t / durationSeconds);
  const freq = 760 - (520 * progress);
  const envelope = Math.pow(1 - progress, 1.7);
  return Math.sin(2 * Math.PI * freq * t) * envelope * 0.42;
});

const SFX_OUTRO_DING = buildToneWavDataUri(0.28, 22050, (t) => {
  const envelope = Math.exp(-8.8 * t);
  const s1 = Math.sin(2 * Math.PI * 1180 * t);
  const s2 = Math.sin(2 * Math.PI * 1760 * t);
  return ((s1 * 0.65) + (s2 * 0.35)) * envelope * 0.34;
});

/**
 * Try to use real SFX file, fall back to data URI.
 */
const useSfx = (libraryPath, fallbackDataUri) => {
  try {
    // staticFile will throw at render time if file doesn't exist,
    // so we always try the library path first
    return staticFile(libraryPath);
  } catch {
    return fallbackDataUri;
  }
};

const MotionSfxLayer = ({ scenes = [], hookPackage = null, sfxPack = null }) => {
  const { durationInFrames } = useVideoConfig();
  const accent = hookPackage && hookPackage.accent === 'story' ? 1 : 0.85;
  const outroStart = Math.max(0, durationInFrames - 24);

  // Use real SFX from library, with fallback to procedural
  const hookSrc = useSfx(
    sfxPack && sfxPack.hookHit ? sfxPack.hookHit : SFX_IMPACT_HOOK,
    SFX_HOOK_HIT
  );
  const outroSrc = useSfx(
    sfxPack && sfxPack.outro ? sfxPack.outro : SFX_OUTRO_MUSICAL,
    SFX_OUTRO_DING
  );

  return (
    <>
      <Sequence from={0} durationInFrames={20}>
        <Audio src={hookSrc} volume={0.12 * accent} />
      </Sequence>
      {scenes
        .filter((scene) => Number(scene.startFrame) > 0)
        .map((scene, idx) => {
          // Cycle through whoosh variants for variety
          const whooshPath = SFX_WHOOSH_VARIANTS[idx % SFX_WHOOSH_VARIANTS.length];
          const whooshSrc = useSfx(
            sfxPack && sfxPack.transitionWhooshes && sfxPack.transitionWhooshes[idx]
              ? sfxPack.transitionWhooshes[idx]
              : whooshPath,
            SFX_TRANSITION_WHOOSH
          );
          return (
            <Sequence key={`sfx-${scene.startFrame}`} from={Math.max(0, scene.startFrame)} durationInFrames={12}>
              <Audio src={whooshSrc} volume={0.06} />
            </Sequence>
          );
        })}
      <Sequence from={outroStart} durationInFrames={18}>
        <Audio src={outroSrc} volume={0.09} />
      </Sequence>
    </>
  );
};

export const V12Composition = ({
  scenes = [],
  captionChunks = [],
  mixedAudioFile,
  voiceoverFile,
  hasBGM = false,
  hookPackage = null,
  avatarPackage = null,
  retentionBlueprint = null,
  enableV13Hacks = false,
  sfxPack = null,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const resolvedAudioFile = mixedAudioFile || voiceoverFile;
  const interruptMoments = buildInterruptMoments(retentionBlueprint && retentionBlueprint.patternInterrupts, fps);
  const interruptScale = getInterruptZoomScale(frame, interruptMoments);
  const cameraShake = getCameraShakeOffset(frame, interruptMoments);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      <AbsoluteFill style={{ transform: `scale(${interruptScale}) translate(${cameraShake.x}px, ${cameraShake.y}px)`, transformOrigin: 'center center' }}>
        {scenes.map((scene, index) => (
          <Sequence
            key={`${scene.startFrame}-${scene.media.tier}-${index}`}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
          >
            <AbsoluteFill>
              <SceneMedia scene={scene} durationInFrames={scene.durationInFrames} />
              <AbsoluteFill style={backgroundFadeStyle} />
              {index < scenes.length - 1 ? (
                <MomentumTransition
                  durationInFrames={scene.durationInFrames}
                  scene={scene}
                  accent={getSceneMomentumAccent(scene, hookPackage)}
                />
              ) : null}
            </AbsoluteFill>
          </Sequence>
        ))}
      </AbsoluteFill>

      <CinematicFxLayer hookPackage={hookPackage} />
      <RetentionEffectsLayer interruptMoments={interruptMoments} hookPackage={hookPackage} />
      <MotionSfxLayer scenes={scenes} hookPackage={hookPackage} sfxPack={sfxPack} />
      {!mixedAudioFile && hasBGM ? <BackgroundMusic /> : null}
      {resolvedAudioFile ? <Audio src={staticFile(`audio/${resolvedAudioFile}`)} volume={1} /> : null}
      <HookLayer hookPackage={hookPackage} scenes={scenes} />
      <SceneInsightLayer hookPackage={hookPackage} scenes={scenes} />
      <AvatarPresenterLayer avatarPackage={avatarPackage} captionChunks={captionChunks} hookPackage={hookPackage} />
      <EmphasisBurstLayer captionChunks={captionChunks} hookPackage={hookPackage} />
      <KaraokeBlock captionChunks={captionChunks} storyMode={Boolean(hookPackage && hookPackage.accent === 'story')} enableV13Hacks={enableV13Hacks} />
      <LoopCallbackLayer hookPackage={hookPackage} />
      <FollowOutroTag hookPackage={hookPackage} />
      <AbsoluteFill style={overlayStyle} />
    </AbsoluteFill>
  );
};
