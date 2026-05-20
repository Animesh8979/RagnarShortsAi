/**
 * src/v7-index.jsx — V7 dedicated Remotion entry
 *
 * Independent from src/index.jsx so V7 renders don't have to import the
 * older heavyweight compositions (V12/V15/V99/etc.) that may have missing
 * dependencies on a fresh branch.
 *
 * Run via: npx remotion render src/v7-index.jsx <SceneId> <output.mp4>
 */

import { registerRoot, Composition } from 'remotion';
import { A1HookScene } from './scenes/A1HookScene';
import { V7OrganicComposition } from './scenes/V7OrganicComposition';

const V7Root = () => {
  return (
    <>
      <Composition
        id="A1HookScene"
        component={A1HookScene}
        durationInFrames={75}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="V7OrganicComposition"
        component={V7OrganicComposition}
        calculateMetadata={({ props }) => {
          const fps = 30;
          const lastBeat = (props.beats || []).slice(-1)[0];
          const dur = lastBeat ? Math.max(1, Math.round(lastBeat.toSec * fps)) : 960;
          return { durationInFrames: dur, props };
        }}
        defaultProps={{
          scriptId: 'demo',
          audioFile: null,
          beats: [],
          wordBoundaries: [],
          powerWords: [],
          brand: 'RAGNAR — NEUTRAL NEWS',
        }}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};

registerRoot(V7Root);
