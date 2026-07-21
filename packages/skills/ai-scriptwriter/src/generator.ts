import { OllamaClient } from './ollama.js';
import { Script } from './types.js';
import { SYSTEM_PROMPT, buildScriptPrompt } from './prompts.js';
import { config } from '@antigravity/config';
import { logger } from '@antigravity/utils';
import * as fs from 'fs';
import * as path from 'path';

export class ScriptGenerator {
  private client: OllamaClient;

  constructor(private model: string, baseUrl?: string) {
    this.client = new OllamaClient(baseUrl);
  }

  private parseJsonFromResponse(text: string): unknown {
    let cleaned = text
      .replace(/^```json\s*/, '')
      .replace(/^```/, '')
      .replace(/```\s*$/, '')
      .trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in response');
    }
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    return JSON.parse(cleaned);
  }

  private validateScripts(data: unknown): Script[] {
    if (!data || typeof data !== 'object') throw new Error('Invalid response: not an object');
    const maybe = (data as Record<string, unknown>).scripts;
    if (!Array.isArray(maybe)) {
      throw new Error('Invalid response: scripts array missing');
    }
    return maybe.map((s: any, i: number) => {
      if (!s.segments || !Array.isArray(s.segments)) {
        throw new Error(`Script ${i}: segments array missing`);
      }
      return {
        id: `script_${Date.now()}_${i}`,
        title: s.title ?? 'Untitled',
        segments: s.segments,
        metadata: {
          topic: s.metadata?.topic ?? 'unknown',
          targetDuration: s.metadata?.targetDuration ?? 45,
          tone: s.metadata?.tone ?? 'energetic',
          language: s.metadata?.language ?? 'en',
          keywords: s.metadata?.keywords ?? [],
        },
      } as Script;
    });
  }

  async generate(topic: string, count: number = 10): Promise<Script[]> {
    const prompt = buildScriptPrompt(topic, count);
    const response = await this.client.chat({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.9,
    });

    const parsed = this.parseJsonFromResponse(response);
    return this.validateScripts(parsed);
  }
}

export async function generateScripts(topic: string, count: number = 10): Promise<Script[]> {
  const model = config.ollamaModel;
  const url = config.ollamaUrl;
  const generator = new ScriptGenerator(model, url);
  return generator.generate(topic, count);
}

export function saveScripts(scripts: Script[]): string[] {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dirName = `script-batch-${dateStr}`;
  const targetDir = path.join('D:\\anitgravity work\\reports', dirName);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const paths: string[] = [];
  for (const script of scripts) {
    const filename = `script_${script.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`;
    const fullPath = path.join(targetDir, filename);
    fs.writeFileSync(fullPath, JSON.stringify(script, null, 2));
    paths.push(fullPath);
  }

  logger.info(`Saved ${scripts.length} scripts to ${targetDir}`);
  return paths;
}
