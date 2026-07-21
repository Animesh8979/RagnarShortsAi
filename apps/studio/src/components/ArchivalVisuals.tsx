import React from "react";
import { interpolate } from "remotion";

/**
 * ArchivalVisuals — SVG recreations of real Wow! Signal imagery.
 *
 * Each visual is keyed to a segment in Root.tsx's viralScript:
 *   seg 0 "Space - dramatic radio wave visualization"  -> starfield (hook)
 *   seg 1 "Vintage radio telescope at night"            -> telescope
 *   seg 2 "Star map zooming into deep space"            -> starfield (zoom)
 *   seg 3 "Famous Wow! signal printout with red circle" -> printout
 *   seg 4 "Modern radio telescope array scanning sky"   -> telescopeArray
 *   seg 5 "End screen with subscribe animation"         -> endscreen
 *
 * Faithful details drawn from Wikipedia (Wow! signal):
 *  - Printout intensity scale: space = 0-1 sigma, '1'-'9' = 1-9 sigma,
 *    A=10-11, B=11-12, ... U=30-31. "6EQUJ5" is the actual 6-sample series;
 *    "U" is the 30-sigma peak. Ehman circled 6EQUJ5 in red and wrote "Wow!"
 *    beside it on continuous-feed line-printer paper.
 *  - Signal: narrowband CW, <=10 kHz BW, ~1420.4556 MHz (hydrogen line +50 kHz),
 *    72 s duration, Gaussian rise (36s) -> peak -> fall (36s) as Earth rotation
 *    swept Big Ear's beam across the source.
 *  - Celestial location: two possible RA bands in Sagittarius
 *    (positive horn 19h22m24s, negative horn 19h25m17s, B1950; dec -27d03').
 *  - Distance: script voice says "2,200 light-years" (we honor the script's number;
 *    academic estimate ranges 1,800 ly (2MASS 19281982-2640123, Caballero 2022) up).
 *  - Big Ear: fixed transit (drift-scan) radio telescope — flat tilting
 *    reflector + parabolic reflector + ground plane + twin feed horns.
 */

export type VisualId =
  | "printout"
  | "telescope"
  | "telescopeArray"
  | "starfield"
  | "signalcurve"
  | "distance"
  | "endscreen";

interface ArchivalVisualsProps {
  visualId: VisualId;
  frame: number; // segment-local frame
  segmentIndex?: number;
}

const IN_FRAMES = 15; // ease-in duration for the visual

function useEntry(frame: number) {
  const p = Math.min(frame / IN_FRAMES, 1);
  const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
  const opacity = interpolate(eased, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(eased, [0, 1], [0.85, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, scale, eased };
}

export const ArchivalVisuals: React.FC<ArchivalVisualsProps> = ({
  visualId,
  frame,
}) => {
  const { opacity, scale } = useEntry(frame);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <svg
        viewBox="0 0 540 540"
        width="440"
        height="440"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          borderRadius: 18,
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          background: "#0a0a14",
        }}
      >
        {visualId === "printout" && <Printout frame={frame} />}
        {visualId === "telescope" && <Telescope frame={frame} />}
        {visualId === "telescopeArray" && <TelescopeArray frame={frame} />}
        {visualId === "starfield" && <Starfield frame={frame} />}
        {visualId === "signalcurve" && <SignalCurve frame={frame} />}
        {visualId === "distance" && <Distance frame={frame} />}
        {visualId === "endscreen" && <Endscreen frame={frame} />}
      </svg>
    </div>
  );
};

