import { registerRoot, Composition } from 'remotion';
import { V8OrganicComposition } from './scenes/V8OrganicComposition';
import { V8MotionComposition } from './scenes/V8MotionComposition';
import { V8ProceduralMotionComposition } from './scenes/V8ProceduralMotionComposition';
import { V9StoryMotionComposition } from './scenes/V9StoryMotionComposition';
import { V10CinematicComposition } from './scenes/V10CinematicComposition';

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
    <Composition id="V8ProceduralMotionComposition" component={V8ProceduralMotionComposition} calculateMetadata={calcMeta} defaultProps={DEFAULTS} fps={30} width={1080} height={1920} />
    <Composition id="V9StoryMotionComposition" component={V9StoryMotionComposition} calculateMetadata={calcMeta} defaultProps={DEFAULTS} fps={30} width={1080} height={1920} />
    {/* L114 V10 cinematic rebuild — same props; selected via ORGANIC_CINEMATIC=1 (V10→V9→V8 fallback) */}
    <Composition id="V10CinematicComposition" component={V10CinematicComposition} calculateMetadata={calcMeta} defaultProps={DEFAULTS} fps={30} width={1080} height={1920} />
  </>
);

registerRoot(V8Root);
