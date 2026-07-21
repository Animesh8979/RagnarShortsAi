const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');

const VOICE = process.env.TTS_VOICE || 'en-US-GuyNeural';
const RATE = process.env.TTS_RATE || '+0%';
const PITCH = process.env.TTS_PITCH || '+0%';

async function generateAudio(text, outputPath, options = {}) {
  const tts = new EdgeTTS({
    voice: options.voice || VOICE,
    lang: 'en-US',
    outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
    saveSubtitles: true,
    rate: options.rate || RATE,
    pitch: options.pitch || PITCH,
  });

  await tts.ttsPromise(text, outputPath);
  
  // Read the generated subtitle file (node-edge-tts names it <audiofile>.json)
  const subtitlePath = outputPath + '.json';
  let subtitles = [];
  if (fs.existsSync(subtitlePath)) {
    subtitles = JSON.parse(fs.readFileSync(subtitlePath, 'utf-8'));
  }
  
  return { audioPath: outputPath, subtitlePath, subtitles };
}

async function generateSegmentAudio(script, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  
  const results = [];
  let cumulativeOffset = 0;
  
  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    const audioPath = path.join(outputDir, `segment_${i}.mp3`);
    
    console.log(`  Generating audio for segment ${i}: "${seg.text.slice(0, 50)}..."`);
    
    const result = await generateAudio(seg.text, audioPath, {
      rate: seg.mood === 'excited' ? '+15%' : seg.mood === 'calm' ? '-10%' : '+0%',
    });
    
    // Get audio duration from subtitles
    const lastSub = result.subtitles[result.subtitles.length - 1];
    const segmentDuration = lastSub ? lastSub.end : 0;
    
    results.push({
      index: i,
      audioPath: result.audioPath,
      subtitlePath: result.subtitlePath,
      subtitles: result.subtitles,
      durationMs: segmentDuration,
      offsetMs: cumulativeOffset,
    });
    
    cumulativeOffset += segmentDuration;
  }
  
  // Generate combined subtitle file
  const allSubtitles = [];
  for (const r of results) {
    for (const sub of r.subtitles) {
      allSubtitles.push({
        part: sub.part,
        start: sub.start + r.offsetMs,
        end: sub.end + r.offsetMs,
        segmentIndex: r.index,
      });
    }
  }
  
  const combinedPath = path.join(outputDir, 'captions.json');
  fs.writeFileSync(combinedPath, JSON.stringify(allSubtitles, null, 2));
  
  // Generate SRT file
  const srtPath = path.join(outputDir, 'captions.srt');
  let srtContent = '';
  for (let i = 0; i < allSubtitles.length; i++) {
    const sub = allSubtitles[i];
    const start = formatSrtTime(sub.start);
    const end = formatSrtTime(sub.end);
    srtContent += `${i + 1}\n${start} --> ${end}\n${sub.part}\n\n`;
  }
  fs.writeFileSync(srtPath, srtContent);
  
  // Generate manifest
  const manifest = {
    script: script.title,
    totalDurationMs: cumulativeOffset,
    totalDurationSec: cumulativeOffset / 1000,
    voice: VOICE,
    segments: results.map(r => ({
      index: r.index,
      audioPath: r.audioPath,
      durationMs: r.durationMs,
      offsetMs: r.offsetMs,
    })),
    captionsPath: combinedPath,
    srtPath: srtPath,
  };
  
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  return manifest;
}

function formatSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms2 = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms2).padStart(3, '0')}`;
}

module.exports = { generateAudio, generateSegmentAudio };