/* -------------------------------------------------------------- printout */
// The iconic 6EQUJ5 printout. Continuous-feed line-printer paper with
// perforated edges, fixed-width intensity grid, Ehman's red circle + "Wow!".
const Printout: React.FC<{ frame: number }> = ({ frame }) => {
  // The printout as printed: rows of channel-frequency values, with one row
  // containing the famous 6EQUJ5 string. We render a stylised but faithful grid.
  const rows = [
    "08  1420.35  .... .... .... .... .... ....",
    "09  1420.36  .... .... 6EQUJ5 .... .... ....",
    "10  1420.37  .... .... .... .... .... ....",
    "11  1420.38  .... .... .... .... .... ....",
    "12  1420.39  .... .... .... .... .... ....",
  ];
  const ink = "#0c0c0c";
  const paper = "#f5ecd6";
  return (
    <g>
      {/* Continuous-feed paper */}
      <rect x="20" y="40" width="500" height="460" fill={paper} stroke="#c9b98e" />
      {/* Perforation strips */}
      {[40, 500].map((y) => (
        <g key={y}>
          <line x1="20" y1={y} x2="520" y2={y} stroke="#b8a673" strokeWidth="1" />
          {Array.from({ length: 26 }).map((_, i) => (
            <circle key={i} cx={30 + i * 19} cy={y} r="3" fill="#0a0a14" />
          ))}
        </g>
      ))}
      {/* Header */}
      <text x="38" y="78" fill={ink} fontSize="14" fontFamily="'Courier New', monospace">
        OSU RADIO OBS   15AUG77   22:16 UT   1420 MHZ
      </text>
      {/* Channel rows */}
      {rows.map((r, i) => (
        <text
          key={i}
          x="38"
          y={110 + i * 26}
          fill={ink}
          fontSize="16"
          fontFamily="'Courier New', Courier, monospace"
          letterSpacing="1"
        >
          {r}
        </text>
      ))}
      {/* Ehman's red circle around 6EQUJ5 (the middle row) */}
      <ellipse
        cx="270"
        cy="148"
        rx="86"
        ry="14"
        fill="none"
        stroke="#dc2626"
        strokeWidth="3"
        opacity={interpolate(frame, [4, 14], [0, 1], { extrapolateRight: "clamp" })}
        transform="rotate(-3 270 148)"
      />
      {/* Ehman's handwritten "Wow!" */}
      <text
        x="360"
        y="155"
        fill="#dc2626"
        fontSize="34"
        fontStyle="italic"
        fontFamily="'Segoe Script', 'Comic Sans MS', cursive"
        opacity={interpolate(frame, [10, 20], [0, 1], { extrapolateRight: "clamp" })}
        transform="rotate(-6 360 155)"
      >
        Wow!
      </text>
      {/* Caption */}
      <text x="270" y="490" fill="#8a8a9a" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">
        The 6EQUJ5 reading — "U" = 30 standard deviations above background.
      </text>
    </g>
  );
};

