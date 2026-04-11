/**
 * V99Composition.jsx — V99 God Master Composition
 *
 * Wraps V12Composition with:
 * - DopamineEffectsLayer (10 visual effect types, beat-synced)
 * - Enhanced SFX via sfxPack prop passthrough
 * - Beat marker visual pulses
 *
 * Uses the same proven V12 rendering core, adds V99 enhancements on top.
 */

import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill, Sequence, interpolate } from 'remotion';
import { V12Composition } from './V12Composition';
import { DopamineEffectsLayer } from './DopamineEffectsLayer';

/**
 * Subtle beat marker pulse layer.
 * Shows a brief visual pulse on beat frames for subconscious rhythm satisfaction.
 */
const BeatMarkerLayer = ({ beatFrames = [] }) => {
  const frame = useCurrentFrame();

  // Find if current frame is near a beat
  const nearestBeat = beatFrames.find(bf => frame >= bf && frame < bf + 4);
  if (!nearestBeat) return null;

  const progress = (frame - nearestBeat) / 4;
  const opacity = interpolate(progress, [0, 0.3, 1], [0.08, 0.04, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(progress, [0, 1], [1.0, 1.03], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        zIndex: 44,
        background: `radial-gradient(circle at center, rgba(255,255,255,${opacity}) 0%, transparent 70%)`,
        transform: `scale(${scale})`,
      }}
    />
  );
};

/**
 * V99Composition — Enhanced composition with dopamine effects and beat sync.
 */
export const V99Composition = ({
  scenes = [],
  captionChunks = [],
  mixedAudioFile,
  voiceoverFile,
  hasBGM = false,
  hookPackage = null,
  avatarPackage = null,
  retentionBlueprint = null,
  enableV13Hacks = false,
  // V99 enhancements
  dopaminePlan = [],
  sfxPack = null,
  beatFrames = [],
}) => {
  return (
    <AbsoluteFill>
      {/* Core V12 composition — proven stable rendering */}
      <V12Composition
        scenes={scenes}
        captionChunks={captionChunks}
        mixedAudioFile={mixedAudioFile}
        voiceoverFile={voiceoverFile}
        hasBGM={hasBGM}
        hookPackage={hookPackage}
        avatarPackage={avatarPackage}
        retentionBlueprint={retentionBlueprint}
        enableV13Hacks={enableV13Hacks}
      />

      {/* V99: Dopamine Effects Layer — 10 visual effect types */}
      {dopaminePlan.length > 0 && (
        <DopamineEffectsLayer dopaminePlan={dopaminePlan} />
      )}

      {/* V99: Beat Marker Layer — subtle rhythm pulses */}
      {beatFrames.length > 0 && (
        <BeatMarkerLayer beatFrames={beatFrames} />
      )}
    </AbsoluteFill>
  );
};

export default V99Composition;
