import { registerRoot, Composition } from 'remotion';
import { V8OrganicComposition } from './scenes/V8OrganicComposition';

const V8Root = () => (
  <>
    <Composition
      id="V8OrganicComposition"
      component={V8OrganicComposition}
      calculateMetadata={({ props }) => {
        const fps = 30;
        const last = (props.beats || []).slice(-1)[0];
        const dur = last ? Math.max(1, Math.round(last.toSec * fps)) : 900;
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

registerRoot(V8Root);
