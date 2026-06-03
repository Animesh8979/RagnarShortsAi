/**
 * src/scenes/V10CinematicComposition.jsx — L114 V10 CINEMATIC REBUILD.
 *
 * Consumes the SAME props as V9 (directorPlan.beats + wordBoundaries + powerWords)
 * but renders a real LAYERED z-stack with depth, a cohesive design system, camera
 * moves driven by the director's own cameraMove/emotion/cutType fields, atmosphere
 * (grain+vignette+light-leak+grade), premium google-font typography, and
 * scene-to-scene transitions (no hard cuts). Targets the QA "cinematic" tier.
 *
 * $0/CPU: google-fonts bundle locally, OffthreadVideo/Img + staticFile, all motion
 * from useCurrentFrame(). Selected via ORGANIC_CINEMATIC=1 (V10→V9→V8 fallback).
 */
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring,
  Sequence, OffthreadVideo, Img, staticFile, Easing,
} from 'remotion';
import { TransitionSeries, springTiming, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';

// ===== V10 DESIGN-TOKEN SYSTEM (inlined — one source of truth for the cohesion the QA wanted) =====
const C = {
  ink0: '#05070d', ink1: '#0a0e17', ink2: '#121826', paper: '#f4f6fb', paperDim: 'rgba(244,246,251,0.62)',
  red: '#ff3b30', redDeep: '#c81e12', amber: '#ffb02e', cyan: '#29d3ff', teal: '#0bb89b', line: 'rgba(148,176,214,0.20)',
};
const EMOTION_TINT = {
  tension: { warm: 'rgba(120,40,18,0.20)', cool: 'rgba(20,60,120,0.18)', accent: C.red },
  gravitas: { warm: 'rgba(90,60,20,0.16)', cool: 'rgba(18,40,90,0.20)', accent: C.amber },
  hope: { warm: 'rgba(60,80,30,0.14)', cool: 'rgba(20,90,120,0.18)', accent: C.cyan },
  shock: { warm: 'rgba(140,30,20,0.24)', cool: 'rgba(30,40,110,0.16)', accent: C.red },
  default: { warm: 'rgba(110,55,20,0.16)', cool: 'rgba(20,55,110,0.18)', accent: C.amber },
};
const TYPE = { display: 168, h1: 96, h2: 68, chyron: 52, label: 46, caption: 74, captionPower: 86, kicker: 34, micro: 30 };
const S = { gutter: 84, safeTop: 150, safeBottom: 250, gap: 28, radius: 16 };
const MOTION = { enter: { damping: 14, stiffness: 170, mass: 0.7 }, pop: { damping: 11, stiffness: 240, mass: 0.5 }, drift: { damping: 200, stiffness: 30, mass: 1 }, transFrames: 20, enterFrames: 14, pushScale: 0.10 };
function cameraFor(move, frame, dur) {
  const t = Math.min(1, Math.max(0, frame / Math.max(1, dur)));
  const ease = t * t * (3 - 2 * t);
  switch (String(move || '').toLowerCase()) {
    case 'dolly-in': case 'push-in': case 'zoom-in': return { scale: 1.06 + ease * 0.12, x: 0, y: -ease * 14 };
    case 'dolly-out': case 'pull-back': return { scale: 1.20 - ease * 0.12, x: 0, y: ease * 10 };
    case 'pan-left': case 'lateral': return { scale: 1.14, x: (0.5 - ease) * 90, y: 0 };
    case 'pan-right': return { scale: 1.14, x: (ease - 0.5) * 90, y: 0 };
    case 'orbit': case 'arc': return { scale: 1.12 + ease * 0.06, x: Math.sin(ease * Math.PI) * 40, y: -ease * 8 };
    case 'tilt-up': return { scale: 1.14, x: 0, y: (0.5 - ease) * 70 };
    default: return { scale: 1.07 + ease * 0.09, x: Math.sin(frame * 0.03) * 3, y: -ease * 10 };
  }
}
function emotionTint(e) { return EMOTION_TINT[String(e || '').toLowerCase()] || EMOTION_TINT.default; }
// robust text coercion (beat fields can be arrays/objects/numbers)
function asText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (x && (x.name || x.label || x.value) != null ? (x.name || x.label || x.value) : x)).filter(Boolean).join(' · ');
  if (typeof v === 'object') return String(v.name || v.label || v.value || v.text || '');
  return String(v);
}

