/**
 * src/scenes/V8MotionComposition.jsx — L111 custom MOTION-GRAPHICS organic.
 *
 * The leap past "Pexels stock clip + captions": every beat is a composed motion
 * graphic — Ken-Burns hero backdrop + animated brand accents + a KINETIC HEADLINE
 * (the beat's opening phrase, sprung in word-by-word) + a data/number callout +
 * the per-word karaoke captions + a retention progress bar.
 *
 * IMPORTANT: uses the SAME props as V8OrganicComposition (beats, wordBoundaries,
 * powerWords, audioFile, brand) — headlines are DERIVED from wordBoundaries, so
 * the render-prop builder (daily-auto-v8) needs no change. Registered alongside
 * the original; selected only when ORGANIC_MOTION=1 (default off until verified),
 * so the live render path is never disturbed.
 *
 * $0, CPU/Chromium only, no GPU.
 */

import React from 'react';
import { AbsoluteFill, Audio, Sequence, Video, Img, staticFile, spring, interpolate, Easing, useCurrentFrame, useVideoConfig } from 'remotion';

const ANTON = 'Anton, Impact, "Arial Black", sans-serif';
const C = { warm: '#FFD200', red: '#FF3B3B', text: '#F8FAFC', dim: 'rgba(248,250,252,0.45)', ink: '#0B0B0F' };

function isVideoSrc(p) { return /\.(mp4|webm|mov|mkv)$/i.test(String(p || '')); }

// Words spoken inside a beat's [fromSec,toSec] window → the beat's phrase.
function beatWords(wordBoundaries, fromSec, toSec) {
  if (!Array.isArray(wordBoundaries)) return [];
  return wordBoundaries.filter((w) => {
    const t = Number(w.startSeconds);
    return t >= fromSec - 0.05 && t < toSec;
  });
}
function firstNumber(words) {
  for (const w of words) {
    const m = /\$?\d[\d,.]*\s*(%|percent|million|billion|trillion|k|m|b)?/i.exec(String(w.word || ''));
    if (m && /\d/.test(m[0]) && m[0].replace(/[^\d]/g, '').length >= 1) return m[0].replace(/percent/i, '%').trim();
  }
  return null;
}

// ── Ken-Burns hero backdrop (image OR video) ────────────────────────────────
function Backdrop({ src, durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, durationInFrames || fps * 4);
  const dir = (Math.round(durationInFrames || 0) % 2 === 0) ? 1 : -1;
  const kb = interpolate(frame, [0, total], [1.08, 1.2], { extrapolateRight: 'clamp' });
  const panX = interpolate(frame, [0, total], [0, 30 * dir], { extrapolateRight: 'clamp' });
  const panY = interpolate(frame, [0, total], [0, -18], { extrapolateRight: 'clamp' });
  const op = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const inner = { width: '100%', height: '100%', objectFit: 'cover' };
  return (
    <AbsoluteFill style={{ opacity: op, backgroundColor: C.ink }}>
      <AbsoluteFill style={{ transform: `scale(${kb.toFixed(4)}) translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px)` }}>
        {src ? (isVideoSrc(src) ? <Video src={src} startFrom={0} muted style={inner} /> : <Img src={src} style={inner} />) : null}
      </AbsoluteFill>
      {/* cinematic darken so text pops */}
      <AbsoluteFill style={{ background: 'radial-gradient(120% 80% at 50% 38%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
}

// ── Animated brand accents (motion-graphic feel) ────────────────────────────
function Accents() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  // a thin accent bar that sweeps in under the headline
  const sweep = spring({ frame: frame - 4, fps, config: { damping: 16, stiffness: 120 } });
  const barW = interpolate(sweep, [0, 1], [0, 420], { extrapolateRight: 'clamp' });
  // corner ticks pulse subtly
  const pulse = 0.6 + 0.4 * Math.sin((frame / fps) * 2.2);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 360, left: 64, height: 8, width: barW, background: `linear-gradient(90deg, ${C.red}, ${C.warm})`, borderRadius: 4, boxShadow: '0 0 16px rgba(255,210,0,0.6)' }} />
      <div style={{ position: 'absolute', top: 150, right: 56, width: 54, height: 54, borderTop: `5px solid ${C.warm}`, borderRight: `5px solid ${C.warm}`, opacity: pulse }} />
      <div style={{ position: 'absolute', bottom: 150, left: 56, width: 54, height: 54, borderBottom: `5px solid ${C.warm}`, borderLeft: `5px solid ${C.warm}`, opacity: pulse }} />
    </AbsoluteFill>
  );
}

