const fs = require('fs');
const path = require('path');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'glm-5.2:cloud';
const TOPIC = process.env.SCRIPT_TOPIC || 'Fascinating historical mysteries that changed the world';
const COUNT = parseInt(process.env.SCRIPT_COUNT || '10', 10);
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '77f28fbd2b114528970800f28f01ec70.R5PjmQUa1NTz6R8yBpJWhKuZ';

const OUTPUT_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'reports',
  `script-batch-${new Date().toISOString().split('T')[0]}`
);

async function ollamaChat(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OLLAMA_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are an elite short-form video scriptwriter. Create viral, attention-grabbing scripts for short-form video (30-60 seconds).' },
        { role: 'user', content: prompt }
      ],
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.message?.content ?? '';
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('No JSON found in response');
  }
}

async function main() {
  console.log('🦙 GODMODEMAX Bootstrap Script Generator');
  console.log('========================================');
  console.log(`Model: ${MODEL}`);
  console.log(`Topic: ${TOPIC}`);
  console.log(`Count: ${COUNT}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log();

  const prompt = `Generate ${COUNT} unique video scripts about: ${TOPIC}

Each script is 30-60 seconds when read aloud (approximately 75-150 words).
Format your response as a JSON object with a single key "scripts" containing an array:
{
  "scripts": [
    {
      "title": "Viral, click-worthy title (max 8 words)",
      "segments": [
        {
          "speaker": "narrator",
          "text": "Text to be spoken aloud for this segment",
          "mood": "excited|calm|serious|mysterious",
          "durationEstimate": 3,
          "visualCue": "What appears on screen for this segment"
        }
      ],
      "metadata": {
        "topic": "Subject of the script",
        "targetDuration": 45,
        "tone": "energetic|calm|serious|mysterious",
        "language": "en",
        "keywords": ["keyword1", "keyword2", "keyword3"]
      }
    }
  ]
}

Requirements:
- Strong HOOK in the first segment (stop-the-scroll quality)
- Each script must tell a complete mini-story with a beginning, middle, and end
- Total durationEstimate should add up to approximately 45 seconds
- Use natural, conversational language optimized for text-to-speech

Respond ONLY with valid JSON. No markdown, no explanation, no preamble.`;

  console.log('⏳ Generating scripts...');
  const content = await ollamaChat(prompt);

  let data;
  try {
    data = extractJson(content);
  } catch (err) {
    console.error('⚠️ Failed to parse response. Raw text:');
    console.error(content);
    throw err;
  }

  if (!data.scripts || !Array.isArray(data.scripts)) {
    throw new Error('Invalid response: missing scripts array');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const scripts = data.scripts.map((s, i) => ({
    ...s,
    id: `script_${Date.now()}_${i}`,
  }));

  for (const script of scripts) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${script.id}.json`), JSON.stringify(script, null, 2));
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'batch.json'), JSON.stringify({
    topic: TOPIC,
    count: scripts.length,
    generatedAt: new Date().toISOString(),
    scripts,
  }, null, 2));

  console.log(`✅ Generated ${scripts.length} scripts in ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('❌ Generation failed:', err.message);
  process.exit(1);
});
