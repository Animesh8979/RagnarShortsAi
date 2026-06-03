import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FONT = 'Anton, Impact, "Arial Black", sans-serif';
const TEXT = '#F8FAFC';
const BG = '#05070B';
const LINE = 'rgba(248,250,252,0.16)';
const AMBER = '#FFD200';
const RED = '#FF3B3B';
const CYAN = '#29D3FF';
const GREEN = '#32D583';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function cleanWord(word) {
  return String(word || '').replace(/[.,!?;:]+$/g, '').replace(/^[.,!?;:]+/g, '');
}

function chunkWords(wordBoundaries = []) {
  const chunks = [];
  let group = [];
  for (const word of wordBoundaries) {
    group.push(word);
    const hard = /[.!?;:]$/.test(String(word.word || ''));
    if (group.length >= 2 || hard) {
      chunks.push({
        words: group,
        start: group[0].startSeconds,
        end: group[group.length - 1].startSeconds + Math.max(0.12, group[group.length - 1].durationSeconds || 0.16),
      });
      group = [];
    }
  }
  if (group.length) {
    chunks.push({
      words: group,
      start: group[0].startSeconds,
      end: group[group.length - 1].startSeconds + Math.max(0.12, group[group.length - 1].durationSeconds || 0.16),
    });
  }
  return chunks;
}

function Grid() {
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `
          linear-gradient(${LINE} 1px, transparent 1px),
          linear-gradient(90deg, ${LINE} 1px, transparent 1px)
        `,
        backgroundSize: '72px 72px',
        maskImage: 'radial-gradient(circle at 50% 38%, black 0%, black 58%, transparent 88%)',
        opacity: 0.46,
      }}
    />
  );
}

function HeroTexture({ src, durationInFrames = 90, beat, compact = false }) {
  const frame = useCurrentFrame();
  const phase = clamp(frame / Math.max(1, durationInFrames), 0, 1);
  const drift = interpolate(phase, [0, 1], [-18, 18], { easing: Easing.inOut(Easing.cubic) });
  const scale = interpolate(phase, [0, 1], compact ? [1.02, 1.08] : [1.05, 1.13], { easing: Easing.inOut(Easing.cubic) });
  const hue = beat && beat.backgroundWorld === 'maritime_strike' ? '#082A36' : beat && beat.backgroundWorld === 'energy_war' ? '#24110E' : '#0B1020';
  return (
    <AbsoluteFill style={{ backgroundColor: hue, overflow: 'hidden' }}>
      {src ? (
        <AbsoluteFill
          style={{
            opacity: 0.92,
            filter: 'saturate(1.12) contrast(1.08)',
            transform: `scale(${scale}) translate(${drift}px, ${-drift * 0.4}px)`,
          }}
        >
          <OffthreadVideo src={src} muted />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,7,11,0.12), rgba(5,7,11,0.22) 48%, rgba(5,7,11,0.86) 100%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 34%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.72) 100%)' }} />
    </AbsoluteFill>
  );
}

