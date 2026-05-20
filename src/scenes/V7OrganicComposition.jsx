/**
 * src/scenes/V7OrganicComposition.jsx — V7 full-script composition
 *
 * Sequences 7 V7BeatScene segments into a single ~32s short. Adds:
 *   - Edge TTS audio across the whole composition
 *   - Lower-third caption layer (word-boundary karaoke from boundaries.json)
 *   - Brand wordmark "RAGNAR — NEUTRAL NEWS" in the last 3 seconds
 *
 * Props (passed via --props at render time):
 *   {
 *     scriptId: 'A1-pakistan-iran' | 'A2-saudi-iraq',
 *     audioFile: 'v7-audio/A1-pakistan-iran.mp3',
 *     totalSeconds: 32,
 *     beats: [
 *       { beatId, fromSec, toSec, backdrop, heroText, subtitleText, accentColor, showFlash, camera },
 *       ...
 *     ],
 *     wordBoundaries: [{ word, startSeconds, durationSeconds }, ...],
 *     powerWords: ['PAKISTAN','IRAN',...]
 *   }
 */

import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { V7BeatScene } from './V7BeatScene';

const ANTON = 'Anton, Impact, "Arial Black", sans-serif';
const PALETTE = { warm: '#FFD200', text: '#F8FAFC' };

// Lower-third karaoke captions over the bottom 25% safe area.
// We position captions at y ~ 1500 px (bottom of TOP 75% region).
function Captions({ wordBoundaries, powerWords = [] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSec = frame / fps;
  if (!Array.isArray(wordBoundaries) || wordBoundaries.length === 0) return null;

  // Build 3-word chunks for readability
  const chunks = [];
  for (let i = 0; i < wordBoundaries.length; i += 3) {
    const seg = wordBoundaries.slice(i, i + 3);
    if (seg.length === 0) continue;
    const start = seg[0].startSeconds;
    const end = seg[seg.length - 1].startSeconds + Math.max(0.1, seg[seg.length - 1].durationSeconds);
    chunks.push({
      text: seg.map((s) => s.word).join(' '),
      start, end,
      hasPower: seg.some((s) => powerWords.some((p) => String(p).toLowerCase() === String(s.word || '').toLowerCase().replace(/[^a-z0-9]/gi, ''))),
    });
  }

  const active = chunks.find((c) => tSec >= c.start && tSec < c.end + 0.15);
  if (!active) return null;

  const localT = (tSec - active.start) / Math.max(0.1, active.end - active.start);
  const popT = Math.min(1, localT * 4);
  const fontSize = active.hasPower ? 92 : 68;
  const color = active.hasPower ? PALETTE.warm : PALETTE.text;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        bottom: 165,
        left: 0, right: 0,
        textAlign: 'center',
        padding: '0 48px',
      }}>
        <div style={{
          fontFamily: ANTON,
          fontSize,
          color,
          fontWeight: 900,
          lineHeight: 1.08,
          letterSpacing: 1,
          textShadow: '0 4px 0 rgba(0,0,0,0.95), 0 8px 18px rgba(0,0,0,0.7), 0 0 24px rgba(0,0,0,0.55)',
          WebkitTextStroke: '3px black',
          transform: `scale(${0.95 + 0.05 * popT})`,
          display: 'inline-block',
          maxWidth: 980,
        }}>
          {String(active.text || '').toUpperCase()}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Brand wordmark — bottom-right last 3s
function BrandWordmark({ brand = 'RAGNAR — NEUTRAL NEWS' }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t0 = durationInFrames - 3 * fps;
  if (frame < t0) return null;
  const op = Math.min(1, (frame - t0) / 8);
  return (
    <div style={{
      position: 'absolute', bottom: 64, right: 28,
      padding: '8px 16px',
      backgroundColor: 'rgba(0,0,0,0.72)',
      borderLeft: `3px solid ${PALETTE.warm}`,
      fontFamily: ANTON, fontSize: 28, color: PALETTE.text, letterSpacing: 2,
      opacity: op,
    }}>
      {brand}
    </div>
  );
}

export const V7OrganicComposition = ({
  scriptId = 'A1-pakistan-iran',
  audioFile = null,
  beats = [],
  wordBoundaries = [],
  powerWords = [],
  brand = 'RAGNAR — NEUTRAL NEWS',
}) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#04060C' }}>
      {beats.map((b, i) => {
        const startFrame = Math.round((b.fromSec || 0) * fps);
        const endFrame = Math.round((b.toSec || 0) * fps);
        const dur = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur} layout="none">
            <V7BeatScene
              backdropFile={b.backdrop}
              heroText={b.heroText}
              subtitleText={b.subtitleText}
              accentColor={b.accentColor}
              beatId={b.beatId}
              showFlash={b.showFlash !== false && (b.beatId === 'hook' || b.beatId === 'loop_cliffhanger')}
              camera={b.camera || { from: [0.25, 0.25, 4.6], to: [-0.05, 0.1, 4.2] }}
            />
          </Sequence>
        );
      })}
      <Captions wordBoundaries={wordBoundaries} powerWords={powerWords} />
      <BrandWordmark brand={brand} />
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
    </AbsoluteFill>
  );
};
