// @antigravity/config — Typed environment variables with D: drive enforcement
// Zero runtime dependencies except @antigravity/security

import { SecurityError, scrubSecrets } from '@antigravity/security';
import * as path from 'path';

// ============================================================================
// CONSTANTS
// ============================================================================

const ALLOWED_DRIVES = ['D:', 'd:'];
const DEFAULT_RENDER_DIR = 'D:\\antigravity-renders';

// ============================================================================
// ENVIRONMENT SCHEMA
// ============================================================================

interface EnvSchema {
  RENDER_DIR: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  OLLAMA_URL: string;
  OLLAMA_MODEL: string;
  YOUTUBE_API_KEY?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
}

// ============================================================================
// VALIDATED ENV ACCESS
// ============================================================================

class EnvConfig {
  private cache = new Map<string, string | undefined>();

  /** Get raw env var with caching */
  private getRaw(key: string): string | undefined {
    if (this.cache.has(key)) return this.cache.get(key);
    const val = process.env[key];
    this.cache.set(key, val);
    return val;
  }

  /** Require a non-empty string env var */
  require(key: keyof EnvSchema): string {
    const val = this.getRaw(key);
    if (!val) {
      throw new SecurityError(`Missing required env var: ${key}`);
    }
    return val;
  }

  /** Get optional env var */
  optional(key: keyof EnvSchema): string | undefined {
    return this.getRaw(key);
  }

  /** Clear cache (useful for testing) */
  clearCache() {
    this.cache.clear();
  }
}

const env = new EnvConfig();

// ============================================================================
// D: DRIVE ENFORCEMENT
// ============================================================================

/**
 * Validate that a path is on the D: drive.
 * Prevents accidental C: writes that slow the system.
 */
export function validateDrivePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  const drive = resolved.split(path.sep)[0];

  if (!ALLOWED_DRIVES.includes(drive)) {
    throw new SecurityError(
      `Path must be on D: drive. Got: ${drive} for path: ${scrubSecrets(inputPath)}`
    );
  }

  return resolved;
}

/**
 * Build a path under the configured render directory.
 * Always enforces D: drive.
 */
export function getRenderPath(...segments: string[]): string {
  const base = env.optional('RENDER_DIR') || DEFAULT_RENDER_DIR;
  const full = path.join(base, ...segments);
  return validateDrivePath(full);
}

// ============================================================================
// TYPED EXPORT
// ============================================================================

export const config = {
  /** Directory for all video renders (D: only) */
  get renderDir(): string {
    const dir = env.optional('RENDER_DIR') || DEFAULT_RENDER_DIR;
    return validateDrivePath(dir);
  },

  /** Logging threshold */
  get logLevel(): 'debug' | 'info' | 'warn' | 'error' {
    const raw = env.optional('LOG_LEVEL') || 'info';
    if (!['debug', 'info', 'warn', 'error'].includes(raw)) {
      return 'info';
    }
    return raw as 'debug' | 'info' | 'warn' | 'error';
  },

  /** Ollama local LLM endpoint */
  get ollamaUrl(): string {
    return env.optional('OLLAMA_URL') || 'http://localhost:11434';
  },

  /** Default model name */
  get ollamaModel(): string {
    return env.optional('OLLAMA_MODEL') || 'qwen3:1.7b';
  },

  /** YouTube Data API v3 key (optional) */
  get youtubeApiKey(): string | undefined {
    return env.optional('YOUTUBE_API_KEY');
  },

  /** Instagram Graph API token (optional) */
  get instagramToken(): string | undefined {
    return env.optional('INSTAGRAM_ACCESS_TOKEN');
  },
} as const;

// Re-export for convenience
export { EnvConfig, env };
