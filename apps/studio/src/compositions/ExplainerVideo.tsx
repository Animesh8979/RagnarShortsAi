import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
  Audio,
  staticFile,
} from "remotion";
import { Character as SvgCharacter } from "../components/Character";
import { AuroraBackground } from "../components/AuroraBackground";
import { TextReveal, GlowText } from "../components/TextReveal";
import { SegmentTransition, SegmentTitleCard } from "../components/Transition";
import {
  ArchivalVisuals,
  pickVisual,
} from "../components/ArchivalVisuals";

interface CaptionWord {
  part: string;
  start: number;
  end: number;
  segmentIndex: number;
}

interface Segment {
  speaker: string;
  text: string;
  mood?: string;
  durationEstimate?: number;
  visualCue?: string;
}

interface Script {
  id: string;
  title: string;
  segments: Segment[];
  metadata?: Record<string, unknown>;
}

interface AudioManifest {
  totalDurationMs: number;
  segments: { index: number; durationMs: number; offsetMs: number }[];
}

interface ExplainerVideoProps {
  script: Script;
  captions: CaptionWord[];
  audioManifest: AudioManifest;
}

const HEADLINE_FONT = "'Bebas Neue', Impact, 'Arial Black', sans-serif";
const BODY_FONT = "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// ponytail: simplified to SVG-only — removed Lottie fallback tier (iter-14 cleanup).
// The articulated SVG Character has true mouth-open synced to speech, breathing,
// blink, and arm-sway; no need for a flat 400x400 Lottie alt.

// Mood accents — desaturated to Tailwind-700/800 grade so they read as
// cohesive accent gradients, not saturated clashes against the character.
// Prior Tailwind-400 grade (#fb923c, #fbbf24, #c084fc) was flagged by the
// vision audit as "jarring saturated clash".
const MOOD_ACCENT: Record<string, string> = {
  shocked: "#b91c1c",
  excited: "#9a3412",
  mysterious: "#6b21a8",
  energetic: "#854d0e",
  calm: "#0e7490",
  serious: "#475569",
  intrigued: "#5b21b6",
  neutral: "#1e40af",
};

const MOOD_BG_TOP: Record<string, string> = {
  shocked: "#0a0608",
  excited: "#0c0805",
  mysterious: "#0a0818",
  energetic: "#0c0805",
  calm: "#04080c",
  serious: "#08090c",
  intrigued: "#0a0818",
  neutral: "#06080f",
};

const MOOD_BG_BOTTOM: Record<string, string> = {
  shocked: "#3b1619",
  excited: "#3a2410",
  mysterious: "#241340",
  energetic: "#3a2c10",
  calm: "#0c2838",
  serious: "#1c2028",
  intrigued: "#241340",
  neutral: "#14223e",
};

