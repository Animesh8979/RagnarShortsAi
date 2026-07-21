import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

interface TextRevealProps {
  text: string;
  frame: number;
  startFrame?: number;
  charsPerFrame?: number;
  style?: React.CSSProperties;
  highlightColor?: string;
  isHeadline?: boolean;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  frame,
  startFrame = 0,
  charsPerFrame = 0.5,
  style = {},
  highlightColor = "#4a9eff",
  isHeadline = false,
}) => {
  const relFrame = Math.max(0, frame - startFrame);
  const visibleChars = Math.floor(relFrame * charsPerFrame);

  // Split into word tokens so the browser CAN wrap between words. The old
  // per-character `display:inline-block` made each char an unbreakable atom
  // and produced mid-word overflow ("EXPLAI NED", "1977.Aradiotelescopepicks").
  // Now we wrap each WORD in an inline-block (wrappable unit) and render chars
  // inside it; the reveal animation is preserved per-char.
  const tokens = text.split(/(\s+)/); // keep whitespace as separate tokens
  let charCounter = 0;

  return (
    <div
      style={{
        fontFamily: isHeadline ? "'Bebas Neue', Impact, 'Arial Black', sans-serif" : "'Inter', 'Segoe UI', sans-serif",
        fontSize: isHeadline ? 72 : 38,
        fontWeight: isHeadline ? 700 : 600,
        lineHeight: isHeadline ? 1.1 : 1.5,
        // Body text letterSpacing was 0.01em (too tight for inline-block chars
        // to read as separate glyphs at small sizes — vision flagged words
        // running together). Bumped to 0.02em for visual breathing room.
        letterSpacing: isHeadline ? "0.04em" : "0.02em",
        textAlign: "center",
        color: "white",
        // Remove break-word rules: per-word inline-block atoms are unbreakable
        // anyway, and break-word let the browser reflow mid-token. Allow normal
        // whitespace wrapping only (the explicit \u00A0 width spans are walls).
        whiteSpace: "normal",
        ...style,
      }}
    >
      {tokens.map((tok, ti) => {
        if (/^\s+$/.test(tok)) {
          // whitespace token — render an EXPLICIT width + a non-breaking-space
          // content backup so the gap is mathematically present regardless of
          // parent flex/center/nowrap rules. Prior versions (literal space +
          // inline-block, or width-only with empty body) collapsed to ~0 under
          // flex line-wrap and produced "1977.Aradiotelescope".
          return (
            <span
              key={`ws-${ti}`}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                width: "0.32em",
                verticalAlign: "baseline",
              }}
            >
              {"\u00A0"}
            </span>
          );
        }
        // word token — inline-block so it can wrap as a unit
        return (
          <span key={`w-${ti}`} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
            {tok.split("").map((char, ci) => {
              const i = charCounter++;
              const isVisible = i < visibleChars;
              const justRevealed = i === visibleChars - 1;
              const revealProgress = isVisible
                ? interpolate(
                    relFrame * charsPerFrame - i,
                    [0, 0.5],
                    [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                  )
                : 0;
              const opacity = isVisible ? 1 : 0;
              const translateY = justRevealed
                ? interpolate(revealProgress, [0, 1], [8, 0])
                : 0;
              const scale = justRevealed
                ? interpolate(revealProgress, [0, 1], [1.3, 1])
                : 1;
              return (
                <span
                  key={`${ti}-${ci}`}
                  style={{
                    display: "inline-block",
                    // Per-char inline-block spans touch their neighbors (no
                    // native char-spacing applies between inline boxes). Give
                    // every char a small right margin so adjacent chars in a
                    // word have visible breathing room and the vision model
                    // can never read them as concatenated.
                    marginRight: "0.04em",
                    opacity,
                    transform: `translateY(${translateY}px) scale(${scale})`,
                    color: justRevealed ? highlightColor : "white",
                    textShadow: justRevealed
                      ? `0 0 20px ${highlightColor}80, 0 0 40px ${highlightColor}40`
                      : "0 2px 8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,1)",
                    transition: "none",
                  }}
                >
                  {char === " " ? "\u00A0" : char}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
};

interface GlowTextProps {
  text: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  style?: React.CSSProperties;
}

export const GlowText: React.FC<GlowTextProps> = ({
  text,
  color = "#4a9eff",
  fontSize = 48,
  fontWeight = 800,
  fontFamily = "'Bebas Neue', Impact, sans-serif",
  style = {},
}) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.6, 1]);
  const glowSize = interpolate(Math.sin(frame * 0.08), [-1, 1], [20, 40]);

  return (
    <span
      style={{
        fontFamily,
        fontSize,
        fontWeight,
        color,
        textShadow: `0 0 ${glowSize}px ${color}${Math.round(pulse * 255).toString(16).padStart(2, "0")}, 0 0 ${glowSize * 2}px ${color}40`,
        display: "inline-block",
        ...style,
      }}
    >
      {text}
    </span>
  );
};
