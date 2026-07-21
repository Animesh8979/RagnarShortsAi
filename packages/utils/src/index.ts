// @antigravity/utils — Shared utilities: logging, file ops, D: path helpers
// Depends only on @antigravity/security for safe execution

import { scrubSecrets } from '@antigravity/security';
import { validateDrivePath } from '@antigravity/config';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import * as path from 'path';

// ============================================================================
// LOGGING
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function shouldLog(level: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(threshold);
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

class Logger {
  private threshold: LogLevel = 'info';

  setLevel(level: LogLevel) {
    this.threshold = level;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (!shouldLog(level, this.threshold)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: scrubSecrets(message),
      meta: meta ? scrubMeta(meta) : undefined,
    };

    const output = JSON.stringify(entry);

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(msg: string, meta?: Record<string, unknown>) { this.log('debug', msg, meta); }
  info(msg: string, meta?: Record<string, unknown>) { this.log('info', msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>) { this.log('warn', msg, meta); }
  error(msg: string, meta?: Record<string, unknown>) { this.log('error', msg, meta); }
}

function scrubMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string') {
      result[key] = scrubSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const logger = new Logger();

// ============================================================================
// FILE OPERATIONS (D: DRIVE ONLY)
// ============================================================================

/**
 * Ensure a directory exists on D: drive. Creates recursively.
 */
export function ensureDir(dirPath: string): string {
  const resolved = validateDrivePath(dirPath);
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

/**
 * Write a file to D: drive. Returns the resolved path.
 */
export function writeFile(filePath: string, data: string | Buffer): string {
  const resolved = validateDrivePath(filePath);
  const dir = path.dirname(resolved);
  ensureDir(dir);
  writeFileSync(resolved, data);
  return resolved;
}

/**
 * Read a file from D: drive. Returns the content as string.
 */
export function readFile(filePath: string): string {
  const resolved = validateDrivePath(filePath);
  return readFileSync(resolved, 'utf-8');
}

/**
 * List files in a directory on D: drive. Returns full paths.
 * Optionally filtered by extension.
 */
export async function listFiles(dirPath: string, ext?: string): Promise<string[]> {
  const resolved = validateDrivePath(dirPath);
  const entries = await readdir(resolved, { withFileTypes: true });
  const files = entries.filter(e => e.isFile()).map(e => path.join(resolved, e.name));
  if (ext) {
    return files.filter(f => f.endsWith(ext));
  }
  return files;
}

/**
 * Get file size in bytes.
 */
export async function getFileSize(filePath: string): Promise<number> {
  const resolved = validateDrivePath(filePath);
  const s = await stat(resolved);
  return s.size;
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoff?: 'linear' | 'exponential';
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = 'exponential' } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const wait = backoff === 'exponential'
        ? delayMs * Math.pow(2, attempt)
        : delayMs * (attempt + 1);
      logger.warn(`Retry ${attempt + 1}/${maxRetries} after ${wait}ms`, { retries: true, attempt });
      await sleep(wait);
    }
  }

  throw new Error('Unreachable');
}

// ============================================================================
// MISC UTILITIES
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a timestamped ID.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Format seconds to mm:ss
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