export const ExplainerVideo: React.FC<ExplainerVideoProps> = ({
  script,
  captions,
  audioManifest,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 25, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const masterOpacity = fadeIn * fadeOut;

  let currentSegmentIndex = 0;
  for (const seg of audioManifest.segments) {
    if (
      currentTimeMs >= seg.offsetMs &&
      currentTimeMs < seg.offsetMs + seg.durationMs
    ) {
      currentSegmentIndex = seg.index;
      break;
    }
  }

  const currentSegment =
    script.segments[currentSegmentIndex] || script.segments[0];
  const isEnding = currentSegmentIndex === script.segments.length - 1;
  // iter-10: force a cool/neutral mood on the ending segment — the iter-9
  // audit flagged "jarring red/yellow clash" on the end-card because seg 5's
  // mood (excited/climax) used a warm accent. The CTA plate should feel calm
  // and authoritative, not energetic.
  const currentMood = isEnding ? "mysterious" : currentSegment.mood || "neutral";
  const accentColor = MOOD_ACCENT[currentMood] || MOOD_ACCENT.neutral;

  const recentWords = captions
    .filter(
      (c) =>
        c.end > currentTimeMs - 3000 &&
        c.start <= currentTimeMs + 500 &&
        c.segmentIndex === currentSegmentIndex
    )
    .slice(-8);

  const isTalking = captions.some(
    (c) =>
      c.start <= currentTimeMs &&
      c.end > currentTimeMs &&
      c.segmentIndex === currentSegmentIndex
  );

  // Smooth isTalking with a 200ms hold after the last word ends
  const lastWordEnd = captions
    .filter(
      (c) =>
        c.end <= currentTimeMs &&
        c.segmentIndex === currentSegmentIndex
    )
    .reduce((max, c) => Math.max(max, c.end), 0);
  const isTalkingSmoothed =
    isTalking || (lastWordEnd > 0 && currentTimeMs - lastWordEnd < 200);

  const isHook = currentSegmentIndex === 0;
  // isEnding declared above (line 134, drives the neutral mood override)

  const segmentStartFrame = Math.round(
    ((audioManifest.segments[currentSegmentIndex]?.offsetMs ?? 0) / 1000) * fps
  );
  const segmentLocalFrame = Math.max(0, frame - segmentStartFrame);

  const bgTop = MOOD_BG_TOP[currentMood] || MOOD_BG_TOP.neutral;
  const bgBottom = MOOD_BG_BOTTOM[currentMood] || MOOD_BG_BOTTOM.neutral;

  return (
    <AbsoluteFill>
      {/* Full-screen bright gradient background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(170deg, ${bgTop} 0%, ${bgBottom} 70%, ${accentColor}30 100%)`,
        }}
      />

      {/* Aurora overlay (adds motion) */}
      <AuroraBackground
        mood={currentMood}
        visualCue={currentSegment.visualCue || "default"}
      />

      {/* Hook focal glyph — iter-9: the iter-7 nuclear fix removed the
          character from the hook, leaving the headline "floating in dead
          space" per the iter-8 audit. Add a CLEAN animated signal-pulse SVG
          (concentric rings expanding outward — a "wow signal" radio wave)
          centered below the headline. Small (480x320), distinct from the
          aurora bg, no SVG-render risk at this scale. */}
      {isHook && (
        <div
          style={{
            position: "absolute",
            top: "52%",
            left: "50%",
            width: 480,
            height: 320,
            transform: "translate(-50%, -50%)",
            zIndex: 3,
            opacity: masterOpacity,
            pointerEvents: "none",
            filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.6))",
          }}
        >
          <svg viewBox="0 0 480 320" width="480" height="320">
            {/* Three concentric expanding radio-wave rings pulse with the
                segment frame to convey "signal transmission". */}
            {[0, 1, 2].map((ring) => {
              const baseR = 40 + ring * 36;
              // phase drives the pulse — each ring expands outward 0->1
              const phase = ((segmentLocalFrame + ring * 12) % 60) / 60;
              const r = baseR + phase * 28;
              const op = 0.65 - phase * 0.55; // fade as it expands
              return (
                <circle
                  key={ring}
                  cx={240}
                  cy={160}
                  r={r}
                  fill="none"
                  stroke={accentColor}
                  strokeWidth={3 - ring * 0.6}
                  opacity={op}
                />
              );
            })}
            {/* central signal source dot — the "wow" origin */}
            <circle cx={240} cy={160} r={14} fill={accentColor} opacity={0.85} />
            <circle cx={240} cy={160} r={7} fill="#ffffff" opacity={0.9} />
          </svg>
        </div>
      )}

      {/* Archival SVG visual — keyed to the current segment's visualCue.
          Rendered for non-hook, non-ending segments. iter-8: REVERTED the
          iter-7 hook-visual experiment — the starfield at top:46% overlapped
          the headline plate and the audit flagged "broken SVG / not focal".
          iter-9: hook gets a dedicated animated signal-pulse glyph instead
          (above), not the full 620x620 ArchivalVisuals visual. Middle
          segments keep their SVG visual as the hero. */}
      {currentSegment.visualCue && !isHook && !isEnding && (
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            width: 620,
            height: 620,
            transform: "translateX(-50%)",
            zIndex: 4,
            opacity: masterOpacity * 0.98,
            pointerEvents: "none",
            filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.55))",
          }}
        >
          <ArchivalVisuals
            visualId={pickVisual(currentSegment.visualCue, currentSegmentIndex)}
            frame={segmentLocalFrame}
            segmentIndex={currentSegmentIndex}
          />
        </div>
      )}

      {/* Audio tracks */}
      {audioManifest.segments.map((seg) => (
        <Sequence
          key={seg.index}
          from={Math.round((seg.offsetMs / 1000) * fps)}
        >
          <Audio
            src={staticFile(`audio/segment_${seg.index}.mp3`)}
            volume={0.9}
          />
        </Sequence>
      ))}

      {/* Background music - subtle ambient pad under narration */}
      <Audio
        src={staticFile("audio/background-music.mp3")}
        volume={(f) => 0.12 * (1 - 0.5 * Math.min(1, Math.max(0, f / 30)))}
      />

      {/* Character - tall articulated human figure. ONLY on the ending (seg 5).
           iter-6 audit still flagged the hook (seg 0) character as flat despite
           the SVG depth additions. iter-7 NUCLEAR fix: drop the character from
           the hook entirely — the hook's big TextReveal headline IS the focal
           element (kinetic-typography title card). Middle segments remain
           single-hero (SVG visual only). The character survives only on the
           ending CTA as a "presenter asking you to follow" anchor. */}
      {isEnding && (
      <div
        style={{
          position: "absolute",
          bottom: "0%",
          left: "50%",
          width: 720,
          height: 1440,
          transform: "translateX(-50%)",
          zIndex: 5,
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 60px ${accentColor}55) drop-shadow(0 12px 30px rgba(0,0,0,0.55))`,
        }}
      >
        <SvgCharacter
            mood={currentMood}
            isTalking={isTalkingSmoothed}
            frame={frame}
          />
      </div>
      )}

      {/* Headline / Hook text - large, centered, top area. iter-8: gated
          !isEnding so the ending segment's "Follow for more mysteries..." text
          doesn't render behind the CTA plate (was the iter-7 overlap defect). */}
      {!isEnding && (
      <div
        style={{
          position: "absolute",
          top: "8%",
          left: 40,
          right: 40,
          zIndex: 10,
          textAlign: "center",
          opacity: masterOpacity,
        }}
      >
        {/* Backing plate for readability — semi-opaque dark band so white text
            always has contrast even against bright aurora peaks. */}
        <div
          style={{
            display: "inline-block",
            padding: "16px 28px",
            borderRadius: 18,
            background: "rgba(8,10,18,0.62)",
            border: `1px solid rgba(255,255,255,0.06)`,
            backdropFilter: "blur(2px)",
          }}
        >
          <TextReveal
            text={isHook ? script.title : currentSegment.text}
            frame={segmentLocalFrame}
            startFrame={isHook ? 0 : 5}
            charsPerFrame={isHook ? 2.5 : 2}
            isHeadline={isHook}
            highlightColor={accentColor}
            style={{
              color: "white",
              fontSize: isHook ? 80 : 64,
              textShadow: `0 2px 4px rgba(0,0,0,1), 0 4px 12px rgba(0,0,0,0.9), 0 0 30px ${accentColor}80`,
          }}
        />
        </div>
      </div>
      )}

      {/* Word-by-word captions - large, centered in middle-bottom (below the
          ArchivalVisuals SVG which now occupies top 30%-50%). iter-10: gate
          !isEnding too — the seg-5 caption words "Follow for more mysteries
          that will blow your mind" were rendering BEHIND the CTA plate on the
          ending, which the iter-9 audit flagged as overlapping text. The
          ending's only text should be the GlowText CTA inside the plate. */}
      {recentWords.length > 0 && !isHook && !isEnding && (
        <div
          style={{
            position: "absolute",
            top: "74%",
            left: 50,
            right: 50,
            zIndex: 10,
            opacity: masterOpacity,
          }}
        >
          <WordCaptions
            words={recentWords}
            currentTimeMs={currentTimeMs}
            accentColor={accentColor}
          />
        </div>
      )}

      {/* Ending CTA */}
      {isEnding && (
        <div
          style={{
            position: "absolute",
            top: "32%",
            left: 50,
            right: 50,
            zIndex: 10,
            textAlign: "center",
            opacity: masterOpacity,
          }}
        >
          {/* Backing plate anchors the CTA against the dark bg, removes the
              "floats in dead space" composition defect from iter-5 audit.
              iter-6 added a faded telescope silhouette NVA that the audit
              flagged as "broken SVG" — REVERTED iter-7 to a clean plate only. */}
          <div
            style={{
              display: "inline-block",
              padding: "72px 96px",
              background:
                "linear-gradient(180deg, rgba(10,16,28,0.92) 0%, rgba(6,10,20,0.96) 100%)",
              borderRadius: 28,
              boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
            }}
          >
            {/* Small accent rule above the CTA — a single clean line beats a
                broken faded illustration; it adds focal weight without
                introducing SVG-render risk at this scale. */}
            <div
              style={{
                width: 64,
                height: 3,
                margin: "0 auto 36px",
                background: "rgba(124,141,160,0.5)",
                borderRadius: 2,
              }}
            />
            <GlowText
              text="FOLLOW FOR MYSTERIES"
              color="#7c8da0"
              fontSize={64}
              fontFamily={HEADLINE_FONT}
            />
          </div>
        </div>
      )}

      {/* Segment transitions */}
      {audioManifest.segments.map((seg, i) => {
        if (i === 0) return null;
        const transitionFrame = Math.round((seg.offsetMs / 1000) * fps);
        return (
          <Sequence
            key={`tr-${i}`}
            from={Math.max(0, transitionFrame - 6)}
            durationInFrames={12}
          >
            <SegmentTransition
              type={
                (["fade", "glitch", "wipe", "zoom"] as const)[i % 4]
              }
              durationFrames={12}
            />
          </Sequence>
        );
      })}

      {/* Segment title card */}
      {currentSegmentIndex > 0 && segmentLocalFrame < 25 && (
        <Sequence from={segmentStartFrame} durationInFrames={25}>
          <SegmentTitleCard
            title={`PART ${currentSegmentIndex + 1}`}
            subtitle={currentMood.toUpperCase()}
            color={accentColor}
            durationFrames={25}
          />
        </Sequence>
      )}

      {/* Top bar: title + counter */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          right: 20,
          zIndex: 50,
          opacity: masterOpacity,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: "6px 16px",
            backgroundColor: "rgba(0,0,0,0.4)",
            borderRadius: 10,
          }}
        >
          <p
            style={{
              color: "white",
              fontSize: 18,
              fontWeight: 700,
              margin: 0,
              fontFamily: HEADLINE_FONT,
              letterSpacing: "0.04em",
            }}
          >
            {script.title}
          </p>
        </div>
        <div
          style={{
            padding: "6px 14px",
            backgroundColor: "rgba(0,0,0,0.4)",
            borderRadius: 10,
          }}
        >
          <p
            style={{
              color: accentColor,
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              fontFamily: BODY_FONT,
            }}
          >
            {currentSegmentIndex + 1}/{script.segments.length}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          backgroundColor: "rgba(255,255,255,0.08)",
          zIndex: 50,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, (frame / durationInFrames) * 100)}%`,
            background: `linear-gradient(90deg, ${accentColor}, #a855f7)`,
            borderRadius: "0 3px 3px 0",
            boxShadow: `0 0 16px ${accentColor}90`,
          }}
        />
      </div>

      {/* Fade-in overlay */}
      {fadeIn < 1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `rgba(0, 0, 0, ${1 - fadeIn})`,
            zIndex: 200,
          }}
        />
      )}

      {/* Fade-out overlay */}
      {fadeOut < 1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `rgba(0, 0, 0, ${1 - fadeOut})`,
            zIndex: 200,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

const WordCaptions: React.FC<{
  words: CaptionWord[];
  currentTimeMs: number;
  accentColor?: string;
}> = ({ words, currentTimeMs, accentColor = "#4a9eff" }) => {
  if (!words || words.length === 0) return null;

  return (
    <div
      style={{
        padding: "18px 24px",
        backgroundColor: "rgba(0,0,0,0.35)",
        borderRadius: 20,
        border: `1px solid rgba(255,255,255,0.1)`,
      }}
    >
      <p
        style={{
          color: "white",
          fontSize: 36,
          lineHeight: 1.55,
          margin: 0,
          textAlign: "center",
          fontFamily: BODY_FONT,
          fontWeight: 700,
          letterSpacing: "0.01em",
          // iter-7: nowrap prevents the mid-sentence line-wrap that iter-6
          // audit flagged on "One man circled the data and wrote one word: Wow."
          // The whole recent-words phrase must sit on one line; if it would
          // overflow, we shrink font rather than wrap.
          whiteSpace: "nowrap",
          textShadow: `0 2px 16px rgba(0,0,0,0.9), 0 0 30px ${accentColor}30`,
        }}
      >
        {words.map((word, i) => {
          const isActive =
            currentTimeMs >= word.start && currentTimeMs < word.end;
          const isPast = currentTimeMs >= word.end;

          return (
            <span
              key={`${word.start}-${i}`}
              style={{
                color: isActive
                  ? accentColor
                  : isPast
                  ? "rgba(255,255,255,0.4)"
                  : "rgba(255,255,255,0.95)",
                display: "inline-block",
                // Per-word marginRight gives inter-word spacing that survives
                // flex layout rules. Without this, inline-block word spans
                // touch their neighbours ("30timesstrongerthanbackgroundnoise").
                marginRight: "0.28em",
                textShadow: isActive
                  ? `0 0 24px ${accentColor}90, 0 2px 8px rgba(0,0,0,0.8)`
                  : "0 2px 6px rgba(0,0,0,0.6)",
              }}
            >
              {word.part}
            </span>
          );
        })}
      </p>
    </div>
  );
};
