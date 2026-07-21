import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

interface AuroraBackgroundProps {
  mood: string;
  visualCue: string;
}

const MOOD_AURORA: Record<string, { c1: string; c2: string; c3: string; speed: number }> = {
  excited: { c1: "#ff8c42", c2: "#fbbf24", c3: "#f87171", speed: 1.2 },
  calm: { c1: "#38bdf8", c2: "#22d3ee", c3: "#67e8f9", speed: 0.6 },
  serious: { c1: "#94a3b8", c2: "#cbd5e1", c3: "#e2e8f0", speed: 0.4 },
  mysterious: { c1: "#a78bfa", c2: "#c084fc", c3: "#d8b4fe", speed: 0.8 },
  energetic: { c1: "#f87171", c2: "#fb923c", c3: "#facc15", speed: 1.5 },
  shocked: { c1: "#fbbf24", c2: "#f87171", c3: "#ef4444", speed: 1.8 },
  intrigued: { c1: "#818cf8", c2: "#a78bfa", c3: "#c4b5fd", speed: 0.7 },
  neutral: { c1: "#60a5fa", c2: "#38bdf8", c3: "#93c5fd", speed: 0.5 },
};

function alphaToHex(a: number) {
  const val = Math.round(Math.max(0, Math.min(1, a)) * 255);
  return val.toString(16).padStart(2, "0");
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ mood }) => {
  const frame = useCurrentFrame();
  const aurora = MOOD_AURORA[mood] || MOOD_AURORA.neutral;

  const phase1 = interpolate(frame, [0, 120], [0, 360], { extrapolateRight: "extend" });
  const phase2 = interpolate(frame, [0, 180], [0, 360], { extrapolateRight: "extend" });
  const phase3 = interpolate(frame, [0, 240], [0, 360], { extrapolateRight: "extend" });

  const x1 = 50 + 30 * Math.sin(phase1 * (Math.PI / 180) * aurora.speed);
  const y1 = 30 + 15 * Math.cos(phase2 * (Math.PI / 180) * aurora.speed);
  const x2 = 30 + 25 * Math.cos(phase3 * (Math.PI / 180) * aurora.speed);
  const y2 = 60 + 20 * Math.sin(phase1 * (Math.PI / 180) * aurora.speed);
  const x3 = 70 + 20 * Math.sin(phase2 * (Math.PI / 180) * aurora.speed);
  const y3 = 40 + 25 * Math.cos(phase3 * (Math.PI / 180) * aurora.speed);

  const pulse1 = interpolate(Math.sin(frame * 0.05), [-1, 1], [0.6, 0.9]);
  const pulse2 = interpolate(Math.cos(frame * 0.04), [-1, 1], [0.5, 0.85]);
  const pulse3 = interpolate(Math.sin(frame * 0.03 + 1), [-1, 1], [0.4, 0.8]);

  const a1 = alphaToHex(pulse1);
  const a2 = alphaToHex(pulse2);
  const a3 = alphaToHex(pulse3);

  const gradientBg = `radial-gradient(ellipse 120% 80% at ${x1}% ${y1}%, ${aurora.c1}${a1} 0%, transparent 65%), radial-gradient(ellipse 100% 70% at ${x2}% ${y2}%, ${aurora.c2}${a2} 0%, transparent 55%), radial-gradient(ellipse 90% 60% at ${x3}% ${y3}%, ${aurora.c3}${a3} 0%, transparent 50%)`;

  // iter-12: layered backdrop so the SVG hero never sits in a void.
  // baseDeep = deep navy gradient coat (was pure transparent->black)
  // centralGlow = a STRONG radial halo at the archival-visual anchor
  //               (top ~30% + half of 620px in a 1080-wide frame ≈ 41% center)
  //              — iter-12 deepened: core alpha 0.55->0.85, ring alpha 0.18->0.45
  // vignette = edge darkening to push focus inward
  const baseDeep = "linear-gradient(180deg, #08102a 0%, #11204a 45%, #04081a 100%)";
  const centralGlow = `radial-gradient(ellipse 65% 45% at 50% 41%, ${aurora.c1}${alphaToHex(0.85)} 0%, ${aurora.c1}${alphaToHex(0.55)} 18%, ${aurora.c2}${alphaToHex(0.45)} 38%, transparent 78%)`;
  const vignette = "radial-gradient(ellipse 95% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.7) 100%)";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        zIndex: 0,
        opacity: 1,
      }}
    >
      {/* iter-12: base coat eliminates the void-black frame complaint */}
      <div style={{ position: "absolute", inset: 0, background: baseDeep }} />
      {/* iter-12: central halo anchors the focal zone behind the SVG hero */}
      <div style={{ position: "absolute", inset: 0, background: centralGlow }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: gradientBg,
        }}
      />
      {/* iter-12: vignette draws the eye inward, kills "unbalanced composition" */}
      <div style={{ position: "absolute", inset: 0, background: vignette }} />
      <AuroraParticles frame={frame} mood={mood} />
    </div>
  );
};

const AuroraParticles: React.FC<{ frame: number; mood: string }> = ({ frame, mood }) => {
  const particles = React.useMemo(
    () =>
      new Array(50).fill(0).map((_, i) => ({
        x: (i * 137.5) % 100,
        y: (i * 89.7) % 100,
        size: 1.5 + (i % 5) * 1,
        speed: 0.2 + (i % 4) * 0.15,
        opacity: 0.15 + (i % 3) * 0.1,
        twinkleSpeed: 0.02 + (i % 6) * 0.01,
        twinkleOffset: i * 0.7,
      })),
    []
  );

  const moodGlow: Record<string, string> = {
    excited: "#ff8c42",
    calm: "#38bdf8",
    serious: "#cbd5e1",
    mysterious: "#c084fc",
    energetic: "#fb923c",
    shocked: "#f87171",
    intrigued: "#a78bfa",
    neutral: "#60a5fa",
  };

  const glowColor = moodGlow[mood] || moodGlow.neutral;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {particles.map((p, i) => {
        const y = (p.y + frame * p.speed * 0.06) % 110 - 5;
        const twinkle = interpolate(
          Math.sin(frame * p.twinkleSpeed + p.twinkleOffset),
          [-1, 1],
          [0.3, 1]
        );
        return (
          <div
            key={`aurora-p-${i}`}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: glowColor,
              opacity: p.opacity * twinkle,
              // iter-12: stronger glow + soft outer halo so the night sky
              // doesn't read as a pure black void through the fog of motion.
              boxShadow: `0 0 ${p.size * 6}px ${glowColor}, 0 0 ${p.size * 12}px ${glowColor}80`,
            }}
          />
        );
      })}
    </div>
  );
};
