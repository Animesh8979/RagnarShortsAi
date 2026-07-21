// @antigravity/types — Shared TypeScript interfaces for the entire monorepo
// NO RUNTIME CODE — types only. Keep this file dependency-free.

// ============================================================================
// CORE ENTITY TYPES
// ============================================================================

/** Supported video platforms */
export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'twitter';

/** Character display mode */
export type CharacterMode = 'photo' | '2d' | 'hybrid';

/** Video template identifiers */
export type VideoTemplate =
  | 'TrendingNews'
  | 'StoryDriven'
  | 'CartoonShort'
  | 'AnchorReport';

/** Pipeline stage status */
export type StageStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying';

/** Pipeline run status */
export type RunStatus =
  | 'created'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Pipeline phase identifier */
export type PhaseName =
  | 'script_generation'
  | 'script_approval'
  | 'voice_generation'
  | 'caption_generation'
  | 'visual_planning'
  | 'asset_preparation'
  | 'rendering'
  | 'post_production'
  | 'quality_check'
  | 'distribution_handoff';

// ============================================================================
// PIPELINE RUN & PHASE
// ============================================================================

/** A full pipeline run — tracks one video from script to distribution */
export interface PipelineRun {
  id: string;
  status: RunStatus;
  phases: PipelinePhase[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  artifacts: Artifact[];
  metadata?: Record<string, unknown>;
}

/** A single phase within a pipeline run */
export interface PipelinePhase {
  name: PhaseName;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount?: number;
  output?: Record<string, unknown>;
}

/** A generated artifact (file) produced by a pipeline phase */
export interface Artifact {
  path: string;
  type: 'script' | 'audio' | 'captions' | 'video' | 'image' | 'report' | 'other';
  phase: PhaseName;
  size?: number;
  createdAt: string;
}

// ============================================================================
// VIDEO & RENDER
// ============================================================================

export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  durationInSeconds: number;
  backgroundColor: string;
}

export interface RenderJob {
  id: string;
  template: VideoTemplate;
  status: StageStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  outputPath?: string;
  error?: string;
}

export interface VideoSegment {
  start: number; // seconds
  end: number;
  type: 'intro' | 'hook' | 'body' | 'climax' | 'outro';
  text?: string;
}

// ============================================================================
// CHARACTER & CAPTION
// ============================================================================

export interface Character {
  id: string;
  name: string;
  mode: CharacterMode;
  src?: string; // URL or local path
  lottieFile?: string;
  animations?: string[];
}

export interface Caption {
  text: string;
  startTime: number;
  endTime: number;
  style?: CaptionStyle;
}

export interface CaptionStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  position?: 'top' | 'center' | 'bottom';
}

/** Word-level caption with precise timing (milliseconds) */
export interface CaptionWord {
  part: string;
  start: number;  // ms
  end: number;    // ms
  segmentIndex: number;
}

/** Audio segment manifest for a rendered voiceover */
export interface AudioManifest {
  totalDurationMs: number;
  segments: AudioSegment[];
}

/** A single audio segment file */
export interface AudioSegment {
  index: number;
  durationMs: number;
  offsetMs: number;
  filePath?: string;
}

// ============================================================================
// SCRIPT & CONTENT
// ============================================================================

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

/** A batch of generated scripts awaiting human review */
export interface ScriptBatch {
  id: string;
  topic: string;
  scripts: Script[];
  createdAt: string;
  status: 'pending_review' | 'approved' | 'rejected';
}

/** Human approval decision */
export interface Approval {
  scriptId: string;
  approved: boolean;
  reviewer?: string;
  comment?: string;
  timestamp: string;
}

/** Input for a render request — ties script, captions, and audio together */
export interface RenderRequest {
  pipelineRunId: string;
  script: Script;
  captions: CaptionWord[];
  audioManifest: AudioManifest;
  outputFileName: string;
  settings?: RenderSettings;
}

export interface RenderSettings {
  fps?: number;
  quality?: 'draft' | 'production';
  outputDir?: string;
}

// ============================================================================
// UPLOAD & ANALYTICS
// ============================================================================

export interface UploadJob {
  id: string;
  platform: Platform;
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  status: StageStatus;
  scheduledAt?: Date;
  uploadedAt?: Date;
}

export interface AnalyticsMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  revenue?: number;
  cpm?: number;
}

export interface ChannelAnalytics {
  platform: Platform;
  channelId: string;
  metrics: AnalyticsMetrics;
  lastUpdated: Date;
}

// ============================================================================
// AI SERVICE INTERFACES
// ============================================================================

/** Configuration for an AI provider */
export interface AiProviderConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'google';
  model: string;
  baseUrl?: string;
  apiKeyEnvVar?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/** A request to generate script content */
export interface ScriptGenerationRequest {
  topic: string;
  tone?: string;
  targetDuration?: number;
  language?: string;
  count?: number;
  provider?: AiProviderConfig;
}

/** A structured response from an AI provider */
export interface AiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  raw?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
}

// ============================================================================
// MEDIA SERVICE INTERFACES
// ============================================================================

/** Result of a media operation (e.g. FFmpeg run) */
export interface MediaResult {
  success: boolean;
  outputPath?: string;
  durationMs?: number;
  fileSize?: number;
  error?: string;
  stdout?: string;
  stderr?: string;
}

/** Probe information for a media file */
export interface MediaProbe {
  durationMs: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  fps?: number;
  fileSize: number;
}

/** QA report for a rendered video */
export interface QaReport {
  pipelineRunId: string;
  passed: boolean;
  checks: QaCheck[];
  summary: string;
  timestamp: string;
}

export interface QaCheck {
  name: string;
  passed: boolean;
  details?: string;
  severity?: 'info' | 'warning' | 'error';
}
