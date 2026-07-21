const path = require('path');
const { generateSegmentAudio } = require('./generate-audio');

// Viral-optimized script: Strong hook, fast pacing, emotional arc
const viralScript = {
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

async function main() {
  const outputDir = path.join(__dirname, '..', '..', '..', 'reports', 'audio-wow-signal-v3');
  
  console.log('🎙️ Generating viral audio for: The Wow Signal v3');
  console.log(`Output: ${outputDir}`);
  console.log();
  
  const manifest = await generateSegmentAudio(viralScript, outputDir);
  
  console.log();
  console.log('✅ Audio generation complete!');
  console.log(`Total duration: ${manifest.totalDurationSec.toFixed(1)}s`);
  console.log(`Segments: ${manifest.segments.length}`);
}

main().catch(err => {
  console.error('❌ Audio generation failed:', err.message);
  process.exit(1);
});
