/**
 * DopamineEffectsLayer.jsx — V99 Visual Effects Component
 *
 * Reads the dopamine edit plan (passed as prop) and applies 10 effect types
 * at precise frame positions for maximum viewer retention.
 *
 * Effect types:
 *   zoom-snap, zoom-pulse, camera-shake, saturation-spike,
 *   color-invert-flash, rotation-tilt, snap-zoom-hold,
 *   speed-ramp-slow, beat-zoom, glitch
 */

import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill, interpolate } from 'remotion';

/**
 * Get the active effect at a given frame.
 */
function getActiveEffects(dopaminePlan, frame) {
  const effects = [];
  for (const event of dopaminePlan) {
    if (frame >= event.frame && frame < event.frame + (event.duration || 6)) {
      effects.push(event);
    }
  }
  return effects;
}

/**
 * Compute transform for zoom-snap effect.
 */
function zoomSnap(progress) {
  const peak = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
  return { scale: 1 + 0.15 * Math.max(0, peak) };
}

/**
 * Compute transform for zoom-pulse effect.
 */
function zoomPulse(progress) {
  return { scale: 1 + 0.04 * Math.sin(progress * Math.PI) };
}

/**
 * Compute camera-shake offsets.
 */
function cameraShake(progress) {
  const decay = 1 - Math.pow(progress, 2);
  return {
    translateX: Math.sin(progress * Math.PI * 6) * 4 * decay,
    translateY: Math.cos(progress * Math.PI * 8) * 3 * decay,
  };
}

/**
 * Compute beat-zoom effect.
 */
function beatZoom(progress) {
  const peak = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;
  return { scale: 1 + 0.1 * Math.max(0, peak) };
}

/**
 * Compute snap-zoom-hold (zoom in and hold).
 */
function snapZoomHold(progress) {
  const zoomIn = Math.min(1, progress * 5);
  return { scale: 1 + 0.12 * zoomIn };
}

export const DopamineEffectsLayer = ({ dopaminePlan = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeEffects = useMemo(
    () => getActiveEffects(dopaminePlan, frame),
    [dopaminePlan, frame]
  );

  if (activeEffects.length === 0) return null;

  // Aggregate transforms from all active effects
  let totalScale = 1;
  let totalRotate = 0;
  let totalTranslateX = 0;
  let totalTranslateY = 0;
  let totalSaturate = 1;
  let showInvert = false;
  let showGlitch = false;
  let glitchHue = 0;

  for (const event of activeEffects) {
    const duration = event.duration || 6;
    const progress = Math.min(1, Math.max(0, (frame - event.frame) / duration));

    switch (event.effect) {
      case 'zoom-snap': {
        const z = zoomSnap(progress);
        totalScale *= z.scale;
        break;
      }
      case 'zoom-pulse': {
        const z = zoomPulse(progress);
        totalScale *= z.scale;
        break;
      }
      case 'camera-shake': {
        const s = cameraShake(progress);
        totalTranslateX += s.translateX;
        totalTranslateY += s.translateY;
        break;
      }
      case 'saturation-spike': {
        totalSaturate += 0.6 * Math.sin(progress * Math.PI);
        break;
      }
      case 'color-invert-flash': {
        showInvert = progress < 0.5;
        break;
      }
      case 'rotation-tilt': {
        totalRotate += 1.5 * Math.sin(progress * Math.PI);
        break;
      }
      case 'snap-zoom-hold': {
        const z = snapZoomHold(progress);
        totalScale *= z.scale;
        break;
      }
      case 'speed-ramp-slow': {
        // Visual indicator: slight saturation boost
        totalSaturate += 0.2 * Math.sin(progress * Math.PI);
        break;
      }
      case 'beat-zoom': {
        const z = beatZoom(progress);
        totalScale *= z.scale;
        break;
      }
      case 'glitch': {
        showGlitch = true;
        totalTranslateX += (Math.sin(frame * 17.3) * 6);
        glitchHue = progress < 0.5 ? 90 : 0;
        break;
      }
    }
  }

  const hasTransform = totalScale !== 1 || totalRotate !== 0 || totalTranslateX !== 0 || totalTranslateY !== 0;
  const hasFilter = totalSaturate !== 1 || showInvert || glitchHue !== 0;

  if (!hasTransform && !hasFilter && !showGlitch) return null;

  const filterParts = [];
  if (totalSaturate !== 1) filterParts.push(`saturate(${totalSaturate.toFixed(2)})`);
  if (showInvert) filterParts.push('invert(1)');
  if (glitchHue !== 0) filterParts.push(`hue-rotate(${glitchHue}deg)`);

  return (
    <>
      {/* Transform layer — scales, rotates, translates the content beneath */}
      {hasTransform && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 45,
            transform: [
              totalScale !== 1 ? `scale(${totalScale.toFixed(4)})` : '',
              totalRotate !== 0 ? `rotate(${totalRotate.toFixed(2)}deg)` : '',
              (totalTranslateX !== 0 || totalTranslateY !== 0)
                ? `translate(${totalTranslateX.toFixed(1)}px, ${totalTranslateY.toFixed(1)}px)`
                : '',
            ].filter(Boolean).join(' '),
            transformOrigin: 'center center',
          }}
        />
      )}

      {/* Filter overlay — saturation, invert, hue-rotate */}
      {hasFilter && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 46,
            mixBlendMode: showInvert ? 'difference' : 'normal',
            backgroundColor: showInvert ? 'rgba(255,255,255,0.15)' : 'transparent',
            filter: filterParts.join(' '),
          }}
        />
      )}

      {/* Glitch displacement layer */}
      {showGlitch && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 47,
            background: `linear-gradient(transparent 45%, rgba(255,0,0,0.05) 45%, rgba(255,0,0,0.05) 55%, transparent 55%)`,
            transform: `translateX(${Math.sin(frame * 23.7) * 8}px)`,
            mixBlendMode: 'screen',
          }}
        />
      )}
    </>
  );
};

export default DopamineEffectsLayer;
