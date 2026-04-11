import { Composition, Still } from 'remotion';
import { MasterComposition } from './MasterComposition';
import { UniversalShort } from './Composition';
import { IroncladV10Composition } from './IroncladV10Composition';
import { V12Composition } from './V12Composition';
import { V15Composition } from './V15Composition';
import { V99Composition } from './V99Composition';
import { ThumbnailComposition } from './ThumbnailComposition';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="MasterCompositionTest"
        component={MasterComposition}
        calculateMetadata={({ props }) => {
          return { durationInFrames: props.durationInFrames || 300, props };
        }}
        defaultProps={{
          videoClips: [], timestamps: [], voiceoverFile: null, durationInFrames: 300
        }}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="UniversalShort"
        component={UniversalShort}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="IroncladV10Composition"
        component={IroncladV10Composition}
        calculateMetadata={({ props }) => {
          return { durationInFrames: props.durationInFrames || 300, props };
        }}
        defaultProps={{
          clipTimings: [], timestamps: [], voiceoverFile: null, syncShiftMs: -66, durationInFrames: 300
        }}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="V12Composition"
        component={V12Composition}
        calculateMetadata={({ props }) => {
          return { durationInFrames: props.durationInFrames || 300, props };
        }}
        defaultProps={{
          scenes: [],
          timestamps: [],
          captionChunks: [],
          mixedAudioFile: null,
          voiceoverFile: null,
          hasBGM: false,
          audioMixMode: 'voice_only',
          qualityReport: null,
          hookPackage: null,
          avatarPackage: null,
          retentionBlueprint: null,
          sfxPack: null,
          beatFrames: [],
          durationInFrames: 300,
        }}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="V15Composition"
        component={V15Composition}
        calculateMetadata={({ props }) => {
          return { durationInFrames: props.durationInFrames || 300, props };
        }}
        defaultProps={{
          scenes: [],
          timestamps: [],
          captionChunks: [],
          mixedAudioFile: null,
          voiceoverFile: null,
          hasBGM: false,
          audioMixMode: 'voice_only',
          qualityReport: null,
          hookPackage: null,
          avatarPackage: null,
          retentionBlueprint: null,
          durationInFrames: 300,
        }}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="V99Composition"
        component={V99Composition}
        calculateMetadata={({ props }) => {
          return { durationInFrames: props.durationInFrames || 300, props };
        }}
        defaultProps={{
          scenes: [],
          timestamps: [],
          captionChunks: [],
          mixedAudioFile: null,
          voiceoverFile: null,
          hasBGM: false,
          audioMixMode: 'voice_only',
          qualityReport: null,
          hookPackage: null,
          avatarPackage: null,
          retentionBlueprint: null,
          dopaminePlan: [],
          sfxPack: null,
          beatFrames: [],
          durationInFrames: 300,
        }}
        fps={30}
        width={1080}
        height={1920}
      />
      <Still
        id="ThumbnailComposition"
        component={ThumbnailComposition}
        defaultProps={{
          headline: 'BREAKING NEWS',
          template: 'breaking',
          tag: 'EXCLUSIVE',
          subjectImage: null,
          emoji: null,
        }}
        width={1280}
        height={720}
      />
    </>
  );
};
