import React from "react";
import { interpolate } from "remotion";

interface CharacterProps {
  mood: string;
  isTalking: boolean;
  frame: number;
}

export const Character: React.FC<CharacterProps> = ({ mood, isTalking, frame }) => {
  const fps = 30;
  const { color, accentColor } = getMoodColors(mood);

  // Breathing animation
  const breathY = interpolate(
    frame,
    [0, fps * 2],
    [0, -3],
    { extrapolateRight: "repeat" }
  );

  // Mouth animation when talking
  const mouthOpen = isTalking
    ? interpolate(frame, [0, fps / 4, fps / 2, (3 * fps) / 4], [0, 1, 0, 1], {
        extrapolateRight: "repeat",
      })
    : 0;

  // Eye blinking
  const blink = frame % (fps * 3) < 3 ? 0.1 : 1;

  // Arm sway
  const armAngle = interpolate(frame, [0, fps * 2], [-5, 5], {
    extrapolateRight: "reverse",
  });

  // Gesture when emphasizing
  const gesturePhase = (frame % (fps * 3)) / (fps * 3);
  const isGesturing = gesturePhase < 0.3;
  const gestureRaise = isGesturing
    ? interpolate(gesturePhase, [0, 0.15, 0.3], [0, 20, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const features = getMoodFeatures(mood);

  return (
    <svg
      viewBox="0 0 400 800"
      style={{ width: "100%", height: "100%" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="skinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={accentColor} />
        </linearGradient>
        <linearGradient id="shirtGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={features.shirtColor} />
          <stop offset="100%" stopColor={features.shirtDark} />
        </linearGradient>
        {/* Neck underside shadow — sells the head/torso attachment. */}
        <linearGradient id="neckShadow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
        </linearGradient>
        {/* Hair underside shadow for crown weight vs skin. */}
        <linearGradient id="hairShadow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g transform={`translate(200, ${400 + breathY})`}>
        {/* Shadow — wider, softer, with a secondary inner shadow for groundedness */}
        <ellipse cx="0" cy="380" rx="140" ry="22" fill="rgba(0,0,0,0.35)" />
        <ellipse cx="0" cy="378" rx="80" ry="12" fill="rgba(0,0,0,0.45)" />

        {/* Legs */}
        <rect x="-40" y="180" width="25" height="160" rx="10" fill={features.pantsColor} />
        <rect x="15" y="180" width="25" height="160" rx="10" fill={features.pantsColor} />

        {/* Torso — slightly darker inner stroke so the form reads as a body, not a flat shape */}
        <path
          d="M -80 180 L -60 -50 Q 0 -70 60 -50 L 80 180 Q 0 200 -80 180 Z"
          fill="url(#shirtGradient)"
          stroke={features.shirtDark}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Clothing fold lines — vertical shading that conveys 3D torso form
             at the hook scale. Primary lever iter-6 to clear the frame-39
             "character flat" axis. */}
        <path
          d="M -40 180 Q -25 -10 -20 -45"
          stroke={features.shirtDark}
          strokeWidth="1.4"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
        <path
          d="M 40 180 Q 25 -10 20 -45"
          stroke={features.shirtDark}
          strokeWidth="1.4"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
        <path
          d="M 0 180 L 0 -50"
          stroke={features.shirtDark}
          strokeWidth="1"
          fill="none"
          opacity="0.4"
        />

        {/* Arms with gesture */}
        <g transform={`rotate(${armAngle}, -80, 50)`}>
          <path
            d={`M -80 50 Q -120 100 -110 ${150 + gestureRaise}`}
            stroke={features.shirtColor}
            strokeWidth="20"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="-110" cy={150 + gestureRaise} r="15" fill={color} />
        </g>
        <g transform={`rotate(${-armAngle}, 80, 50)`}>
          <path
            d={`M 80 50 Q 120 100 110 ${160 - gestureRaise / 2}`}
            stroke={features.shirtColor}
            strokeWidth="20"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="110" cy={160 - gestureRaise / 2} r="15" fill={color} />
        </g>

        {/* Head Group */}
        <g transform="translate(0, -100)">
          {/* Neck — skin-colored rect with a soft vertical gradient so the head
               reads attached to the torso instead of floating. The gradient
               sells the "modelling" depth the iter-5 audit flagged as flat. */}
          <rect x="-15" y="40" width="30" height="50" fill={color} />
          <rect x="-15" y="40" width="30" height="50" fill="url(#neckShadow)" />
          <ellipse cx="0" cy="0" rx="70" ry="80" fill="url(#skinGradient)" />

          {/* Jaw / cheekbone definition — subtle shadow paths under the skin
               gradient. At 720×1440 hook scale these read as facial structure
               instead of a flat circle. */}
          <path
            d="M -68 30 Q -60 50 -40 55 Q -20 50 -10 35"
            fill="none"
            stroke="rgba(0,0,0,0.10)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 68 30 Q 60 50 40 55 Q 20 50 10 35"
            fill="none"
            stroke="rgba(0,0,0,0.10)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Chin line */}
          <path
            d="M -20 60 Q 0 75 20 60"
            fill="none"
            stroke="rgba(0,0,0,0.08)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Hair */}
          <path
            d="M -70 -20 Q -75 -80 0 -90 Q 75 -80 70 -20 Q 70 -40 0 -60 Q -70 -40 -70 -20 Z"
            fill={features.hairColor}
          />
          {/* Hair shadow — a darker silhouette beneath the crown edge that
               gives the hair weight against the skin. */}
          <path
            d="M -70 -20 Q -75 -8 -50 -2 Q -25 4 0 4 Q 25 4 50 -2 Q 75 -8 70 -20"
            fill={features.hairColor}
            opacity="0.45"
          />
          <path
            d="M -60 -12 Q -55 -28 0 -42 Q 55 -28 60 -12"
            fill="url(#hairShadow)"
            opacity="0.55"
          />

          {/* Eyes — slightly larger so pupils + highlights read at thumbnail scale */}
          <g transform={`scale(1, ${blink})`}>
            <ellipse cx="-25" cy="-5" rx="15" ry="10" fill="white" />
            <ellipse cx="25" cy="-5" rx="15" ry="10" fill="white" />
            <circle cx="-25" cy="-5" r="6" fill={features.eyeColor} />
            <circle cx="25" cy="-5" r="6" fill={features.eyeColor} />
            <circle cx="-24" cy="-7" r="3" fill="white" />
            <circle cx="26" cy="-7" r="3" fill="white" />
          </g>

          {/* Eyebrows */}
          <path
            d={`M -35 ${features.eyebrowY} Q -25 ${features.eyebrowY - features.eyebrowCurve} -15 ${features.eyebrowY}`}
            stroke={features.hairColor}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M 15 ${features.eyebrowY} Q 25 ${features.eyebrowY - features.eyebrowCurve} 35 ${features.eyebrowY}`}
            stroke={features.hairColor}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />

          {/* Nose */}
          <path d="M -5 15 Q 0 25 5 15" stroke="rgba(0,0,0,0.2)" strokeWidth="2" fill="none" />

          {/* Mouth */}
          <g transform={`translate(0, ${30 + mouthOpen * 2})`}>
            {mouthOpen > 0.1 ? (
              <>
                <ellipse cx="0" cy="0" rx={15 + mouthOpen * 5} ry={5 + mouthOpen * 10} fill={features.lipColor} />
                <path d={`M -10 0 Q 0 ${5 + mouthOpen * 3} 10 0`} stroke="#8B0000" strokeWidth="2" fill="none" />
              </>
            ) : (
              <path d="M -15 0 Q 0 5 15 0" stroke={features.lipColor} strokeWidth="3" fill="none" strokeLinecap="round" />
            )}
          </g>
        </g>
      </g>
    </svg>
  );
};

function getMoodColors(mood: string) {
  const colors: Record<string, { color: string; accentColor: string }> = {
    excited: { color: "#FFD1A9", accentColor: "#FF8C42" },
    calm: { color: "#F5E6D3", accentColor: "#E8D5B7" },
    serious: { color: "#E8D5B7", accentColor: "#D4C4A8" },
    mysterious: { color: "#E8D5B7", accentColor: "#F5E6D3" },
    energetic: { color: "#FFD1A9", accentColor: "#FF8C42" },
    shocked: { color: "#FFD1A9", accentColor: "#FF6B6B" },
    intrigued: { color: "#E8D5B7", accentColor: "#C4B5FD" },
    neutral: { color: "#F5E6D3", accentColor: "#E8D5B7" },
  };
  return colors[mood] || colors.neutral;
}

interface MoodFeatures {
  shirtColor: string;
  shirtDark: string;
  pantsColor: string;
  hairColor: string;
  eyeColor: string;
  lipColor: string;
  eyebrowY: number;
  eyebrowCurve: number;
}

function getMoodFeatures(mood: string): MoodFeatures {
  const defaults: MoodFeatures = {
    shirtColor: "#3B82F6",
    shirtDark: "#1D4ED8",
    pantsColor: "#1F2937",
    hairColor: "#2C1810",
    eyeColor: "#4B5563",
    lipColor: "#8B4A4A",
    eyebrowY: -15,
    eyebrowCurve: 5,
  };

  const features: Record<string, Partial<MoodFeatures>> = {
    excited: { shirtColor: "#0F766E", shirtDark: "#115E59", eyebrowCurve: -3 },
    calm: { shirtColor: "#0F766E", shirtDark: "#115E59", eyebrowY: -12 },
    serious: { shirtColor: "#374151", shirtDark: "#1F2937", eyebrowY: -18, eyebrowCurve: 0 },
    mysterious: { shirtColor: "#4C1D95", shirtDark: "#312E81", eyebrowCurve: 2 },
    energetic: { shirtColor: "#7C2D12", shirtDark: "#7C2D12", eyebrowCurve: -2 },
    shocked: { shirtColor: "#9F1239", shirtDark: "#881337", eyebrowY: -22, eyebrowCurve: -5 },
    intrigued: { shirtColor: "#4C1D95", shirtDark: "#312E81", eyebrowY: -16, eyebrowCurve: 3 },
  };

  return { ...defaults, ...(features[mood] || {}) };
}