// --- premium cohesive typography (bundled, no network at render) ------------
let DISPLAY = '"Archivo Black",system-ui,sans-serif';
let BODY = '"Oswald","Archivo Narrow",system-ui,sans-serif';
try { DISPLAY = require('@remotion/google-fonts/Anton').loadFont('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily; } catch (_) {}
try { BODY = require('@remotion/google-fonts/Oswald').loadFont('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily; } catch (_) {}

const W = 1080, H = 1920;

// ============================================================================
// projection — fit a set of {name,lon,lat} places into the map viewport
// ============================================================================
function fitProjection(places, vp) {
  const pts = (places || []).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (!pts.length) return null;
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const p of pts) { minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon); minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); }
  const padLon = Math.max(8, (maxLon - minLon) * 0.5), padLat = Math.max(6, (maxLat - minLat) * 0.5);
  minLon -= padLon; maxLon += padLon; minLat -= padLat; maxLat += padLat;
  const spanLon = maxLon - minLon || 1, spanLat = maxLat - minLat || 1;
  return (lon, lat) => ({
    x: vp.x + ((lon - minLon) / spanLon) * vp.w,
    y: vp.y + (1 - (lat - minLat) / spanLat) * vp.h,
  });
}

// ============================================================================
// LAYER 1 — CinematicPlate: the deep background with a real camera move + DoF
// ============================================================================
function CinematicPlate({ beat, tint }) {
  const frame = useCurrentFrame();
  const dur = Math.max(1, Math.round(((beat.toSec || 3) - (beat.fromSec || 0)) * 30));
  const cam = cameraFor(beat.cameraMove, frame, dur);
  const hero = beat.heroClip;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink0 }}>
      <AbsoluteFill style={{ transform: `scale(${cam.scale.toFixed(3)}) translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px)`, transformOrigin: '50% 42%' }}>
        {hero ? (
          <OffthreadVideo src={staticFile(hero)} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.18) contrast(1.08) brightness(0.82)' }} />
        ) : (
          // rich procedural "situation-room" plate — bright enough to read as a designed scene, not black
          <AbsoluteFill>
            <AbsoluteFill style={{ background: 'radial-gradient(125% 95% at 50% 34%, #1d2942 0%, #131d31 38%, #0a111e 72%, #05070d 100%)' }} />
            <AbsoluteFill style={{ background: `radial-gradient(58% 42% at 50% 36%, ${tint.cool.replace(/0\.\d+/, '0.55')} 0%, rgba(0,0,0,0) 62%)`, mixBlendMode: 'screen' }} />
            <AbsoluteFill style={{ background: `radial-gradient(40% 30% at 72% 24%, ${String(tint.accent)}22 0%, rgba(0,0,0,0) 60%)`, mixBlendMode: 'screen' }} />
            {/* soft landmass + atmosphere depth (blurred organic blobs, not a flat grid) */}
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.62, filter: 'blur(2px)' }}>
              <defs>
                <radialGradient id="land" cx="50%" cy="42%" r="60%"><stop offset="0%" stopColor="rgba(70,110,170,0.6)" /><stop offset="100%" stopColor="rgba(12,22,40,0)" /></radialGradient>
              </defs>
              <ellipse cx={W * 0.40} cy={H * 0.34} rx={560} ry={380} fill="url(#land)" />
              <ellipse cx={W * 0.70} cy={H * 0.52} rx={380} ry={320} fill="url(#land)" />
            </svg>
            {/* faint meridian arcs for a global-ops feel */}
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.16 }}>
              {[0, 1, 2, 3].map((i) => <ellipse key={i} cx={W / 2} cy={H * 0.42} rx={220 + i * 150} ry={300 + i * 130} fill="none" stroke={C.cyan} strokeWidth={1.5} />)}
            </svg>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
      {/* depth-of-field + grade so content sits IN the scene (lighter when procedural so it isn't black) */}
      <AbsoluteFill style={{ background: hero ? 'linear-gradient(180deg, rgba(3,5,11,0.62) 0%, rgba(3,5,11,0.12) 32%, rgba(3,5,11,0.20) 64%, rgba(3,5,11,0.84) 100%)' : 'linear-gradient(180deg, rgba(3,5,11,0.45) 0%, rgba(3,5,11,0.05) 36%, rgba(3,5,11,0.10) 64%, rgba(3,5,11,0.62) 100%)' }} />
    </AbsoluteFill>
  );
}

