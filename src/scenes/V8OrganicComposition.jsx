/**
 * src/scenes/V8OrganicComposition.jsx — MASTER-REBUILD organic composition
 *
 * Per master-rebuild Phase 2: hero visuals are PRE-RENDERED FLUX-parallax
 * motion clips (one per beat), composed in sequence by Remotion. This
 * replaces V7's per-beat Three.js scene authoring entirely.
 *
 * Per master-rebuild Phase 3: EXACTLY ONE caption element in the bottom 25%
 * — the word-level karaoke caption from Edge TTS boundaries. No duplicate
 * hero-word echo, no bottom-edge ticker.
 *
 * Props (passed via --props at render time):
 *   {
 *     scriptId,
 *     audioFile,                              // staticFile path to mp3
 *     beats: [
 *       { fromSec, toSec, heroClip (staticFile path), beatId }
 *     ],
 *     wordBoundaries: [{ word, startSeconds, durationSeconds }, ...],
 *     powerWords: [...],
 *     brand: 'RAGNAR — NEUTRAL NEWS'
 *   }
 */

import React from 'react';
import { AbsoluteFill, Audio, Sequence, Video, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

const ANTON = 'Anton, Impact, "Arial Black", sans-serif';
const COLORS = { warm: '#FFD200', text: '#F8FAFC' };

// Single caption element — karaoke 3-word chunks, lower-third only.
function Captions({ wordBoundaries = [], powerWords = [] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSec = frame / fps;
  if (!Array.isArray(wordBoundaries) || wordBoundaries.length === 0) return null;

  // 3-word chunks
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
  const fontSize = active.hasPower ? 96 : 72;
  const color = active.hasPower ? COLORS.warm : COLORS.text;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Subtle dark gradient seats the caption in the bottom 25% */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.22) 70%, rgba(0,0,0,0) 100%)',
      }} />
      <div style={{
        position: 'absolute', bottom: 220, left: 0, right: 0, textAlign: 'center', padding: '0 48px',
      }}>
        <div style={{
          fontFamily: ANTON, fontSize, color, fontWeight: 900,
          lineHeight: 1.1, letterSpacing: 1,
          textShadow: '0 4px 0 rgba(0,0,0,0.95), 0 8px 18px rgba(0,0,0,0.7)',
          WebkitTextStroke: '3px black',
          transform: `scale(${0.95 + 0.05 * popT})`,
          display: 'inline-block', maxWidth: 980,
        }}>
          {String(active.text || '').toUpperCase()}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Brand wordmark bottom-right in the last 3 seconds
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
      borderLeft: `3px solid ${COLORS.warm}`,
      fontFamily: ANTON, fontSize: 28, color: COLORS.text, letterSpacing: 2,
      opacity: op,
    }}>
      {brand}
    </div>
  );
}

export const V8OrganicComposition = ({
  scriptId = 'demo',
  audioFile = null,
  beats = [],
  wordBoundaries = [],
  powerWords = [],
  brand = 'RAGNAR — NEUTRAL NEWS',
}) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {beats.map((b, i) => {
        const startFrame = Math.round((b.fromSec || 0) * fps);
        const endFrame = Math.round((b.toSec || 0) * fps);
        const dur = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur} layout="none">
            <AbsoluteFill>
              <Video src={staticFile(b.heroClip)} startFrom={0} muted />
            </AbsoluteFill>
          </Sequence>
        );
      })}
      <Captions wordBoundaries={wordBoundaries} powerWords={powerWords} />
      <BrandWordmark brand={brand} />
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
    </AbsoluteFill>
  );
};
