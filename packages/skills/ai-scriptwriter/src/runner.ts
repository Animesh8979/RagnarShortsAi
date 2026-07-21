import * as fs from 'fs';
import * as path from 'path';
import { ScriptGenerator } from './generator.js';

const MODEL = process.env.OLLAMA_MODEL || 'glm-5.2:cloud';
const BASE_URL = process.env.OLLAMA_BASE_URL;
const TOPIC = process.env.SCRIPT_TOPIC || 'Fascinating historical mysteries that changed the world';
const COUNT = parseInt(process.env.SCRIPT_COUNT || '10', 10);

function getWorkspaceRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

async function main() {
  const workspaceRoot = getWorkspaceRoot();
  const batchDir = path.join(workspaceRoot, 'reports', `script-batch-${new Date().toISOString().split('T')[0]}`);

  console.log('🚀 GODMODEMAX Script Generator');
  console.log('==============================');
  console.log(`Topic: ${TOPIC}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Count: ${COUNT}`);
  console.log(`Output: ${batchDir}`);
  console.log();

  fs.mkdirSync(batchDir, { recursive: true });

  const generator = new ScriptGenerator(MODEL, BASE_URL);

  try {
    const scripts = await generator.generate(TOPIC, COUNT);

    for (const script of scripts) {
      fs.writeFileSync(path.join(batchDir, `${script.id}.json`), JSON.stringify(script, null, 2));
    }

    fs.writeFileSync(
      path.join(batchDir, 'batch.json'),
      JSON.stringify({
        topic: TOPIC,
        count: scripts.length,
        generatedAt: new Date().toISOString(),
        scripts,
      }, null, 2)
    );

    console.log(`✅ Generated ${scripts.length} scripts in ${batchDir}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Generation failed:', err);
    process.exit(1);
  }
}

main();
