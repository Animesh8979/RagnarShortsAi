/**
 * src/scenes/news-scenes.jsx — generative scene components for the organic lane.
 *
 * Competitor-validated format (maps are the #1 geopolitics growth lever):
 *   • MapScene        — dark grid map, REAL country names from the script as
 *                       glowing pins, an animated strike/route arc drawn between
 *                       them with a travelling pulse. Region auto-zooms to fit.
 *   • FaceScene       — REAL Wikimedia portrait of the named leader, Ken-Burns
 *                       in, with a news chyron (name + role).
 *   • TalkingPresenter — a vector "anchor" stickman whose mouth lip-flaps to the
 *                       word timings (the faceless presenter), idle bob + gesture.
 *
 * All useCurrentFrame()-driven (no CSS transitions → no render flicker).
 * $0, CPU/Chromium, no GPU.  beatStartFrame is 0 because these mount inside a
 * <Sequence> (frame is already sequence-local).
 */
import React from 'react';
import { AbsoluteFill, Img, staticFile, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const ANTON = 'Anton, Impact, "Arial Black", sans-serif';
const C = { warm: '#FFD200', red: '#FF3B3B', text: '#F8FAFC', ink: '#0B1020', grid: 'rgba(120,170,255,0.13)', land: 'rgba(90,130,200,0.18)' };

// equirectangular projection (matches lib/geo-coords)
function proj(lon, lat, W, H) { return { x: (lon + 180) / 360 * W, y: (90 - lat) / 180 * H }; }

// ── MapScene: real places + animated arc ────────────────────────────────────
export function MapScene({ places = [], durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  if (!places.length) return null;
  // world-space points
  const pts = places.map((p) => ({ ...p, ...proj(p.lon, p.lat, 3600, 1800) }));
  // bbox + region zoom so pins fill the upper 2/3 of the 9:16 frame
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const pad = 360;
  let minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const bw = Math.max(maxX - minX, 700), bh = Math.max(maxY - minY, 900);
  const scale = Math.min(W / bw, (H * 0.62) / bh);
  const toScreen = (p) => ({ x: (p.x - minX) * scale + (W - bw * scale) / 2, y: (p.y - minY) * scale + 120 });
  const sp = pts.map(toScreen);

  const arcProg = interpolate(frame, [fps * 0.5, fps * 1.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const a = sp[0], b = sp[1] || sp[0];
  const midX = (a.x + b.x) / 2, midY = Math.min(a.y, b.y) - Math.hypot(b.x - a.x, b.y - a.y) * 0.28 - 30;
  const arcD = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
  // travelling pulse position via quadratic bezier lerp
  const tt = arcProg;
  const qx = (1 - tt) * (1 - tt) * a.x + 2 * (1 - tt) * tt * midX + tt * tt * b.x;
  const qy = (1 - tt) * (1 - tt) * a.y + 2 * (1 - tt) * tt * midY + tt * tt * b.y;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(130% 90% at 50% 30%, #142046 0%, ${C.ink} 70%)` }}>
      {/* graticule grid */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 13 }).map((_, i) => <line key={'v' + i} x1={i * W / 12} y1={0} x2={i * W / 12} y2={H} stroke={C.grid} strokeWidth={1} />)}
        {Array.from({ length: 22 }).map((_, i) => <line key={'h' + i} x1={0} y1={i * H / 21} x2={W} y2={i * H / 21} stroke={C.grid} strokeWidth={1} />)}
        {/* arc (drawn via normalized dash) */}
        {sp.length >= 2 && (
          <>
            <path d={arcD} fill="none" stroke={C.red} strokeWidth={9} strokeLinecap="round"
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arcProg}
              style={{ filter: 'drop-shadow(0 0 10px rgba(255,59,59,0.8))' }} />
            <circle cx={qx} cy={qy} r={12} fill={C.warm} style={{ filter: 'drop-shadow(0 0 14px rgba(255,210,0,0.9))' }} />
          </>
        )}
        {/* pins */}
        {sp.map((p, i) => {
          const pin = spring({ frame: frame - 6 - i * 7, fps, config: { damping: 11, stiffness: 200 } });
          const r = interpolate(pin, [0, 1], [0, 16], { extrapolateRight: 'clamp' });
          const ring = 16 + (Math.sin((frame / fps) * 4 + i) * 0.5 + 0.5) * 24;
          return (
            <g key={'p' + i}>
              <circle cx={p.x} cy={p.y} r={ring} fill="none" stroke={C.warm} strokeWidth={2} opacity={0.35} />
              <circle cx={p.x} cy={p.y} r={r} fill={C.warm} style={{ filter: 'drop-shadow(0 0 10px rgba(255,210,0,0.9))' }} />
            </g>
          );
        })}
      </svg>
      {/* real-name labels */}
      {pts.map((p, i) => {
        const s = sp[i];
        const lab = spring({ frame: frame - 10 - i * 7, fps, config: { damping: 12, stiffness: 200 } });
        const o = interpolate(lab, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' });
        const ty = interpolate(lab, [0, 1], [18, 0], { extrapolateRight: 'clamp' });
        return (
          <div key={'l' + i} style={{ position: 'absolute', left: s.x + 24, top: s.y - 30, opacity: o, transform: `translateY(${ty}px)` }}>
            <span style={{ fontFamily: ANTON, fontSize: 46, color: C.text, background: 'rgba(0,0,0,0.55)', padding: '2px 12px', borderLeft: `4px solid ${C.warm}`, WebkitTextStroke: '1px black', whiteSpace: 'nowrap' }}>{p.name}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ── FaceScene: real portrait + chyron ───────────────────────────────────────
export function FaceScene({ portraitSrc, name = '', durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, durationInFrames || fps * 4);
  const kb = interpolate(frame, [0, total], [1.06, 1.16], { extrapolateRight: 'clamp' });
  const op = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const chy = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 160 } });
  const chyX = interpolate(chy, [0, 1], [-520, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 35%, #1a2240 0%, ${C.ink} 75%)`, opacity: op }}>
      {portraitSrc && (
        <AbsoluteFill style={{ transform: `scale(${kb.toFixed(4)})` }}>
          <Img src={portraitSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <AbsoluteFill style={{ background: 'radial-gradient(110% 70% at 50% 38%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)' }} />
        </AbsoluteFill>
      )}
      {name && (
        <div style={{ position: 'absolute', left: 0, bottom: 470, transform: `translateX(${chyX}px)` }}>
          <div style={{ background: C.red, padding: '10px 26px 10px 56px', fontFamily: ANTON, fontSize: 60, color: '#fff', letterSpacing: 1, WebkitTextStroke: '1px black', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>{String(name).toUpperCase()}</div>
        </div>
      )}
    </AbsoluteFill>
  );
}

// ── TalkingPresenter: vector anchor, mouth lip-flaps to word timings ─────────
export function TalkingPresenter({ wordBoundaries = [], beatFromSec = 0, durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSecAbs = beatFromSec + frame / fps; // absolute time (word timings are absolute)
  // is a word being spoken right now?
  const speaking = Array.isArray(wordBoundaries) && wordBoundaries.some((w) => {
    const s = Number(w.startSeconds); return tSecAbs >= s && tSecAbs < s + Math.max(0.1, Number(w.durationSeconds) || 0.2);
  });
  // mouth open amount: oscillates fast while speaking, closed when silent
  const mouthOpen = speaking ? (6 + (Math.sin(frame * 1.6) * 0.5 + 0.5) * 22) : 4;
  const bob = Math.sin((frame / fps) * 2.0) * 6;          // idle head bob
  const armSwing = Math.sin((frame / fps) * 1.4) * 10;    // subtle gesture
  const cx = 540, cy = 760 + bob;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 30%, #16204a 0%, ${C.ink} 72%)` }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {/* desk */}
        <rect x={210} y={1080} width={660} height={300} rx={20} fill="rgba(255,210,0,0.10)" stroke={C.warm} strokeWidth={3} />
        {/* body */}
        <path d={`M ${cx - 150} 1090 Q ${cx} 880 ${cx + 150} 1090 Z`} fill="#26365f" stroke={C.warm} strokeWidth={4} />
        {/* arms (subtle gesture) */}
        <line x1={cx - 120} y1={980} x2={cx - 190 + armSwing} y2={1060} stroke="#26365f" strokeWidth={26} strokeLinecap="round" />
        <line x1={cx + 120} y1={980} x2={cx + 190 - armSwing} y2={1060} stroke="#26365f" strokeWidth={26} strokeLinecap="round" />
        {/* head */}
        <circle cx={cx} cy={cy} r={120} fill="#F4C9A0" stroke={C.warm} strokeWidth={5} />
        {/* eyes */}
        <circle cx={cx - 42} cy={cy - 24} r={12} fill="#10131c" />
        <circle cx={cx + 42} cy={cy - 24} r={12} fill="#10131c" />
        {/* brows */}
        <rect x={cx - 58} y={cy - 58} width={36} height={7} rx={3} fill="#3a2a1a" />
        <rect x={cx + 22} y={cy - 58} width={36} height={7} rx={3} fill="#3a2a1a" />
        {/* mouth — height driven by speech */}
        <ellipse cx={cx} cy={cy + 46} rx={34} ry={Math.max(3, mouthOpen)} fill="#5a1414" />
      </svg>
      {/* "LIVE" badge */}
      <div style={{ position: 'absolute', top: 150, left: 56, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: C.red, opacity: 0.5 + 0.5 * Math.sin(frame * 0.5) }} />
        <span style={{ fontFamily: ANTON, fontSize: 34, color: C.text, letterSpacing: 3 }}>LIVE</span>
      </div>
    </AbsoluteFill>
  );
}