function EvidenceChrome({ beat, children }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110, mass: 0.8 } });
  const y = interpolate(enter, [0, 1], [52, 0], { extrapolateRight: 'clamp' });
  const op = interpolate(enter, [0, 0.55], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          top: 120,
          bottom: 440,
          transform: `translateY(${y}px)`,
          opacity: op,
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          bottom: 390,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${beat.emotion === 'cost' ? AMBER : CYAN}, transparent)`,
          opacity: 0.5,
        }}
      />
    </AbsoluteFill>
  );
}

function RouteSvg({ maritime = false, impact = true }) {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [0, 58], [860, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pulse = 0.5 + 0.4 * Math.sin(frame / 6);
  const color = maritime ? CYAN : RED;
  return (
    <svg width="100%" height="100%" viewBox="0 0 972 1360" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="v9glow">
          <feGaussianBlur stdDeviation="10" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d="M110 1100 C260 820 320 900 430 690 C560 450 650 470 850 210" fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeDasharray="860" strokeDashoffset={draw} filter="url(#v9glow)" />
      <path d="M110 1100 C260 820 320 900 430 690 C560 450 650 470 850 210" fill="none" stroke={AMBER} strokeWidth="4" strokeLinecap="round" strokeDasharray="28 24" strokeDashoffset={-frame * 5} opacity={pulse} />
      {[110, 430, 850].map((x, i) => {
        const y = [1100, 690, 210][i];
        const r = i === 2 && impact ? 30 + pulse * 16 : 22;
        return <circle key={i} cx={x} cy={y} r={r} fill={i === 2 ? AMBER : color} opacity={i === 2 ? 0.9 : 0.68} />;
      })}
    </svg>
  );
}

function CrisisMap({ beat }) {
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <RouteSvg />
        <div style={{ position: 'absolute', left: 90, top: 90, width: 250, height: 250, borderRadius: 125, border: `18px solid ${RED}`, boxShadow: `0 0 55px ${RED}55` }} />
        <div style={{ position: 'absolute', right: 70, bottom: 170, width: 280, height: 120, border: `3px solid ${AMBER}`, background: 'rgba(255,210,0,0.08)' }} />
      </div>
    </EvidenceChrome>
  );
}

function RouteStrikeBoard({ beat }) {
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0, border: `2px solid ${RED}66`, background: 'rgba(12,17,24,0.62)' }}>
        <RouteSvg />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: 'absolute', left: 110 + i * 255, bottom: 120 + i * 70, width: 108, height: 156, border: `4px solid ${i === 1 ? AMBER : RED}`, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ position: 'absolute', left: 22, right: 22, bottom: 0, height: 72 + i * 22, background: i === 1 ? AMBER : RED, opacity: 0.72 }} />
          </div>
        ))}
      </div>
    </EvidenceChrome>
  );
}

function FundingFlow({ beat }) {
  const frame = useCurrentFrame();
  const flow = interpolate(frame % 60, [0, 60], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <svg width="900" height="960" viewBox="0 0 900 960">
          <rect x="40" y="80" width="260" height="220" rx="18" fill="rgba(255,210,0,0.12)" stroke={AMBER} strokeWidth="6" />
          <rect x="600" y="660" width="260" height="220" rx="18" fill="rgba(255,59,59,0.12)" stroke={RED} strokeWidth="6" />
          <path d="M300 190 C520 230 370 590 600 770" fill="none" stroke={AMBER} strokeWidth="18" strokeLinecap="round" strokeDasharray="34 26" strokeDashoffset={-flow * 220} />
          <circle cx={300 + flow * 300} cy={190 + flow * 580} r="24" fill={GREEN} opacity="0.85" />
          <path d="M690 704 L770 830 L620 830 Z" fill={RED} opacity="0.84" />
          <circle cx="170" cy="190" r="60" fill={AMBER} opacity="0.8" />
        </svg>
      </div>
    </EvidenceChrome>
  );
}

function StakesMeter({ beat }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = clamp(frame / (fps * 3.2), 0, 1);
  const needle = interpolate(p, [0, 1], [-64, 64], { easing: Easing.out(Easing.cubic) });
  return (
    <EvidenceChrome beat={beat}>
      <svg width="100%" height="100%" viewBox="0 0 972 1360" style={{ position: 'absolute', inset: 0 }}>
        <g transform="translate(486 650)">
          <path d="M-360 170 A390 390 0 0 1 360 170" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="56" strokeLinecap="round" />
          <path d="M-360 170 A390 390 0 0 1 360 170" fill="none" stroke={AMBER} strokeWidth="30" strokeLinecap="round" strokeDasharray={`${590 * p} 940`} />
          <g transform={`rotate(${needle})`}>
            <line x1="0" y1="150" x2="0" y2="-270" stroke={TEXT} strokeWidth="22" strokeLinecap="round" />
            <line x1="0" y1="140" x2="0" y2="-252" stroke={RED} strokeWidth="10" strokeLinecap="round" />
          </g>
          <circle r="36" fill={RED} />
        </g>
      </svg>
    </EvidenceChrome>
  );
}

function NegotiationTable({ beat }) {
  const frame = useCurrentFrame();
  const split = interpolate(frame, [0, 38], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', left: 40, top: 180, width: 380, height: 650, transform: `translateX(${(1 - split) * -90}px)`, border: `4px solid ${CYAN}`, background: 'rgba(41,211,255,0.09)' }} />
        <div style={{ position: 'absolute', right: 40, top: 180, width: 380, height: 650, transform: `translateX(${(1 - split) * 90}px)`, border: `4px solid ${RED}`, background: 'rgba(255,59,59,0.09)' }} />
        <div style={{ position: 'absolute', left: 250, right: 250, top: 710, height: 90, background: `linear-gradient(90deg, ${CYAN}, ${AMBER}, ${RED})`, opacity: 0.82 }} />
      </div>
    </EvidenceChrome>
  );
}

function RadarIntercept({ beat }) {
  const frame = useCurrentFrame();
  const rot = frame * 3.2;
  const boatX = interpolate(frame, [0, 100], [190, 720], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  return (
    <EvidenceChrome beat={beat}>
      <svg width="100%" height="100%" viewBox="0 0 972 1360" style={{ position: 'absolute', inset: 0 }}>
        {[170, 300, 430, 560].map((r) => <circle key={r} cx="486" cy="520" r={r} fill="none" stroke={CYAN} strokeWidth="3" opacity="0.22" />)}
        <g transform={`translate(486 520) rotate(${rot})`}>
          <path d="M0 0 L0 -600 A600 600 0 0 1 160 -578 Z" fill={CYAN} opacity="0.22" />
          <line x1="0" y1="0" x2="0" y2="-600" stroke={CYAN} strokeWidth="7" opacity="0.72" />
        </g>
        <g transform={`translate(${boatX} 900)`}>
          <path d="M-130 28 L108 28 L156 -36 L-92 -58 Z" fill={TEXT} stroke={CYAN} strokeWidth="8" />
          <rect x="-42" y="-110" width="92" height="54" fill={BG} stroke={CYAN} strokeWidth="6" />
        </g>
      </svg>
    </EvidenceChrome>
  );
}

function DeathTollLedger({ beat }) {
  const frame = useCurrentFrame();
  const count = beat.numbers && beat.numbers[0] ? beat.numbers[0] : '200+';
  const reveal = interpolate(frame, [0, 45], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ fontFamily: FONT, fontSize: 210, color: TEXT, textShadow: `0 0 48px ${RED}66`, transform: `scale(${0.8 + reveal * 0.2})` }}>{count}</div>
        <div style={{ position: 'absolute', left: 120, right: 120, bottom: 270, height: 22, background: `linear-gradient(90deg, ${RED}, ${AMBER})`, transform: `scaleX(${reveal})`, transformOrigin: 'left center' }} />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ position: 'absolute', left: 160 + i * 145, bottom: 180, width: 80, height: 80, borderRadius: 40, background: TEXT, opacity: 0.12 + i * 0.06 }} />)}
      </div>
    </EvidenceChrome>
  );
}

function PolicyEscalationBoard({ beat }) {
  const frame = useCurrentFrame();
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        {[0, 1, 2, 3].map((i) => {
          const h = interpolate(spring({ frame: frame - i * 6, fps: 30, config: { damping: 14, stiffness: 130 } }), [0, 1], [120, 360 + i * 130], { extrapolateRight: 'clamp' });
          return <div key={i} style={{ width: 138, height: h, background: i < 2 ? `linear-gradient(180deg, ${CYAN}, #0B3441)` : `linear-gradient(180deg, ${RED}, #391010)`, boxShadow: `0 0 38px ${i < 2 ? CYAN : RED}44` }} />;
        })}
      </div>
    </EvidenceChrome>
  );
}