/* -------------------------------------------------------------- telescope */
// Big Ear transit telescope, side architectural view. A flat tilting
// reflector on the left bounces sky-noise to a parabolic reflector on the
// right which focuses it down to twin feed horns near ground level.
const Telescope: React.FC<{ frame: number }> = ({ frame }) => {
  const sweep = interpolate(frame, [0, 60], [4, -4], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  return (
    <g>
      {/* night sky */}
      <rect x="20" y="20" width="500" height="500" fill="#05071a" />
      {Array.from({ length: 50 }).map((_, i) => (
        <circle
          key={i}
          cx={20 + (i * 37) % 500}
          cy={20 + (i * 71) % 320}
          r={(i % 3) * 0.5 + 0.5}
          fill="#dfe6ff"
          opacity={0.3 + (i % 5) * 0.12}
        />
      ))}
      {/* ground plane */}
      <rect x="20" y="420" width="500" height="100" fill="#1a1a2a" />
      {/* parabolic reflector (right) */}
      <path d="M 360 140 Q 470 280 360 420" stroke="#94a3b8" strokeWidth="6" fill="none" />
      <line x1="360" y1="140" x2="360" y2="420" stroke="#475569" strokeWidth="2" />
      {/* flat tilting reflector (left) */}
      <g transform={`rotate(${sweep}, 150, 460)`}>
        <rect x="60" y="200" width="200" height="10" fill="#84a4cc" stroke="#3f5a78" />
        <line x1="150" y1="210" x2="150" y2="460" stroke="#475569" strokeWidth="3" />
      </g>
      {/* twin feed horns at focal point of the parabola */}
      <polygon points="300,420 320,440 320,470 280,470 280,440" fill="#64748b" stroke="#cbd5e1" />
      <polygon points="330,420 350,440 350,470 310,470 310,440" fill="#64748b" stroke="#cbd5e1" />
      {/* signal path */}
      <path
        d="M 150 150 L 280 200 L 360 280"
        stroke="#22d3ee"
        strokeWidth="1.6"
        strokeDasharray="6 5"
        opacity={0.85}
        fill="none"
      />
      <text x="270" y="490" fill="#9fb0c8" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">
        Big Ear radio telescope — Ohio State, 1977
      </text>
    </g>
  );
};

/* -------------------------------------------------------------- telescopeArray */
// Segment 4: a modern array of dishes scanning the sky (VLA-style).
const TelescopeArray: React.FC<{ frame: number }> = ({ frame }) => {
  const sweep = interpolate(frame, [0, 60], [0, 60], {
    extrapolateRight: "clamp",
  });
  const dishes = Array.from({ length: 8 }).map((_, i) => ({
    x: 50 + i * 56,
    tilt: (i % 3) * 4 - 4,
  }));
  return (
    <g>
      <rect x="20" y="20" width="500" height="500" fill="#03040f" />
      {Array.from({ length: 60 }).map((_, i) => (
        <circle
          key={i}
          cx={20 + (i * 41) % 500}
          cy={20 + (i * 97) % 360}
          r={(i % 3) * 0.5 + 0.4}
          fill="#dfe6ff"
          opacity={0.25 + (i % 5) * 0.1}
        />
      ))}
      <rect x="20" y="380" width="500" height="140" fill="#120b1c" />
      {dishes.map((d, i) => (
        <g key={i} transform={`translate(${d.x}, 430) rotate(${d.tilt + sweep * 0.4})`}>
          <path d="M 0 0 Q 28 -14 40 0" fill="#84a4cc" stroke="#475569" />
          <line x1="20" y1="-10" x2="22" y2="-46" stroke="#64748b" strokeWidth="2.5" />
          <circle cx="22" cy="-48" r="3" fill="#22d3ee" />
          <rect x="-2" y="0" width="44" height="6" fill="#3f5a78" />
          <rect x="18" y="6" width="6" height="50" fill="#475569" />
        </g>
      ))}
      <line
        x1={30 + sweep}
        y1="40"
        x2={30 + sweep}
        y2="380"
        stroke="#22d3ee"
        strokeWidth="1.2"
        opacity="0.55"
      />
      <text x="270" y="490" fill="#9fb0c8" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">
        Modern radio telescope array — 47 years later
      </text>
    </g>
  );
};

/* -------------------------------------------------------------- starfield */
// Segment 0/2: sky of Sagittarius. Two red RA bands mark the possible
// source locations (positive/negative feed horns).
const Starfield: React.FC<{ frame: number }> = ({ frame }) => {
  const zoom = interpolate(frame, [0, 90], [1, 1.25], {
    extrapolateRight: "clamp",
  });
  const stars = Array.from({ length: 110 }).map((_, i) => ({
    x: ((i * 53) % 500) + 20,
    y: ((i * 89) % 400) + 20,
    r: (i % 4) * 0.4 + 0.4,
    a: 0.3 + (i % 7) * 0.09,
  }));
  return (
    <g transform={`scale(${zoom})`} transformOrigin="270 280">
      <rect x="-100" y="-100" width="740" height="740" fill="#02030a" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#e8eeff" opacity={s.a} />
      ))}
      {/* Sagittarius teapot asterism (stylised) */}
      <g stroke="#fbbf24" strokeWidth="1.4" fill="none" opacity="0.7">
        <line x1="140" y1="220" x2="200" y2="180" />
        <line x1="200" y1="180" x2="270" y2="170" />
        <line x1="270" y1="170" x2="330" y2="210" />
        <line x1="330" y1="210" x2="300" y2="270" />
        <line x1="300" y1="270" x2="240" y2="290" />
        <line x1="240" y1="290" x2="140" y2="220" />
        <line x1="200" y1="180" x2="240" y2="290" />
      </g>
      {/* The two candidate RA bands */}
      <rect x="120" y="305" width="48" height="22" fill="none" stroke="#dc2626" strokeWidth="2.5" opacity="0.85" />
      <rect x="330" y="305" width="48" height="22" fill="none" stroke="#dc2626" strokeWidth="2.5" opacity="0.85" />
      <text x="270" y="490" fill="#9fb0c8" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">
        Source region: Sagittarius — two possible RA bands (19h22m / 19h25m)
      </text>
    </g>
  );
};

