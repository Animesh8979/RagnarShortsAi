import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface SegmentTransitionProps {
  type: "fade" | "glitch" | "zoom" | "wipe";
  durationFrames?: number;
}

export const SegmentTransition: React.FC<SegmentTransitionProps> = ({
  type,
  durationFrames = 8,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (type === "fade") {
    const opacity = progress < 0.5
      ? interpolate(progress, [0, 0.5], [0, 1])
      : interpolate(progress, [0.5, 1], [1, 0]);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "white",
          opacity: opacity * 0.3,
          zIndex: 150,
        }}
      />
    );
  }

  if (type === "glitch") {
    const glitchOffset = Math.sin(frame * 3) * 10 * (1 - progress);
    const glitchOpacity = progress < 0.3
      ? interpolate(progress, [0, 0.3], [0, 1])
      : interpolate(progress, [0.7, 1], [1, 0]);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 150,
          opacity: glitchOpacity,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,255,255,0.1) 2px,
            rgba(0,255,255,0.1) 4px
          )`,
          transform: `translateX(${glitchOffset}px)`,
          mixBlendMode: "screen",
        }}
      />
    );
  }

  if (type === "zoom") {
    const scale = interpolate(progress, [0, 0.5, 1], [1, 1.5, 1]);
    const opacity = progress < 0.3
      ? interpolate(progress, [0, 0.3], [1, 0])
      : interpolate(progress, [0.7, 1], [0, 1]);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#000",
          opacity: opacity,
          transform: `scale(${scale})`,
          zIndex: 150,
        }}
      />
    );
  }

  if (type === "wipe") {
    const xPos = interpolate(progress, [0, 1], [-110, 110]);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 150,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${xPos}%`,
            width: "20%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
          }}
        />
      </div>
    );
  }

  return null;
};

interface SegmentTitleCardProps {
  title: string;
  subtitle?: string;
  color?: string;
  durationFrames?: number;
}

export const SegmentTitleCard: React.FC<SegmentTitleCardProps> = ({
  title,
  subtitle,
  color = "#4a9eff",
  durationFrames = 30,
}) => {
  const frame = useCurrentFrame();

  const enterProgress = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitProgress = interpolate(frame, [durationFrames - 10, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enterProgress, exitProgress);

  const slideY = interpolate(enterProgress, [0, 1], [40, 0]);
  const lineWidth = interpolate(enterProgress, [0, 1], [0, 100]);

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 60,
        right: 60,
        zIndex: 100,
        opacity,
        transform: `translateY(${slideY}px)`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "12px 28px",
          backgroundColor: "rgba(0,0,0,0.75)",
          borderRadius: 12,
          backdropFilter: "blur(12px)",
          border: `1px solid ${color}40`,
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', Impact, sans-serif",
            fontSize: 32,
            fontWeight: 700,
            color: "white",
            letterSpacing: "0.05em",
            textShadow: `0 0 20px ${color}80`,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              color: `${color}cc`,
              marginTop: 4,
              letterSpacing: "0.02em",
            }}
          >
            {subtitle}
          </div>
        )}
        <div
          style={{
            width: `${lineWidth}%`,
            height: 2,
            backgroundColor: color,
            margin: "8px auto 0",
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  );
};