function HumanCostGrid({ beat }) {
  const frame = useCurrentFrame();
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 30, padding: 96 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const pulse = 0.3 + 0.25 * Math.sin(frame / 7 + i);
          return <div key={i} style={{ borderRadius: 999, background: `rgba(255,210,0,${pulse})`, boxShadow: `0 0 ${32 + pulse * 60}px rgba(255,210,0,0.34)`, transform: `scale(${0.86 + pulse * 0.3})` }} />;
        })}
      </div>
    </EvidenceChrome>
  );
}

function LegalQuestionBoard({ beat }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 45], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', left: 70, top: 230, width: 360, height: 560, border: `5px solid ${GREEN}`, transform: `translateY(${(1 - p) * 80}px)` }} />
        <div style={{ position: 'absolute', right: 70, top: 230, width: 360, height: 560, border: `5px solid ${RED}`, transform: `translateY(${(1 - p) * -80}px)` }} />
        <div style={{ position: 'absolute', left: 450, top: 410, width: 72, height: 320, background: AMBER, transform: `rotate(${p * 90}deg)` }} />
      </div>
    </EvidenceChrome>
  );
}

function EvidenceBoard({ beat }) {
  const frame = useCurrentFrame();
  return (
    <EvidenceChrome beat={beat}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, padding: 52 }}>
        {[0, 1, 2, 3].map((i) => {
          const s = spring({ frame: frame - i * 7, fps: 30, config: { damping: 15, stiffness: 120 } });
          return <div key={i} style={{ border: `3px solid ${i % 2 ? CYAN : AMBER}`, background: 'rgba(255,255,255,0.055)', opacity: interpolate(s, [0, 1], [0, 1], { extrapolateRight: 'clamp' }), transform: `scale(${interpolate(s, [0, 1], [0.86, 1], { extrapolateRight: 'clamp' })})` }} />;
        })}
      </div>
    </EvidenceChrome>
  );
}

// ── Real geography map: pins + labels for the ACTUAL countries the line names,
//    region auto-zoomed, with an animated strike/route arc + travelling pulse. ─
function projLonLat(lon, lat, W, H) { return { x: (lon + 180) / 360 * W, y: (90 - lat) / 180 * H }; }

