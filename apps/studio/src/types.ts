export interface Script {
  id: string;
  title: string;
  segments: ScriptSegment[];
  metadata: ScriptMetadata;
}

export interface ScriptSegment {
  speaker: string;
  text: string;
  mood?: string;
  durationEstimate?: number;
  visualCue?: string;
}

export interface ScriptMetadata {
  topic: string;
  targetDuration: number;
  tone: string;
  language: string;
  keywords: string[];
}
