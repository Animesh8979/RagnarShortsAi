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
import { AbsoluteFill, Audio, Sequence, Video, staticFile, spring, interpolate, Easing, useCurrentFrame, useVideoConfig } from 'remotion';

const ANTON = 'Anton, Impact, "Arial Black", sans-serif';
const COLORS = { warm: '#FFD200', text: '#F8FAFC', dim: 'rgba(248,250,252,0.45)' };

// Single caption element — karaoke 3-word chunks, lower-third only.
// L110 Remotion upgrade: spring() entrance physics + per-WORD active highlight
// (true karaoke, not whole-chunk) + power-word zoom punch.
function Captions({ wordBoundaries = [], powerWords = [] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSec = frame / fps;
  if (!Array.isArray(wordBoundaries) || wordBoundaries.length === 0) return null;

  const isPower = (w) => powerWords.some((p) => String(p).toLowerCase() === String(w || '').toLowerCase().replace(/[^a-z0-9]/gi, ''));

  // 3-word chunks, each word keeps its own timing for per-word highlight.
  const chunks = [];
  for (let i = 0; i < wordBoundaries.length; i += 3) {
    const seg = wordBoundaries.slice(i, i + 3);
    if (seg.length === 0) continue;
    const start = seg[0].startSeconds;
    const end = seg[seg.length - 1].startSeconds + Math.max(0.1, seg[seg.length - 1].durationSeconds);
    chunks.push({ words: seg, start, end });
  }
  const active = chunks.find((c) => tSec >= c.start && tSec < c.end + 0.15);
  if (!active) return null;

  // Spring entrance: punchy pop-in over the first ~10 frames of the chunk.
  const chunkStartFrame = Math.round(active.start * fps);
  const enter = spring({ frame: frame - chunkStartFrame, fps, config: { damping: 12, stiffness: 200, mass: 0.6 } });
  const scale = interpolate(enter, [0, 1], [0.6, 1], { extrapolateRight: 'clamp' });
  const yRise = interpolate(enter, [0, 1], [40, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(enter, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.22) 70%, rgba(0,0,0,0) 100%)',
      }} />
      <div style={{
        position: 'absolute', bottom: 220, left: 0, right: 0, textAlign: 'center', padding: '0 48px',
        transform: `translateY(${yRise}px) scale(${scale})`, opacity,
      }}>
        <div style={{ display: 'inline-block', maxWidth: 980, lineHeight: 1.12 }}>
          {active.words.map((w, wi) => {
            const wStart = w.startSeconds;
            const wEnd = w.startSeconds + Math.max(0.12, w.durationSeconds);
            const isActive = tSec >= wStart && tSec < wEnd + 0.05;
            const power = isPower(w.word);
            // active word gets an extra spring "punch" in scale
            const punch = isActive
              ? interpolate(spring({ frame: frame - Math.round(wStart * fps), fps, config: { damping: 9, stiffness: 260, mass: 0.5 } }), [0, 1], [1.28, 1.08], { extrapolateRight: 'clamp' })
              : 1;
            const color = isActive ? (power ? COLORS.warm : COLORS.text) : COLORS.dim;
            return (
              <span key={wi} style={{
                fontFamily: ANTON, fontWeight: 900, letterSpacing: 1,
                fontSize: power ? 96 : 72, color,
                WebkitTextStroke: '3px black',
                textShadow: '0 4px 0 rgba(0,0,0,0.95), 0 8px 18px rgba(0,0,0,0.7)',
                display: 'inline-block', margin: '0 10px',
                transform: `scale(${punch})`,
                transition: 'none',
              }}>
                {String(w.word || '').toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Per-beat hero with CONTINUOUS motion — real animation, not a static-ish stock
// clip. Every beat gets a Ken Burns push-in (scale ramps across the whole beat)
// + a slow diagonal parallax pan, a spring entry, and a 6-frame crossfade. So the
// frame is always moving cinematically even when the underlying visual is a still
// or a slow stock clip. (frame + durationInFrames are Sequence-local in Remotion.)
function BeatClip({ src, durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, durationInFrames || fps * 4);
  // direction alternates per beat so the pan doesn't feel repetitive
  const dir = (Math.round(durationInFrames || 0) % 2 === 0) ? 1 : -1;
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 130, mass: 0.9 } });
  const entryScale = interpolate(enter, [0, 1], [1.05, 1], { extrapolateRight: 'clamp' });
  const kb = interpolate(frame, [0, total], [1.08, 1.18], { extrapolateRight: 'clamp' }); // continuous push-in
  const panX = interpolate(frame, [0, total], [0, 26 * dir], { extrapolateRight: 'clamp' });
  const panY = interpolate(frame, [0, total], [0, -16], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity, backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${(kb * entryScale).toFixed(4)}) translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px)` }}>
        <Video src={src} startFrom={0} muted />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// Retention progress bar — a thin brand-colored bar that fills 0→100% across the
// whole short. Standard viral-edit cue ("how much is left") + constant motion.
function ProgressBar() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, height: 7, width: `${pct}%`,
      background: `linear-gradient(90deg, #FF3B3B, ${COLORS.warm})`,
      boxShadow: '0 0 14px rgba(255,210,0,0.75)',
    }} />
  );
}

// Brand wordmark bottom-right in the last 3 seconds
function BrandWordmark({ brand = 'RAGNAR — NEUTRAL NEWS' }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t0 = durationInFrames - 3 * fps;
  if (frame < t0) return null;
  // eased slide-in + fade (was a bare linear fade)
  const p = Math.min(1, (frame - t0) / 10);
  const op = interpolate(p, [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) });
  const slide = interpolate(p, [0, 1], [24, 0], { easing: Easing.out(Easing.cubic) });
  return (
    <div style={{
      position: 'absolute', bottom: 64, right: 28,
      padding: '8px 16px',
      backgroundColor: 'rgba(0,0,0,0.72)',
      borderLeft: `3px solid ${COLORS.warm}`,
      fontFamily: ANTON, fontSize: 28, color: COLORS.text, letterSpacing: 2,
      opacity: op, transform: `translateX(${slide}px)`,
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
            <BeatClip src={staticFile(b.heroClip)} durationInFrames={dur} />
          </Sequence>
        );
      })}
      <ProgressBar />
      <Captions wordBoundaries={wordBoundaries} powerWords={powerWords} />
      <BrandWordmark brand={brand} />
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
    </AbsoluteFill>
  );
};