function RealMapScene({ beat, heroClip, durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const places = Array.isArray(beat.places) ? beat.places : [];
  if (!places.length) return null;
  const pts = places.map((p) => ({ ...p, ...projLonLat(p.lon, p.lat, 3600, 1800) }));
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const pad = 360;
  const minX = Math.min(...xs) - pad; const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad; const maxY = Math.max(...ys) + pad;
  const bw = Math.max(maxX - minX, 700); const bh = Math.max(maxY - minY, 900);
  const scale = Math.min(W / bw, (H * 0.6) / bh);
  const toScreen = (p) => ({ x: (p.x - minX) * scale + (W - bw * scale) / 2, y: (p.y - minY) * scale + 150 });
  const sp = pts.map(toScreen);
  const arcProg = interpolate(frame, [fps * 0.5, fps * 1.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const a = sp[0]; const b = sp[1] || sp[0];
  const midX = (a.x + b.x) / 2; const midY = Math.min(a.y, b.y) - Math.hypot(b.x - a.x, b.y - a.y) * 0.3 - 30;
  const t = arcProg;
  const qx = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * midX + t * t * b.x;
  const qy = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * midY + t * t * b.y;
  const arcD = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(135% 95% at 50% 32%, #122044 0%, ${BG} 72%)` }}>
      {/* L114 — blurred FLUX hero as a depth-of-field BACKGROUND plate: gives real
          foreground/background depth + atmosphere + fills the dead vertical space
          (the QA gate's top complaints). The map/arc/pins sit in the foreground. */}
      {heroClip ? (
        <AbsoluteFill style={{ opacity: 0.6, transform: `scale(${(1.12 + interpolate(frame, [0, durationInFrames || 90], [0, 0.09], { extrapolateRight: 'clamp' })).toFixed(3)})` }}>
          <OffthreadVideo src={staticFile(heroClip)} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(18px) brightness(0.40) saturate(1.25)' }} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: 'radial-gradient(60% 42% at 50% 30%, rgba(41,211,255,0.14), rgba(0,0,0,0) 62%)' }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs><filter id="v9MapGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="11" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        {Array.from({ length: 13 }).map((_, i) => <line key={'v' + i} x1={i * W / 12} y1={0} x2={i * W / 12} y2={H} stroke={LINE} strokeWidth={1} />)}
        {Array.from({ length: 22 }).map((_, i) => <line key={'h' + i} x1={0} y1={i * H / 21} x2={W} y2={i * H / 21} stroke={LINE} strokeWidth={1} />)}
        {sp.length >= 2 && (
          <g filter="url(#v9MapGlow)">
            <path d={arcD} fill="none" stroke={RED} strokeWidth={9} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arcProg} />
            <circle cx={qx} cy={qy} r={13} fill={AMBER} />
          </g>
        )}
        {sp.map((p, i) => {
          const pin = spring({ frame: frame - 6 - i * 7, fps, config: { damping: 11, stiffness: 200 } });
          const r = interpolate(pin, [0, 1], [0, 17], { extrapolateRight: 'clamp' });
          const ring = 17 + (Math.sin((frame / fps) * 4 + i) * 0.5 + 0.5) * 26;
          return (<g key={'p' + i}><circle cx={p.x} cy={p.y} r={ring} fill="none" stroke={AMBER} strokeWidth={2} opacity={0.34} /><circle cx={p.x} cy={p.y} r={r} fill={AMBER} filter="url(#v9MapGlow)" /></g>);
        })}
      </svg>
      {pts.map((p, i) => {
        const s = sp[i];
        const lab = spring({ frame: frame - 10 - i * 7, fps, config: { damping: 12, stiffness: 200 } });
        const o = interpolate(lab, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' });
        const ty = interpolate(lab, [0, 1], [18, 0], { extrapolateRight: 'clamp' });
        const left = Math.min(Math.max(s.x + 26, 16), W - 360);
        return (<div key={'l' + i} style={{ position: 'absolute', left, top: s.y - 30, opacity: o, transform: `translateY(${ty}px)` }}><span style={{ fontFamily: FONT, fontSize: 50, color: TEXT, background: 'rgba(0,0,0,0.55)', padding: '2px 14px', borderLeft: `5px solid ${AMBER}`, WebkitTextStroke: '1px black', whiteSpace: 'nowrap' }}>{p.name}</span></div>);
      })}
    </AbsoluteFill>
  );
}

// ── Real leader portrait (Wikimedia photo via director.portraitClip), Ken-Burns
//    in, with a news chyron. Falls back to the beat's hero clip if no portrait. ─
function LeaderPortraitScene({ beat, heroClip, durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, durationInFrames || fps * 4);
  const kb = interpolate(frame, [0, total], [1.06, 1.16], { extrapolateRight: 'clamp' });
  const op = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const chy = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 160 } });
  const chyX = interpolate(chy, [0, 1], [-560, 0], { extrapolateRight: 'clamp' });
  const portrait = beat.portraitClip ? staticFile(beat.portraitClip) : null;
  const video = !portrait && heroClip ? staticFile(heroClip) : null;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 34%, #18203c 0%, ${BG} 76%)`, opacity: op }}>
      <AbsoluteFill style={{ transform: `scale(${kb.toFixed(4)})` }}>
        {portrait ? <img src={portrait} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : video ? <OffthreadVideo src={video} muted /> : null}
        <AbsoluteFill style={{ background: 'radial-gradient(110% 72% at 50% 40%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.62) 100%)' }} />
      </AbsoluteFill>
      {beat.person ? (
        <div style={{ position: 'absolute', left: 0, bottom: 1180, transform: `translateX(${chyX}px)` }}>
          <div style={{ background: RED, padding: '10px 30px 12px 56px', fontFamily: FONT, fontSize: 62, color: '#fff', letterSpacing: 1, WebkitTextStroke: '1px black', boxShadow: '0 8px 24px rgba(0,0,0,0.55)' }}>{String(beat.person).toUpperCase()}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

// ── Talking-anchor stickman: vector presenter whose mouth lip-flaps to the word
//    timings (absolute), with idle bob + gesture — the faceless "news anchor". ─
function PresenterScene({ beat, wordBoundaries, durationInFrames, beatStartSec = 0 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tAbs = beatStartSec + frame / fps; // Sequence-local frame → absolute audio time
  const speaking = Array.isArray(wordBoundaries) && wordBoundaries.some((w) => {
    const s = Number(w.startSeconds); return tAbs >= s && tAbs < s + Math.max(0.1, Number(w.durationSeconds) || 0.2);
  });
  const mouthOpen = speaking ? (7 + (Math.sin(frame * 1.7) * 0.5 + 0.5) * 30) : 5;
  const bob = Math.sin((frame / fps) * 2.0) * 7;
  const armSwing = Math.sin((frame / fps) * 1.4) * 14;
  const globeRot = frame * 0.6;
  const cx = 540; const headY = 690 + bob; const r = 150;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(125% 95% at 50% 28%, #16224c 0%, ${BG} 74%)` }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {/* faint rotating globe behind the anchor (geopolitics motif) */}
        <g opacity={0.16} transform={`translate(540 640)`}>
          <circle r={300} fill="none" stroke={CYAN} strokeWidth={3} />
          <ellipse rx={300} ry={110} fill="none" stroke={CYAN} strokeWidth={2} />
          <ellipse rx={110} ry={300} fill="none" stroke={CYAN} strokeWidth={2} transform={`rotate(${globeRot})`} />
          <ellipse rx={210} ry={300} fill="none" stroke={CYAN} strokeWidth={2} transform={`rotate(${-globeRot})`} />
        </g>
        {/* shoulders / suit */}
        <path d={`M ${cx - 235} 1230 Q ${cx} 905 ${cx + 235} 1230 Z`} fill="#222d4d" stroke={AMBER} strokeWidth={4} />
        {/* white collar + red tie */}
        <path d={`M ${cx - 60} 980 L ${cx} 1040 L ${cx + 60} 980`} fill="none" stroke="#EAF2FF" strokeWidth={14} />
        <path d={`M ${cx} 1040 L ${cx - 26} 1085 L ${cx} 1230 L ${cx + 26} 1085 Z`} fill={RED} />
        {/* gesturing arms */}
        <line x1={cx - 175} y1={1115} x2={cx - 250 + armSwing} y2={1235} stroke="#222d4d" strokeWidth={34} strokeLinecap="round" />
        <line x1={cx + 175} y1={1115} x2={cx + 250 - armSwing} y2={1235} stroke="#222d4d" strokeWidth={34} strokeLinecap="round" />
        {/* head */}
        <circle cx={cx} cy={headY} r={r} fill="#F0C9A4" stroke={AMBER} strokeWidth={5} />
        {/* hair */}
        <path d={`M ${cx - r} ${headY - 18} Q ${cx} ${headY - r - 40} ${cx + r} ${headY - 18} Q ${cx} ${headY - 70} ${cx - r} ${headY - 18}`} fill="#2b2218" />
        {/* eyes + brows */}
        <circle cx={cx - 52} cy={headY - 28} r={14} fill="#10131c" />
        <circle cx={cx + 52} cy={headY - 28} r={14} fill="#10131c" />
        <rect x={cx - 76} y={headY - 72} width={48} height={9} rx={4} fill="#2b2218" />
        <rect x={cx + 28} y={headY - 72} width={48} height={9} rx={4} fill="#2b2218" />
        {/* mouth — height tracks the voiceover */}
        <ellipse cx={cx} cy={headY + 62} rx={42} ry={Math.max(4, mouthOpen)} fill="#5a1414" />
        {/* desk + nameplate */}
        <rect x={120} y={1300} width={840} height={300} rx={20} fill="rgba(11,16,32,0.92)" stroke={AMBER} strokeWidth={3} />
        <rect x={120} y={1300} width={840} height={66} fill={RED} opacity={0.92} />
        <text x={540} y={1347} textAnchor="middle" fontFamily={FONT} fontSize={40} fill="#fff" letterSpacing={2}>RAGNAR · GEOPOLITICS</text>
      </svg>
      <div style={{ position: 'absolute', top: 150, left: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, background: RED, opacity: 0.5 + 0.5 * Math.sin(frame * 0.5) }} />
        <span style={{ fontFamily: FONT, fontSize: 38, color: TEXT, letterSpacing: 3 }}>LIVE</span>
      </div>
    </AbsoluteFill>
  );
}

// data-module name → the EvidenceChrome component that visualises it
const DATA_MODULES = {
  stakes_meter: StakesMeter,
  death_toll_ledger: DeathTollLedger,
  funding_flow: FundingFlow,
  negotiation_table: NegotiationTable,
  policy_escalation: PolicyEscalationBoard,
  human_cost_grid: HumanCostGrid,
  legal_question_board: LegalQuestionBoard,
  route_strike_board: RouteStrikeBoard,
  radar_intercept: RadarIntercept,
  crisis_map: CrisisMap,
};

// footage backdrop + the matched data board (full-frame, professional explainer)
function EvidenceScene({ beat, heroClip, durationInFrames }) {
  const src = heroClip ? staticFile(heroClip) : null;
  const Module = DATA_MODULES[beat.module] || EvidenceBoard;
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <HeroTexture src={src} durationInFrames={durationInFrames} beat={beat} />
      <Module beat={beat} />
      <BeatOverlay beat={beat} durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
}

// content-true scene router: each beat shows what the line actually says
function StoryScene({ beat, heroClip, durationInFrames, wordBoundaries, beatStartSec = 0 }) {
  const b = beat || { module: 'evidence_board', backgroundWorld: 'general_news' };
  const mod = b.module;
  if (mod === 'presenter_brief') return <PresenterScene beat={b} wordBoundaries={wordBoundaries} durationInFrames={durationInFrames} beatStartSec={beatStartSec} />;
  if (mod === 'leader_portrait') return <LeaderPortraitScene beat={b} heroClip={heroClip} durationInFrames={durationInFrames} />;
  if ((mod === 'crisis_map' || mod === 'route_strike_board' || mod === 'radar_intercept') && Array.isArray(b.places) && b.places.length) {
    return <RealMapScene beat={b} heroClip={heroClip} durationInFrames={durationInFrames} />;
  }
  return <EvidenceScene beat={b} heroClip={heroClip} durationInFrames={durationInFrames} />;
}

function GameplayPanel({ beat, durationInFrames }) {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const progress = clamp(frame / Math.max(1, durationInFrames), 0, 1);
  const world = beat.backgroundWorld || 'general_news';
  const road = world === 'maritime_strike' ? '#062632' : world === 'energy_war' ? '#201106' : '#07152A';
  const accent = world === 'maritime_strike' ? CYAN : world === 'energy_war' ? AMBER : GREEN;
  const speed = 18 + (beat.intensity || 70) * 0.16;
  const laneXs = [width * 0.25, width * 0.5, width * 0.75];
  const playerLane = Math.floor((Math.sin(frame / 18) + 1.5)) % 3;
  const playerX = laneXs[playerLane];
  const shake = Math.sin(frame * 0.75) * 5;

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', overflow: 'hidden', background: `linear-gradient(180deg, ${road}, #020307)` }}>
      <svg width="1080" height="806" viewBox="0 0 1080 806" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="roadGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M345 0 L735 0 L1010 806 L70 806 Z" fill="url(#roadGlow)" opacity="0.7" />
        {[390, 540, 690].map((x, i) => (
          <path key={i} d={`M${x} 0 L${x + (i - 1) * 245} 806`} stroke="rgba(255,255,255,0.26)" strokeWidth="5" strokeDasharray="42 44" strokeDashoffset={frame * speed} />
        ))}
        {Array.from({ length: 18 }, (_, i) => {
          const y = ((i * 96 + frame * speed * 2.2) % 960) - 110;
          const lane = i % 3;
          const x = [300, 540, 780][lane] + Math.sin((frame + i * 20) / 16) * 22;
          const size = 18 + y / 34;
          const isObstacle = i % 5 === 0;
          return isObstacle ? (
            <rect key={i} x={x - size} y={y} width={size * 2.1} height={size * 1.55} rx="10" fill={RED} opacity="0.86" />
          ) : (
            <circle key={i} cx={x} cy={y} r={Math.max(8, size * 0.55)} fill={AMBER} opacity="0.92" />
          );
        })}
        <g transform={`translate(${playerX} ${610 + shake})`}>
          <path d="M0 -80 L74 54 L-74 54 Z" fill={accent} stroke={TEXT} strokeWidth="7" />
          <circle cx="0" cy="18" r="18" fill={TEXT} opacity="0.88" />
        </g>
        <rect x="70" y="54" width={940 * progress} height="16" rx="8" fill={accent} opacity="0.86" />
      </svg>
      <div style={{ position: 'absolute', right: 36, bottom: 34, fontFamily: FONT, fontSize: 34, color: 'rgba(248,250,252,0.72)', WebkitTextStroke: '2px black' }}>
        x{(1 + progress * 4).toFixed(1)}
      </div>
    </div>
  );
}

function ScriptMatchedAccent({ beat, durationInFrames, compact = false }) {
  const frame = useCurrentFrame();
  const progress = clamp(frame / Math.max(1, durationInFrames), 0, 1);
  const module = beat.module || 'evidence_board';
  const world = beat.backgroundWorld || 'general_news';
  const accent = world === 'maritime_strike' ? CYAN : world === 'energy_war' ? AMBER : GREEN;
  const danger = world === 'maritime_strike' ? CYAN : RED;
  const draw = interpolate(progress, [0, 0.9], [520, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pulse = 0.45 + 0.35 * Math.sin(frame / 7);
  const meter = interpolate(progress, [0, 1], [0.08, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const number = beat.numbers && beat.numbers[0] ? beat.numbers[0] : null;

  if (compact) {
    const rail = interpolate(progress, [0, 1], [80, 1000], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <svg width="1080" height="1114" viewBox="0 0 1080 1114" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <filter id="v9CompactAccentGlow">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M70 1040 C240 1012 332 1075 500 1032 C688 984 780 1048 1010 1008"
            fill="none"
            stroke={danger}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="520"
            strokeDashoffset={draw}
            opacity="0.42"
            filter="url(#v9CompactAccentGlow)"
          />
          <rect x="70" y="1068" width="940" height="10" rx="5" fill="rgba(248,250,252,0.14)" />
          <rect x="70" y="1068" width={rail} height="10" rx="5" fill={accent} opacity="0.68" />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={170 + i * 360} cy={1018 + Math.sin(frame / 9 + i) * 10} r={10 + pulse * 5} fill={i === 1 ? AMBER : accent} opacity="0.55" />
          ))}
        </svg>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="1080" height="1114" viewBox="0 0 1080 1114" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="v9AccentGlow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="v9AccentLowerClip">
            <rect x="0" y="620" width="1080" height="494" />
          </clipPath>
        </defs>

        {['crisis_map', 'route_strike_board', 'radar_intercept'].includes(module) ? (
          <g opacity="0.36" filter="url(#v9AccentGlow)" clipPath="url(#v9AccentLowerClip)">
            <path
              d={world === 'maritime_strike'
                ? 'M160 910 C350 770 510 820 640 620 C760 430 715 330 895 180'
                : 'M145 930 C300 760 300 610 500 500 C690 360 650 260 900 150'}
              fill="none"
              stroke={danger}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray="520"
              strokeDashoffset={draw}
            />
            <path
              d={world === 'maritime_strike'
                ? 'M160 910 C350 770 510 820 640 620 C760 430 715 330 895 180'
                : 'M145 930 C300 760 300 610 500 500 C690 360 650 260 900 150'}
              fill="none"
              stroke={accent}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="24 22"
              strokeDashoffset={-frame * 4}
              opacity="0.48"
            />
            <circle cx={world === 'maritime_strike' ? 895 : 900} cy={world === 'maritime_strike' ? 180 : 150} r={18 + pulse * 16} fill={accent} opacity="0.62" />
          </g>
        ) : null}

        {['funding_flow', 'policy_escalation', 'stakes_meter'].includes(module) ? (
          <g opacity="0.42" filter="url(#v9AccentGlow)" clipPath="url(#v9AccentLowerClip)">
            <rect x="110" y="790" width="860" height="28" rx="14" fill="rgba(255,255,255,0.16)" />
            <rect x="110" y="790" width={860 * meter} height="28" rx="14" fill={module === 'funding_flow' ? GREEN : accent} />
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={170 + i * 190} y={690 - i * 20} width="112" height={90 + i * 36 * meter} rx="8" fill={i % 2 ? danger : accent} opacity={0.28 + i * 0.08} />
            ))}
          </g>
        ) : null}

        {['death_toll_ledger', 'human_cost_grid'].includes(module) ? (
          <g opacity="0.42" filter="url(#v9AccentGlow)" clipPath="url(#v9AccentLowerClip)">
            {number ? <text x="540" y="530" textAnchor="middle" fontFamily={FONT} fontSize="138" fill={TEXT}>{number}</text> : null}
            {Array.from({ length: 12 }, (_, i) => {
              const x = 170 + (i % 4) * 245;
              const y = 650 + Math.floor(i / 4) * 92;
              return <circle key={i} cx={x} cy={y} r={28 + 8 * Math.sin(frame / 8 + i)} fill={accent} opacity={0.22 + (i % 3) * 0.08} />;
            })}
          </g>
        ) : null}

        {['negotiation_table', 'legal_question_board'].includes(module) ? (
          <g opacity="0.42" filter="url(#v9AccentGlow)" clipPath="url(#v9AccentLowerClip)">
            <rect x="108" y="560" width="360" height="300" rx="12" fill="rgba(41,211,255,0.10)" stroke={CYAN} strokeWidth="5" />
            <rect x="612" y="560" width="360" height="300" rx="12" fill="rgba(255,59,59,0.10)" stroke={RED} strokeWidth="5" />
            <path d="M468 710 L612 710" stroke={AMBER} strokeWidth="12" strokeLinecap="round" strokeDasharray="24 18" strokeDashoffset={-frame * 3} />
          </g>
        ) : null}
      </svg>
    </AbsoluteFill>
  );
}

function BeatOverlay({ beat, durationInFrames }) {
  const frame = useCurrentFrame();
  const phase = clamp(frame / Math.max(1, durationInFrames), 0, 1);
  const flash = interpolate(frame, [0, 5, 14], [0.8, 0.18, 0], { extrapolateRight: 'clamp' });
  const scan = interpolate(phase, [0, 1], [-120, 2000], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: beat && beat.audioAccent === 'hit' ? RED : CYAN, opacity: flash * 0.26, mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: scan, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.44) 100%)' }} />
    </AbsoluteFill>
  );
}

function Captions({ wordBoundaries = [], powerWords = [] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSec = frame / fps;
  const chunks = chunkWords(wordBoundaries);
  const active = chunks.find((chunk) => tSec >= chunk.start && tSec < chunk.end + 0.05);
  if (!active) return null;
  const startFrame = Math.round(active.start * fps);
  const enter = spring({ frame: frame - startFrame, fps, config: { damping: 12, stiffness: 220, mass: 0.55 } });
  const scale = interpolate(enter, [0, 1], [0.72, 1], { extrapolateRight: 'clamp' });
  const y = interpolate(enter, [0, 1], [40, 0], { extrapolateRight: 'clamp' });
  const powerSet = new Set(powerWords.map((w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '')));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* feathered cinematic lower-third wash (no hard band, no caption box — premium type instead) */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '44%', height: '26%', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.28) 34%, rgba(0,0,0,0.58) 60%, rgba(0,0,0,0.26) 86%, rgba(0,0,0,0) 100%)' }} />
      <div style={{ position: 'absolute', top: 990, left: 0, right: 0, textAlign: 'center', padding: '0 42px', transform: `translateY(${y}px) scale(${scale})` }}>
        {/* premium gradient-glass pill: keeps contrast on bright footage, reads as designed (not a flat black box) */}
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 26, maxWidth: 1000, padding: '8px 28px 12px', borderRadius: 14, background: 'linear-gradient(180deg, rgba(10,14,22,0.30), rgba(10,14,22,0.58))', boxShadow: '0 6px 26px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.12)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', whiteSpace: 'nowrap', overflow: 'visible' }}>
          {active.words.map((word, index) => {
            const activeWord = tSec >= word.startSeconds && tSec < word.startSeconds + Math.max(0.12, word.durationSeconds || 0.16) + 0.04;
            const cleaned = cleanWord(word.word).toUpperCase();
            const isPower = powerSet.has(cleanWord(word.word).toLowerCase());
            const punch = activeWord ? 1.08 : 1;
            return (
              <span
                key={`${word.word}-${index}`}
                style={{
                  fontFamily: FONT,
                  fontSize: isPower ? 84 : 72,
                  color: activeWord ? (isPower ? AMBER : TEXT) : 'rgba(248,250,252,0.52)',
                  WebkitTextStroke: '2.5px black',
                  textShadow: '0 5px 0 rgba(0,0,0,0.95), 0 12px 20px rgba(0,0,0,0.78)',
                  display: 'inline-block',
                  margin: 0,
                  transform: `scale(${punch})`,
                  transformOrigin: 'center center',
                  letterSpacing: 0,
                  lineHeight: 0.95,
                }}
              >
                {cleaned}
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
  return <div style={{ position: 'absolute', top: 0, left: 0, height: 8, width: `${pct}%`, background: `linear-gradient(90deg, ${RED}, ${AMBER}, ${CYAN})`, boxShadow: `0 0 18px ${AMBER}88` }} />;
}

// L114 — cinematic atmosphere/grade overlay: film grain (animated feTurbulence) +
// vignette + teal-orange split-tone. The single highest-impact lift from "flat"
// toward "graded/cinematic" without restructuring scenes.
function Atmosphere() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(125% 105% at 50% 42%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.62) 100%)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(30,60,110,0.14) 0%, rgba(0,0,0,0) 45%, rgba(120,65,20,0.16) 100%)', mixBlendMode: 'soft-light' }} />
      <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0, opacity: 0.08, mixBlendMode: 'overlay' }}>
        <filter id="filmgrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 100} stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#filmgrain)" />
      </svg>
    </AbsoluteFill>
  );
}

export const V9StoryMotionComposition = ({
  scriptId = 'demo',
  audioFile = null,
  beats = [],
  wordBoundaries = [],
  powerWords = [],
  directorPlan = null,
}) => {
  const { fps } = useVideoConfig();
  const planBeats = directorPlan && Array.isArray(directorPlan.beats) ? directorPlan.beats : [];
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {beats.map((beat, index) => {
        const startFrame = Math.round((beat.fromSec || 0) * fps);
        const endFrame = Math.round((beat.toSec || 0) * fps);
        const durationInFrames = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={`${scriptId}-${index}`} from={startFrame} durationInFrames={durationInFrames} layout="none">
            <StoryScene beat={planBeats[index] || { module: 'evidence_board', backgroundWorld: 'general_news' }} heroClip={beat.heroClip} durationInFrames={durationInFrames} wordBoundaries={wordBoundaries} beatStartSec={beat.fromSec || 0} />
          </Sequence>
        );
      })}
      <Atmosphere />
      <ProgressBar />
      <Captions wordBoundaries={wordBoundaries} powerWords={powerWords} />
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
    </AbsoluteFill>
  );
};