// ============================================================================
// LAYER TOP — Atmosphere: grain + vignette + light-leak + split-tone + bloom
// ============================================================================
function Atmosphere({ tint }) {
  const frame = useCurrentFrame();
  const leak = (Math.sin(frame * 0.04) + 1) / 2;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${tint.cool} 0%, rgba(0,0,0,0) 46%, ${tint.warm} 100%)`, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(130% 100% at 50% 44%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.66) 100%)' }} />
      <AbsoluteFill style={{ background: `radial-gradient(40% 30% at ${20 + leak * 12}% 18%, rgba(255,180,90,${0.05 + leak * 0.06}) 0%, rgba(0,0,0,0) 60%)`, mixBlendMode: 'screen' }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'overlay' }}>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 12} stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
}

// small-caps eyebrow kicker
function Kicker({ children, color }) {
  return <div style={{ fontFamily: BODY, fontSize: TYPE.kicker, fontWeight: 600, letterSpacing: 6, textTransform: 'uppercase', color: color || C.amber, opacity: 0.92 }}>{children}</div>;
}

// glassmorphism panel (cohesive surface used by every content block)
function Glass({ children, style }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, rgba(12,18,30,0.46), rgba(8,12,22,0.66))', border: `1px solid ${C.line}`, borderRadius: S.radius, boxShadow: '0 18px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', ...style }}>{children}</div>
  );
}

// ============================================================================
// SCENE — CinematicMap (threat-map: glowing nodes + animated arc + chyron)
// ============================================================================
function CinematicMap({ beat, tint, headline }) {
  const frame = useCurrentFrame();
  const vp = { x: 120, y: 430, w: W - 240, h: 510 };
  const proj = fitProjection(beat.places, vp);
  const enter = spring({ frame, fps: 30, config: MOTION.enter });
  const pts = (beat.places || []).map((p) => ({ ...p, ...(proj ? proj(p.lon, p.lat) : { x: W / 2, y: H / 2 }) }));
  const arcT = interpolate(frame, [6, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill>
      {/* top headline chyron — fills the top third (QA: "dead space top") */}
      <div style={{ position: 'absolute', top: S.safeTop, left: S.gutter, right: S.gutter, transform: `translateY(${(1 - enter) * -26}px)`, opacity: enter }}>
        <Kicker color={tint.accent}>● LIVE BRIEFING</Kicker>
        <div style={{ fontFamily: DISPLAY, fontSize: TYPE.h2, lineHeight: 0.96, color: C.paper, marginTop: 12, textShadow: '0 4px 30px rgba(0,0,0,0.6)' }}>{(headline || '').toUpperCase()}</div>
      </div>
      {/* the map viewport */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <linearGradient id="arc" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={C.amber} /><stop offset="100%" stopColor={C.red} /></linearGradient>
        </defs>
        {pts.length >= 2 && (() => {
          const a = pts[0], b = pts[pts.length - 1];
          const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 150;
          const path = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
          return <path d={path} fill="none" stroke="url(#arc)" strokeWidth={6} strokeLinecap="round" filter="url(#glow)" strokeDasharray={1400} strokeDashoffset={1400 - arcT * 1400} opacity={0.95} />;
        })()}
        {pts.map((p, i) => {
          const pulse = (Math.sin((frame - i * 8) * 0.12) + 1) / 2;
          return (
            <g key={i} opacity={interpolate(frame, [i * 6, i * 6 + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}>
              <circle cx={p.x} cy={p.y} r={18 + pulse * 10} fill={tint.accent} opacity={0.25} filter="url(#glow)" />
              <circle cx={p.x} cy={p.y} r={11} fill={C.paper} />
              <circle cx={p.x} cy={p.y} r={11} fill="none" stroke={tint.accent} strokeWidth={4} />
            </g>
          );
        })}
      </svg>
      {/* premium place labels (token type, glass pill, accent rule) */}
      {pts.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: Math.min(W - 280, Math.max(20, p.x + 22)), top: Math.min(936, p.y - 26), opacity: interpolate(frame, [i * 6 + 6, i * 6 + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <Glass style={{ padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 6, height: TYPE.label * 0.7, background: tint.accent, borderRadius: 3 }} />
            <span style={{ fontFamily: DISPLAY, fontSize: TYPE.label, color: C.paper, letterSpacing: 1 }}>{String(p.name || '').toUpperCase()}</span>
          </Glass>
        </div>
      ))}
    </AbsoluteFill>
  );
}

// ============================================================================
// SCENE — CinematicPortrait (leader cutout + parallax + chyron lower-third)
// ============================================================================
function CinematicPortrait({ beat, tint, headline }) {
  const frame = useCurrentFrame();
  const enter = spring({ frame, fps: 30, config: MOTION.pop });
  const img = beat.portrait || beat.personImage || beat.heroImage;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, top: 180, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', transform: `scale(${(0.92 + enter * 0.08).toFixed(3)}) translateY(${(1 - enter) * 40}px)` }}>
        {img ? (
          <Img src={staticFile(img)} style={{ width: 760, height: 980, objectFit: 'cover', borderRadius: 22, boxShadow: '0 40px 120px rgba(0,0,0,0.7)', border: `1px solid ${C.line}` }} />
        ) : (
          <div style={{ width: 760, height: 980, borderRadius: 22, background: `radial-gradient(60% 50% at 50% 38%, ${C.ink2}, ${C.ink0})`, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 240, color: 'rgba(255,255,255,0.06)' }}>{String(beat.person || '?').slice(0, 1)}</span>
          </div>
        )}
      </div>
      {/* chyron lower-third */}
      <div style={{ position: 'absolute', left: S.gutter, bottom: 470, opacity: enter, transform: `translateX(${(1 - enter) * -40}px)` }}>
        <div style={{ display: 'inline-block', background: tint.accent, padding: '8px 26px 12px', borderRadius: 4 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: TYPE.chyron, color: '#0a0a0a', letterSpacing: 1 }}>{String(beat.person || headline || '').toUpperCase()}</span>
        </div>
        {beat.personRole ? <div style={{ marginTop: 8 }}><Glass style={{ display: 'inline-block', padding: '6px 18px' }}><span style={{ fontFamily: BODY, fontSize: 32, color: C.paperDim, letterSpacing: 2 }}>{String(beat.personRole).toUpperCase()}</span></Glass></div> : null}
      </div>
    </AbsoluteFill>
  );
}

// ============================================================================
// SCENE — CinematicData (big kinetic stat on the grid)
// ============================================================================
function CinematicData({ beat, tint, headline }) {
  const frame = useCurrentFrame();
  const enter = spring({ frame, fps: 30, config: MOTION.pop });
  const num = asText(beat.numbers) || headline || '';
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 380 }}>
      <div style={{ textAlign: 'center', transform: `scale(${(0.7 + enter * 0.3).toFixed(3)})`, opacity: enter }}>
        <Kicker color={tint.accent}>{String(beat.dataLabel || 'THE NUMBER').toUpperCase()}</Kicker>
        <div style={{ fontFamily: DISPLAY, fontSize: TYPE.display, lineHeight: 0.9, color: C.paper, textShadow: `0 0 60px ${tint.accent}55, 0 8px 0 rgba(0,0,0,0.5)`, marginTop: 10 }}>{String(num).toUpperCase()}</div>
      </div>
      {/* baseline tick row to anchor the composition */}
      <div style={{ position: 'absolute', bottom: 430, left: S.gutter, right: S.gutter, display: 'flex', gap: 14, justifyContent: 'center' }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} style={{ width: 70, height: 6, borderRadius: 3, background: i <= enter * 6 ? tint.accent : C.line }} />)}
      </div>
    </AbsoluteFill>
  );
}

// ============================================================================
// SCENE — CinematicPresenter (Ragnar cold-open / sign-off)
// ============================================================================
function CinematicPresenter({ beat, tint, headline, brand }) {
  const frame = useCurrentFrame();
  const enter = spring({ frame, fps: 30, config: MOTION.enter });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 330 }}>
      <div style={{ textAlign: 'center', opacity: enter, transform: `translateY(${(1 - enter) * 30}px)` }}>
        <Kicker color={tint.accent}>RAGNAR · GEOPOLITICS</Kicker>
        <div style={{ fontFamily: DISPLAY, fontSize: TYPE.h1, lineHeight: 0.96, color: C.paper, maxWidth: 880, marginTop: 16, textShadow: '0 6px 40px rgba(0,0,0,0.7)' }}>{(headline || String(beat.voiceover || '').slice(0, 80)).toUpperCase()}</div>
        <div style={{ marginTop: 28, height: 4, width: 180, margin: '28px auto 0', background: `linear-gradient(90deg, ${C.red}, ${C.amber}, ${C.cyan})`, borderRadius: 2 }} />
      </div>
    </AbsoluteFill>
  );
}

// ============================================================================
// captions (token glass pill, active-word amber punch)
// ============================================================================
function clean(w) { return String(w || '').replace(/[^A-Za-z0-9'’%$.-]/g, ''); }
function Captions({ wordBoundaries, powerWords }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const words = wordBoundaries || [];
  // 3-4 word rolling chunk
  const idx = words.findIndex((w) => t >= w.startSeconds && t < w.startSeconds + Math.max(0.18, w.durationSeconds || 0.2) + 0.05);
  if (idx < 0) return null;
  const start = Math.max(0, idx - (idx % 4));
  const chunk = words.slice(start, start + 4);
  if (!chunk.length) return null;
  const powerSet = new Set((powerWords || []).map((w) => clean(w).toLowerCase()));
  const enter = spring({ frame: frame - Math.round(chunk[0].startSeconds * 30), fps: 30, config: MOTION.pop });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '46%', height: '24%', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.30) 40%, rgba(0,0,0,0.30) 70%, rgba(0,0,0,0) 100%)' }} />
      <div style={{ position: 'absolute', top: 1010, left: 0, right: 0, textAlign: 'center', transform: `translateY(${(1 - enter) * 26}px) scale(${(0.84 + enter * 0.16).toFixed(3)})` }}>
        <Glass style={{ display: 'inline-flex', gap: 22, padding: '10px 30px 14px', maxWidth: 1000 }}>
          {chunk.map((w, i) => {
            const on = t >= w.startSeconds && t < w.startSeconds + Math.max(0.14, w.durationSeconds || 0.18) + 0.05;
            const power = powerSet.has(clean(w.word).toLowerCase());
            return <span key={i} style={{ fontFamily: DISPLAY, fontSize: power ? TYPE.captionPower : TYPE.caption, color: on ? (power ? C.amber : C.paper) : 'rgba(244,246,251,0.5)', WebkitTextStroke: '2px #05070d', textShadow: '0 4px 0 rgba(0,0,0,0.85)', transform: `scale(${on ? 1.07 : 1})`, display: 'inline-block', lineHeight: 0.95 }}>{clean(w.word).toUpperCase()}</span>;
          })}
        </Glass>
      </div>
    </AbsoluteFill>
  );
}

function Brand({ brand }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, height: 6, width: `${pct}%`, background: `linear-gradient(90deg, ${C.red}, ${C.amber}, ${C.cyan})`, boxShadow: `0 0 16px ${C.amber}88` }} />
      <div style={{ position: 'absolute', right: 40, bottom: 150, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: C.red, opacity: 0.5 + 0.5 * Math.sin(frame * 0.4) }} />
        <span style={{ fontFamily: BODY, fontSize: TYPE.micro, fontWeight: 600, color: C.paperDim, letterSpacing: 4 }}>{String(brand || 'RAGNAR').split('—')[0].trim().toUpperCase()}</span>
      </div>
    </AbsoluteFill>
  );
}

// ============================================================================
// scene router + the full cinematic composition
// ============================================================================
function sceneFor(beat) {
  const hasGeo = (beat.places || []).some((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (hasGeo) return 'map';
  if (beat.person) return 'portrait';
  if (beat.numbers && (Array.isArray(beat.numbers) ? beat.numbers.length : beat.numbers)) return 'data';
  return 'presenter';
}
function presentationFor(cutType) {
  switch (String(cutType || '').toLowerCase()) {
    case 'hard': case 'cut': return fade();
    case 'whip': case 'whip-pan': return slide({ direction: 'from-right' });
    case 'wipe': return wipe();
    case 'push': return slide({ direction: 'from-bottom' });
    default: return fade();
  }
}

function Scene({ beat, brand }) {
  const tint = emotionTint(beat.emotion);
  const headline = (asText(beat.headline) || asText(beat.mustShow) || asText(beat.topic) || (beat.places || []).map((p) => p.name).filter(Boolean).join(' vs ') || asText(beat.person) || '').slice(0, 46);
  const kind = sceneFor(beat);
  return (
    <AbsoluteFill>
      <CinematicPlate beat={beat} tint={tint} />
      {kind === 'map' && <CinematicMap beat={beat} tint={tint} headline={headline} />}
      {kind === 'portrait' && <CinematicPortrait beat={beat} tint={tint} headline={headline} />}
      {kind === 'data' && <CinematicData beat={beat} tint={tint} headline={headline} />}
      {kind === 'presenter' && <CinematicPresenter beat={beat} tint={tint} headline={headline} brand={brand} />}
      <Atmosphere tint={tint} />
    </AbsoluteFill>
  );
}

export const V10CinematicComposition = (props) => {
  const { beats = [], wordBoundaries = [], powerWords = [], brand = 'RAGNAR', directorPlan } = props;
  const fps = 30;
  const scenes = (directorPlan && directorPlan.beats && directorPlan.beats.length ? directorPlan.beats : beats).map((b, i) => {
    const src = beats[i] || {};
    return { ...b, fromSec: b.fromSec != null ? b.fromSec : src.fromSec, toSec: b.toSec != null ? b.toSec : src.toSec, heroClip: b.heroClip || src.heroClip, voiceover: b.voiceover || b.vo };
  });
  if (!scenes.length) return <AbsoluteFill style={{ backgroundColor: C.ink0 }} />;

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink0 }}>
      <TransitionSeries>
        {scenes.map((beat, i) => {
          const durF = Math.max(20, Math.round(((beat.toSec || (i + 1) * 3) - (beat.fromSec || i * 3)) * fps));
          const out = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={durF}>
              <Scene beat={beat} brand={brand} />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            out.push(
              <TransitionSeries.Transition key={`t${i}`} timing={springTiming({ config: { damping: 200 }, durationInFrames: MOTION.transFrames })} presentation={presentationFor(beat.cutType)} />
            );
          }
          return out;
        })}
      </TransitionSeries>
      {/* global overlays ride above every scene */}
      <Captions wordBoundaries={wordBoundaries} powerWords={powerWords} />
      <Brand brand={brand} />
    </AbsoluteFill>
  );
};

export default V10CinematicComposition;