/* -------------------------------------------------------------- signalCurve */
// The 72-second Gaussian intensity curve. Rise 36s -> peak "U" -> fall 36s.
const SignalCurve: React.FC<{ frame: number }> = ({ frame }) => {
  const points = Array.from({ length: 73 }).map((_, i) => {
    const x = 50 + (i / 72) * 440;
    const g = Math.exp(-Math.pow((i - 36) / 12, 2));
    const y = 420 - g * 320;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = "M " + points.join(" L ");
  const cursor = Math.min(Math.floor(frame / 1), 72);
  return (
    <g>
      <rect x="20" y="20" width="500" height="500" fill="#02020a" />
      <line x1="50" y1="420" x2="490" y2="420" stroke="#475569" strokeWidth="1.4" />
      <line x1="50" y1="80" x2="50" y2="420" stroke="#475569" strokeWidth="1.4" />
      {[0, 12, 24, 36, 48, 60, 72].map((s) => {
        const x = 50 + (s / 72) * 440;
        return (
          <g key={s}>
            <line x1={x} y1="420" x2={x} y2="425" stroke="#475569" strokeWidth="1.2" />
            <text x={x} y="442" fill="#9fb0c8" fontSize="11" textAnchor="middle" fontFamily="Inter, sans-serif">
              {s}
            </text>
          </g>
        );
      })}
      <text x="40" y="85" fill="#9fb0c8" fontSize="11" textAnchor="end" fontFamily="Inter, sans-serif" transform="rotate(-90 40 85)">Signal / sigma</text>
      <text x="270" y="466" fill="#9fb0c8" fontSize="12" textAnchor="middle" fontFamily="Inter, sans-serif">Time (seconds)</text>
      <path d={`${path} L 490 420 L 50 420 Z`} fill="#22d3ee" opacity="0.14" />
      <path d={path} stroke="#22d3ee" strokeWidth="2.6" fill="none" />
      <circle cx="270" cy="100" r="6" fill="#dc2626" />
      <text x="282" y="106" fill="#dc2626" fontSize="16" fontFamily="'Courier New', monospace" fontWeight="bold">U</text>
      <text x="300" y="106" fill="#dc2626" fontSize="12" fontFamily="Inter, sans-serif">30 sigma peak</text>
      {cursor <= 72 && (
        <line
          x1={50 + (cursor / 72) * 440}
          y1="80"
          x2={50 + (cursor / 72) * 440}
          y2="420"
          stroke="#fbbf24"
          strokeWidth="1.4"
          opacity="0.85"
        />
      )}
      <text x="270" y="500" fill="#9fb0c8" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">
        72-second Gaussian drift curve — physical signature of a real source
      </text>
    </g>
  );
};

/* -------------------------------------------------------------- distance */
// Segment 2 visual support: "From 2,200 light-years away"
const Distance: React.FC<{ frame: number }> = ({ frame }) => {
  const dash = interpolate(frame, [0, 60], [0, 40], {
    extrapolateRight: "clamp",
  });
  return (
    <g>
      <rect x="20" y="20" width="500" height="500" fill="#02030a" />
      <g transform="translate(110, 270)">
        <circle r="34" fill="#1e3a8a" stroke="#bfdbfe" />
        <path d="M -20 -8 Q 0 -18 18 -4 Q 24 8 6 18 Q -10 20 -22 8 Z" fill="#16a34a" opacity="0.85" />
        <path d="M -4 -22 Q 8 -12 -6 2" fill="#16a34a" opacity="0.7" />
      </g>
      <text x="110" y="330" fill="#bfdbfe" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">Earth</text>
      <g transform="translate(430, 270)">
        <circle r="6" fill="#fbbf24" />
        <circle r="14" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.6" />
        <circle r="22" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.35" />
      </g>
      <text x="430" y="330" fill="#fbbf24" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">Source (Sgr)</text>
      <line x1="144" y1="270" x2="424" y2="270" stroke="#22d3ee" strokeWidth="2" strokeDasharray={`${dash} 6`} />
      <text x="270" y="200" fill="white" fontSize="34" fontWeight="bold" textAnchor="middle" fontFamily="Inter, sans-serif">2,200 ly</text>
      <text x="270" y="232" fill="#9fb0c8" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">light-years from Earth</text>
      <text x="270" y="500" fill="#9fb0c8" fontSize="13" textAnchor="middle" fontFamily="Inter, sans-serif">
        Traversing the void: a single signal, two millennia ago
      </text>
    </g>
  );
};

/* -------------------------------------------------------------- endscreen */
const Endscreen: React.FC<{ frame: number }> = ({ frame }) => {
  const pulse = interpolate(frame % 30, [0, 15, 30], [1, 1.18, 1]);
  // iter-13: stacked halo + Wow! stamp + dish silhouette so the closer card
  // has a real focal subject instead of a tiny rectangle in dead space.
  return (
    <g>
      <rect x="20" y="20" width="500" height="500" fill="#02030a" />
      {/* deep gradient night-sky base (so the night sky is not flat black) */}
      <defs>
        <radialGradient id="endSky" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#1b2447" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#0a0f24" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#02030a" stopOpacity="1" />
        </radialGradient>
        <radialGradient id="endHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#dc2626" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="20" y="20" width="500" height="500" fill="url(#endSky)" />
      {/* faint radio-tower silhouette lower-left - a quiet brand anchor */}
      <g opacity="0.45">
        <line x1="90" y1="200" x2="90" y2="380" stroke="#9fb0c8" strokeWidth="3" />
        <line x1="60" y1="380" x2="120" y2="380" stroke="#9fb0c8" strokeWidth="3" />
        <line x1="70" y1="380" x2="70" y2="450" stroke="#9fb0c8" strokeWidth="3" />
        <line x1="110" y1="380" x2="110" y2="450" stroke="#9fb0c8" strokeWidth="3" />
        <line x1="90" y1="200" x2="60" y2="170" stroke="#9fb0c8" strokeWidth="2" />
        <line x1="90" y1="200" x2="120" y2="170" stroke="#9fb0c8" strokeWidth="2" />
      </g>
      {/* strong layered halo behind the FOLLOW button - the focal element */}
      <circle cx="270" cy="240" r="200" fill="url(#endHalo)" />
      <circle cx="270" cy="240" r="125" fill="#dc2626" opacity="0.22" />
      {/* sweep arc suggesting "mysterious signal" (a partial 3/4-circle) */}
      <circle
        cx="270"
        cy="240"
        r="160"
        fill="none"
        stroke="#fca5a5"
        strokeWidth="2"
        strokeDasharray="4 8"
        opacity="0.55"
      />
      {/* Wow! handwritten stamp - the iconic Ehman annotation, upper-left */}
      <g transform="translate(120, 110) rotate(-12)">
        <text
          x="0"
          y="0"
          fill="#f87171"
          fontSize="44"
          fontWeight="bold"
          fontFamily="Bradley Hand, Comic Sans MS, cursive"
          fontStyle="italic"
        >
          Wow!
        </text>
        <ellipse
          cx="-2"
          cy="-12"
          rx="80"
          ry="28"
          fill="none"
          stroke="#f87171"
          strokeWidth="2.5"
          opacity="0.85"
        />
      </g>
      {/* FOLLOW button - the CTA, slightly higher than before so it sits inside the halo */}
      <g transform={`translate(270, 240) scale(${pulse})`}>
        <path
          d="M -52 -26 L 52 -26 L 52 36 L 0 70 L -52 36 Z"
          fill="#dc2626"
          stroke="white"
          strokeWidth="2.5"
          filter="drop-shadow(0 4px 14px rgba(220,38,38,0.55))"
        />
        <text
          x="0"
          y="14"
          fill="white"
          fontSize="38"
          fontWeight="bold"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
          letterSpacing="0.04em"
        >
          FOLLOW
        </text>
        <text
          x="0"
          y="40"
          fill="rgba(255,255,255,0.85)"
          fontSize="13"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
        >
          for more mysteries
        </text>
      </g>
      {/* closing tagline - bottom strip, small but properly framed */}
      <text
        x="270"
        y="485"
        fill="#cbd5e1"
        fontSize="14"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        letterSpacing="0.06em"
      >
        The Wow! Signal — never re-detected. What was it?
      </text>
    </g>
  );
};

/* -------------------------------------------------------------- routing */
export function pickVisual(
  visualCue: string | undefined,
  segmentIndex: number
): VisualId {
  const cue = (visualCue || "").toLowerCase();
  if (cue.includes("printout") || cue.includes("wow!")) return "printout";
  if (cue.includes("array") || cue.includes("scanning")) return "telescopeArray";
  // "radio telescope" / "radio telescope at night" → telescope. Use the full
  // phrase so a hook cue like "Space - dramatic radio wave visualization"
  // does NOT accidentally match here. (iter-7: hook was incorrectly routing
  // to "telescope" because "radio" was a substring of "radio wave".)
  if (cue.includes("radio telescope") || cue.includes("telescope")) return "telescope";
  if (cue.includes("deep space") || cue.includes("star map") || cue.includes("star map zooming"))
    return "starfield";
  if (cue.includes("light years") || cue.includes("distance")) return "distance";
  if (cue.includes("end screen") || cue.includes("subscribe") || cue.includes("follow"))
    return "endscreen";
  // Hook cue "Space - dramatic radio wave visualization" → starfield (the
  // closest existing visual; the "radio wave" framing is conveyed by the
  // headline text + aurora bg, not by a separate wave SVG yet).
  if (cue.includes("radio wave") || cue.includes("wave") || segmentIndex === 0) return "starfield";
  if (segmentIndex === 3) return "printout";
  return "starfield";
}

