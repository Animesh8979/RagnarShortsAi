const fs = require('fs');
const path = require('path');

const TOPICS = [
  { topic: 'The Dyatlov Pass Incident', tone: 'mysterious', keywords: ['dyatlov', 'pass', 'russia', 'mystery', 'death'] },
  { topic: 'The Voynich Manuscript', tone: 'mysterious', keywords: ['voynich', 'manuscript', 'code', 'medieval', 'unexplained'] },
  { topic: 'The Lost Colony of Roanoke', tone: 'mysterious', keywords: ['roanoke', 'colony', 'disappearance', 'croatoan', 'america'] },
  { topic: 'The Wow! Signal', tone: 'energetic', keywords: ['wow', 'signal', 'alien', 'space', 'seti'] },
  { topic: 'The Antikythera Mechanism', tone: 'serious', keywords: ['antikythera', 'ancient', 'computer', 'greece', 'astronomy'] },
  { topic: 'The Tunguska Event', tone: 'serious', keywords: ['tunguska', 'explosion', 'siberia', 'meteor', 'mystery'] },
  { topic: 'The Dancing Plague of 1518', tone: 'energetic', keywords: ['dancing', 'plague', 'strasbourg', 'mass', 'hysteria'] },
  { topic: 'The Oak Island Money Pit', tone: 'intrigued', keywords: ['oak', 'island', 'treasure', 'pit', 'templar'] },
  { topic: 'The Mary Celeste Ghost Ship', tone: 'mysterious', keywords: ['mary', 'celeste', 'ghost', 'ship', 'abandoned'] },
  { topic: 'The Phaistos Disc', tone: 'calm', keywords: ['phaistos', 'disc', 'crete', 'minoan', 'undeciphered'] },
];

const HOOKS = [
  'What if I told you the answer was there all along?',
  'This changed everything we thought we knew.',
  'In 60 seconds, your jaw will drop.',
  'No one can explain this. Until now.',
  'A discovery that defies all logic.',
  'They tried to hide this from you.',
  'The truth is stranger than fiction.',
  'You have never heard this story.',
  'What happened next will shock you.',
  'This mystery has haunted experts for centuries.',
];

const MID_SEGMENTS = [
  ['Here is what we know.', 'But here is what does not add up.', 'And that is where the real mystery begins.'],
  ['Scientists were baffled.', 'Every explanation fell short.', 'Then one clue changed everything.'],
  ['The evidence was clear.', 'But the conclusion was impossible.', 'And yet, there it was.'],
  ['Experts agreed on one thing.', 'But they could not agree on anything else.', 'The debate still rages today.'],
  ['At first, it seemed simple.', 'But the deeper they dug, the stranger it got.', 'And what they found next was unbelievable.'],
];

const CTAS = [
  'Follow for more mysteries that will blow your mind.',
  'Like and share if this gave you chills.',
  'Drop a comment with your theory.',
  'Subscribe for daily history shocks.',
  'Tag someone who needs to see this.',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateScript(topicData, index) {
  const { topic, tone, keywords } = topicData;
  const hook = pick(HOOKS);
  const mids = pick(MID_SEGMENTS);
  const cta = pick(CTAS);

  const title = `The ${topic} — Unsolved`;

  const segments = [
    {
      speaker: 'narrator',
      text: hook,
      mood: 'excited',
      durationEstimate: 3,
      visualCue: `Dramatic text overlay: ${topic} with dark background`,
    },
    {
      speaker: 'narrator',
      text: mids[0],
      mood: 'intrigued',
      durationEstimate: 10,
      visualCue: `Archive footage or artistic rendering related to ${topic}`,
    },
    {
      speaker: 'narrator',
      text: mids[1],
      mood: 'serious',
      durationEstimate: 12,
      visualCue: `Split screen: contrasting theories about ${topic}`,
    },
    {
      speaker: 'narrator',
      text: mids[2],
      mood: tone,
      durationEstimate: 12,
      visualCue: `Zoom in on key evidence or artifact from ${topic}`,
    },
    {
      speaker: 'narrator',
      text: cta,
      mood: 'energetic',
      durationEstimate: 5,
      visualCue: `End screen: Subscribe + Like with channel branding`,
    },
  ];

  return {
    id: `script_template_${Date.now()}_${index}`,
    title,
    segments,
    metadata: {
      topic,
      targetDuration: 45,
      tone,
      language: 'en',
      keywords,
    },
  };
}

function main() {
  const outputDir = path.join(__dirname, '..', '..', '..', 'reports', `script-batch-${new Date().toISOString().split('T')[0]}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const scripts = TOPICS.map((t, i) => generateScript(t, i));

  for (const script of scripts) {
    fs.writeFileSync(path.join(outputDir, `${script.id}.json`), JSON.stringify(script, null, 2));
  }

  fs.writeFileSync(path.join(outputDir, 'batch.json'), JSON.stringify({
    topic: 'Historical Mysteries',
    count: scripts.length,
    generatedAt: new Date().toISOString(),
    note: 'Template-generated scripts. Replace with Ollama generation once auth is configured.',
    scripts,
  }, null, 2));

  console.log(`✅ Generated ${scripts.length} template scripts in ${outputDir}`);
  console.log();
  scripts.forEach((s, i) => {
    console.log(`${i + 1}. ${s.title} [${s.metadata.tone}, ${s.metadata.targetDuration}s, ${s.segments.length} segments]`);
  });
}

main();