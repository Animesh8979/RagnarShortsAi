import { Script, ScriptSegment, ScriptMetadata } from '@antigravity/types';

export function parseScript(raw: string, fallbackTopic: string): Script {
  const cleaned = extractJson(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse LLM response as JSON: ${(err as Error).message}`);
  }

  const segments: ScriptSegment[] = (parsed.segments || []).map((s: any) => ({
    speaker: String(s.speaker || 'Narrator').trim(),
    text: String(s.text || '').trim(),
    mood: s.mood ? String(s.mood) : undefined,
    durationEstimate: typeof s.durationEstimate === 'number' ? s.durationEstimate : undefined,
    visualCue: s.visualCue ? String(s.visualCue) : undefined,
  }));

  const meta: ScriptMetadata = {
    topic: String(parsed.metadata?.topic || fallbackTopic),
    targetDuration: typeof parsed.metadata?.targetDuration === 'number' ? parsed.metadata.targetDuration : 45,
    tone: String(parsed.metadata?.tone || 'exciting'),
    language: String(parsed.metadata?.language || 'English'),
    keywords: Array.isArray(parsed.metadata?.keywords) ? parsed.metadata.keywords.map(String) : [],
  };

  const script: Script = {
    id: String(parsed.id || `script_${Date.now()}`),
    title: String(parsed.title || 'Untitled Script'),
    segments,
    metadata: meta,
  };

  return script;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    if (lines.length > 1 && lines[0].trim().startsWith('```')) {
      lines.shift();
    }
    if (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) {
      lines.pop();
    }
    return lines.join('\n').trim();
  }
  return trimmed;
}