// ── Kinetic headline: beat phrase, sprung in word-by-word, top third ─────────
function KineticHeadline({ words, beatStartFrame }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!words || !words.length) return null;
  const phrase = words.slice(0, 6).map((w) => String(w.word || '').trim()).filter(Boolean);
  if (!phrase.length) return null;
  const local = frame - beatStartFrame;
  // hold then fade after ~2.6s so the bottom karaoke owns the screen
  const out = interpolate(local, [fps * 2.0, fps * 2.7], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (out <= 0) return null;
  return (
    <div style={{ position: 'absolute', top: 188, left: 56, right: 56, opacity: out }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 18px' }}>
        {phrase.map((word, i) => {
          const s = spring({ frame: local - i * 4, fps, config: { damping: 13, stiffness: 200, mass: 0.6 } });
          const y = interpolate(s, [0, 1], [46, 0], { extrapolateRight: 'clamp' });
          const o = interpolate(s, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <span key={i} style={{
              fontFamily: ANTON, fontWeight: 900, fontSize: 84, lineHeight: 1.04,
              color: i === 0 ? C.warm : C.text, WebkitTextStroke: '3px black',
              textShadow: '0 5px 0 rgba(0,0,0,0.9), 0 10px 22px rgba(0,0,0,0.6)',
              transform: `translateY(${y.toFixed(1)}px)`, opacity: o, display: 'inline-block',
            }}>{word.toUpperCase()}</span>
          );
        })}
      </div>
    </div>
  );
}

// ── Data callout: big number pop (center-right) if the beat has a stat ───────
function DataCallout({ value, beatStartFrame }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!value) return null;
  const local = frame - beatStartFrame;
  const s = spring({ frame: local - fps * 0.4, fps, config: { damping: 10, stiffness: 220, mass: 0.5 } });
  const sc = interpolate(s, [0, 1], [0.3, 1], { extrapolateRight: 'clamp' });
  const out = interpolate(local, [fps * 2.4, fps * 3.0], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (out <= 0) return null;
  return (
    <div style={{ position: 'absolute', top: 470, right: 60, opacity: out, transform: `scale(${sc.toFixed(3)})`, transformOrigin: 'right center' }}>
      <div style={{ fontFamily: ANTON, fontWeight: 900, fontSize: 132, color: C.warm, WebkitTextStroke: '4px black', textShadow: '0 6px 0 rgba(0,0,0,0.9)' }}>{value}</div>
    </div>
  );
}

// ── Karaoke captions (same engine as V8OrganicComposition) ──────────────────
function Captions({ wordBoundaries = [], powerWords = [] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSec = frame / fps;
  if (!Array.isArray(wordBoundaries) || wordBoundaries.length === 0) return null;
  const isPower = (w) => powerWords.some((p) => String(p).toLowerCase() === String(w || '').toLowerCase().replace(/[^a-z0-9]/gi, ''));
  const chunks = [];
  for (let i = 0; i < wordBoundaries.length; i += 3) {
    const seg = wordBoundaries.slice(i, i + 3);
    if (!seg.length) continue;
    const start = seg[0].startSeconds;
    const end = seg[seg.length - 1].startSeconds + Math.max(0.1, seg[seg.length - 1].durationSeconds);
    chunks.push({ words: seg, start, end });
  }
  const active = chunks.find((c) => tSec >= c.start && tSec < c.end + 0.15);
  if (!active) return null;
  const csf = Math.round(active.start * fps);
  const enter = spring({ frame: frame - csf, fps, config: { damping: 12, stiffness: 200, mass: 0.6 } });
  const scale = interpolate(enter, [0, 1], [0.6, 1], { extrapolateRight: 'clamp' });
  const yRise = interpolate(enter, [0, 1], [40, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(enter, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%', background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.22) 70%, rgba(0,0,0,0) 100%)' }} />
      <div style={{ position: 'absolute', bottom: 220, left: 0, right: 0, textAlign: 'center', padding: '0 48px', transform: `translateY(${yRise}px) scale(${scale})`, opacity }}>
        <div style={{ display: 'inline-block', maxWidth: 980, lineHeight: 1.12 }}>
          {active.words.map((w, wi) => {
            const wStart = w.startSeconds;
            const wEnd = w.startSeconds + Math.max(0.12, w.durationSeconds);
            const isActive = tSec >= wStart && tSec < wEnd + 0.05;
            const power = isPower(w.word);
            const punch = isActive ? interpolate(spring({ frame: frame - Math.round(wStart * fps), fps, config: { damping: 9, stiffness: 260, mass: 0.5 } }), [0, 1], [1.28, 1.08], { extrapolateRight: 'clamp' }) : 1;
            const color = isActive ? (power ? C.warm : C.text) : C.dim;
            return (
              <span key={wi} style={{ fontFamily: ANTON, fontWeight: 900, letterSpacing: 1, fontSize: power ? 96 : 72, color, WebkitTextStroke: '3px black', textShadow: '0 4px 0 rgba(0,0,0,0.95), 0 8px 18px rgba(0,0,0,0.7)', display: 'inline-block', margin: '0 10px', transform: `scale(${punch})` }}>
                {String(w.word || '').toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ProgressBar() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: 'clamp' });
  return <div style={{ position: 'absolute', top: 0, left: 0, height: 7, width: `${pct}%`, background: `linear-gradient(90deg, ${C.red}, ${C.warm})`, boxShadow: '0 0 14px rgba(255,210,0,0.75)' }} />;
}

function BrandWordmark({ brand }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t0 = durationInFrames - 3 * fps;
  if (frame < t0) return null;
  const p = Math.min(1, (frame - t0) / 10);
  const op = interpolate(p, [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) });
  const slide = interpolate(p, [0, 1], [24, 0], { easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'absolute', bottom: 64, right: 28, padding: '8px 16px', backgroundColor: 'rgba(0,0,0,0.72)', borderLeft: `3px solid ${C.warm}`, fontFamily: ANTON, fontSize: 28, color: C.text, letterSpacing: 2, opacity: op, transform: `translateX(${slide}px)` }}>{brand}</div>
  );
}

export const V8MotionComposition = ({
  scriptId = 'demo', audioFile = null, beats = [], wordBoundaries = [], powerWords = [], brand = 'RAGNAR — NEUTRAL NEWS',
}) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      {beats.map((b, i) => {
        const startFrame = Math.round((b.fromSec || 0) * fps);
        const endFrame = Math.round((b.toSec || 0) * fps);
        const dur = Math.max(1, endFrame - startFrame);
        const bw = beatWords(wordBoundaries, b.fromSec || 0, b.toSec || 0);
        const num = firstNumber(bw);
        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur} layout="none">
            <Backdrop src={b.heroClip ? staticFile(b.heroClip) : null} durationInFrames={dur} />
            <Accents />
            <KineticHeadline words={bw} beatStartFrame={0} />
            <DataCallout value={num} beatStartFrame={0} />
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
