import { registerRoot, Composition } from 'remotion';
import { V8OrganicComposition } from './scenes/V8OrganicComposition';
import { V8MotionComposition } from './scenes/V8MotionComposition';

const calcMeta = ({ props }) => {
  const fps = 30;
  const last = (props.beats || []).slice(-1)[0];
  const dur = last ? Math.max(1, Math.round(last.toSec * fps)) : 900;
  return { durationInFrames: dur, props };
};
const DEFAULTS = { scriptId: 'demo', audioFile: null, beats: [], wordBoundaries: [], powerWords: [], brand: 'RAGNAR — NEUTRAL NEWS' };

const V8Root = () => (
  <>
    {/* live/proven path — untouched */}
    <Composition id="V8OrganicComposition" component={V8OrganicComposition} calculateMetadata={calcMeta} defaultProps={DEFAULTS} fps={30} width={1080} height={1920} />
    {/* L111 custom motion-graphics path — same props; selected via ORGANIC_MOTION=1 */}
    <Composition id="V8MotionComposition" component={V8MotionComposition} calculateMetadata={calcMeta} defaultProps={DEFAULTS} fps={30} width={1080} height={1920} />
  </>
);

registerRoot(V8Root);
