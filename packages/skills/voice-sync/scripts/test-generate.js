const path = require('path');
const { generateSegmentAudio } = require('./generate-audio');

const wowSignalScript = {
  id: "demo_wow_signal",
  title: "The Wow! Signal — Alien Contact?",
  segments: [
    {
      speaker: "narrator",
      text: "On August 15, 1977, an astronomer named Jerry Ehman was analyzing radio telescope data when he saw something that made his jaw drop.",
      mood: "shocked",
      durationEstimate: 8,
      visualCue: "Space - telescope dish looking up at stars",
    },
    {
      speaker: "narrator",
      text: "A massive, narrow-band radio signal. Exactly what you'd expect from an intelligent source. He circled it on the printout and wrote: Wow! in red pen.",
      mood: "intrigued",
      durationEstimate: 10,
      visualCue: "1977 computer printout with 'Wow!' circled in red",
    },
    {
      speaker: "narrator",
      text: "The signal came from the Sagittarius constellation, nearly 2,200 light-years away. It was 30 times stronger than background noise.",
      mood: "serious",
      durationEstimate: 10,
      visualCue: "Star map zooming into Sagittarius constellation",
    },
    {
      speaker: "narrator",
      text: "Despite decades of listening, we have never heard anything like it again. SETI scientists have ruled out satellites and natural phenomena.",
      mood: "mysterious",
      durationEstimate: 10,
      visualCue: "Radio telescope array at night, scanning the sky",
    },
    {
      speaker: "narrator",
      text: "Follow for more cosmic mysteries that will blow your mind.",
      mood: "energetic",
      durationEstimate: 5,
      visualCue: "End screen: Subscribe + Like with space background",
    },
  ],
  metadata: {
    topic: "The Wow! Signal",
    targetDuration: 45,
    tone: "energetic",
    language: "en",
    keywords: ["wow", "signal", "alien", "space", "seti"],
  },
};

async function main() {
  const outputDir = path.join(__dirname, '..', '..', '..', 'reports', 'audio-wow-signal');
  
  console.log('🎙️ Generating audio for: The Wow Signal');
  console.log(`Output: ${outputDir}`);
  console.log();
  
  const manifest = await generateSegmentAudio(wowSignalScript, outputDir);
  
  console.log();
  console.log('✅ Audio generation complete!');
  console.log(`Total duration: ${manifest.totalDurationSec.toFixed(1)}s`);
  console.log(`Segments: ${manifest.segments.length}`);
  console.log(`Captions: ${manifest.captionsPath}`);
  console.log(`SRT: ${manifest.srtPath}`);
  console.log(`Manifest: ${path.join(outputDir, 'manifest.json')}`);
}

main().catch(err => {
  console.error('❌ Audio generation failed:', err.message);
  process.exit(1);
});
