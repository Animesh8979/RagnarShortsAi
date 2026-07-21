import React from "react";
import { Composition } from "remotion";
import { ExplainerVideo } from "./compositions/ExplainerVideo";
import type { Script } from "./types";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// Preload fonts before any composition renders.
// `loadFont()` returns synchronously with a `waitUntilDone()` promise; we
// kick off the load but do not block composition registration — Remotion
// awaits the document load via `delayRender` internally.
void loadBebasNeue().waitUntilDone().catch((e: unknown) => console.error("BebasNeue font load failed:", e));
void loadInter().waitUntilDone().catch((e: unknown) => console.error("Inter font load failed:", e));

const viralScript: Script = {
  id: "demo_wow_signal_v3",
  title: "This Signal Has NEVER Been Explained",
  segments: [
    {
      speaker: "narrator",
      text: "This signal from space has never been explained.",
      mood: "shocked",
      durationEstimate: 3,
      visualCue: "Space - dramatic radio wave visualization",
    },
    {
      speaker: "narrator",
      text: "1977. A radio telescope picks up something impossible.",
      mood: "intrigued",
      durationEstimate: 4,
      visualCue: "Vintage radio telescope at night",
    },
    {
      speaker: "narrator",
      text: "30 times stronger than background noise. From 2,200 light years away.",
      mood: "serious",
      durationEstimate: 5,
      visualCue: "Star map zooming into deep space",
    },
    {
      speaker: "narrator",
      text: "One man circled the data and wrote one word: Wow.",
      mood: "mysterious",
      durationEstimate: 4,
      visualCue: "Famous Wow! signal printout with red circle",
    },
    {
      speaker: "narrator",
      text: "47 years later. We still have no idea what it was.",
      mood: "serious",
      durationEstimate: 4,
      visualCue: "Modern radio telescope array scanning sky",
    },
    {
      speaker: "narrator",
      text: "Follow for more mysteries that will blow your mind.",
      mood: "energetic",
      durationEstimate: 3,
      visualCue: "End screen with subscribe animation",
    },
  ],
  metadata: {
    topic: "The Wow! Signal",
    targetDuration: 23,
    tone: "energetic",
    language: "en",
    keywords: ["wow", "signal", "alien", "space", "mystery"],
  },
};

const captionsData = [
  { part: "This ", start: 100, end: 350, segmentIndex: 0 },
  { part: "signal ", start: 375, end: 700, segmentIndex: 0 },
  { part: "from ", start: 725, end: 912, segmentIndex: 0 },
  { part: "space ", start: 937, end: 1300, segmentIndex: 0 },
  { part: "has ", start: 1312, end: 1500, segmentIndex: 0 },
  { part: "never ", start: 1512, end: 1800, segmentIndex: 0 },
  { part: "been ", start: 1825, end: 1962, segmentIndex: 0 },
  { part: "explained.", start: 1975, end: 2612, segmentIndex: 0 },
  { part: "1977. ", start: 2712, end: 4037, segmentIndex: 1 },
  { part: "A ", start: 4237, end: 4287, segmentIndex: 1 },
  { part: "radio ", start: 4312, end: 4674, segmentIndex: 1 },
  { part: "telescope ", start: 4699, end: 5274, segmentIndex: 1 },
  { part: "picks ", start: 5287, end: 5512, segmentIndex: 1 },
  { part: "up ", start: 5537, end: 5624, segmentIndex: 1 },
  { part: "something ", start: 5649, end: 5974, segmentIndex: 1 },
  { part: "impossible.", start: 5987, end: 6687, segmentIndex: 1 },
  { part: "30 ", start: 6787, end: 7099, segmentIndex: 2 },
  { part: "times ", start: 7124, end: 7437, segmentIndex: 2 },
  { part: "stronger ", start: 7462, end: 7924, segmentIndex: 2 },
  { part: "than ", start: 7949, end: 8099, segmentIndex: 2 },
  { part: "background ", start: 8124, end: 8624, segmentIndex: 2 },
  { part: "noise. ", start: 8649, end: 9074, segmentIndex: 2 },
  { part: "From ", start: 9962, end: 10199, segmentIndex: 2 },
  { part: "2,200 ", start: 10224, end: 11349, segmentIndex: 2 },
  { part: "light ", start: 11374, end: 11574, segmentIndex: 2 },
  { part: "years ", start: 11587, end: 11799, segmentIndex: 2 },
  { part: "away.", start: 11824, end: 12274, segmentIndex: 2 },
  { part: "One ", start: 12374, end: 12649, segmentIndex: 3 },
  { part: "man ", start: 12674, end: 12874, segmentIndex: 3 },
  { part: "circled ", start: 12899, end: 13311, segmentIndex: 3 },
  { part: "the ", start: 13336, end: 13449, segmentIndex: 3 },
  { part: "data ", start: 13474, end: 13774, segmentIndex: 3 },
  { part: "and ", start: 13799, end: 13911, segmentIndex: 3 },
  { part: "wrote ", start: 13936, end: 14124, segmentIndex: 3 },
  { part: "one ", start: 14149, end: 14349, segmentIndex: 3 },
  { part: "word: ", start: 14361, end: 14586, segmentIndex: 3 },
  { part: "Wow.", start: 14761, end: 15111, segmentIndex: 3 },
  { part: "47 years ", start: 15211, end: 16198, segmentIndex: 4 },
  { part: "later. ", start: 16223, end: 16648, segmentIndex: 4 },
  { part: "We ", start: 17536, end: 17723, segmentIndex: 4 },
  { part: "still ", start: 17748, end: 18011, segmentIndex: 4 },
  { part: "have ", start: 18036, end: 18198, segmentIndex: 4 },
  { part: "no ", start: 18223, end: 18461, segmentIndex: 4 },
  { part: "idea ", start: 18486, end: 18861, segmentIndex: 4 },
  { part: "what ", start: 18886, end: 19036, segmentIndex: 4 },
  { part: "it ", start: 19061, end: 19148, segmentIndex: 4 },
  { part: "was.", start: 19173, end: 19598, segmentIndex: 4 },
  { part: "Follow ", start: 19698, end: 20110, segmentIndex: 5 },
  { part: "for ", start: 20135, end: 20285, segmentIndex: 5 },
  { part: "more ", start: 20310, end: 20510, segmentIndex: 5 },
  { part: "mysteries ", start: 20523, end: 21048, segmentIndex: 5 },
  { part: "that ", start: 21073, end: 21223, segmentIndex: 5 },
  { part: "will ", start: 21248, end: 21410, segmentIndex: 5 },
  { part: "blow ", start: 21423, end: 21660, segmentIndex: 5 },
  { part: "your ", start: 21673, end: 21823, segmentIndex: 5 },
  { part: "mind.", start: 21835, end: 22285, segmentIndex: 5 },
];

const audioManifest = {
  totalDurationMs: 22285,
  segments: [
    { index: 0, durationMs: 2612, offsetMs: 0 },
    { index: 1, durationMs: 4075, offsetMs: 2612 },
    { index: 2, durationMs: 5587, offsetMs: 6687 },
    { index: 3, durationMs: 2837, offsetMs: 12274 },
    { index: 4, durationMs: 4487, offsetMs: 15111 },
    { index: 5, durationMs: 2687, offsetMs: 19598 },
  ],
};

const FPS = 30;
const DURATION_FRAMES = Math.ceil((audioManifest.totalDurationMs / 1000) * FPS) + 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ExplainerVideo"
        component={ExplainerVideo}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          script: viralScript,
          captions: captionsData,
          audioManifest,
        }}
      />
    </>
  );
};
