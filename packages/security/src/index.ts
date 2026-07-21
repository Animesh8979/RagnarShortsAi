// src/index.ts - @antigravity/security
// SECURITY-FIRST: Safe command execution, input validation, secret scrubbing

import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';

// ============================================================================
// SAFE COMMAND EXECUTION (Prevents Command Injection)
// ============================================================================

export interface SafeExecOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  windowsHide?: boolean;
}

export interface SafeExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * SAFE command execution using spawn with array args only.
 * NEVER use string interpolation for commands - this prevents shell injection.
 * 
 * @param command - The executable path (validated)
 * @param args - Array of arguments (each validated)
 * @param options - Execution options
 * @returns Promise with stdout, stderr, exitCode
 * 
 * @example
 * const result = await safeExec('ffmpeg', ['-i', inputPath, outputPath]);
 */
export function safeExec(
  command: string,
  args: string[] = [],
  options: SafeExecOptions = {}
): Promise<SafeExecResult> {
  return new Promise((resolve, reject) => {
    // Validate command is a real executable (no shell metacharacters)
    if (!isValidExecutable(command)) {
      return reject(new SecurityError(
        `Invalid executable: ${command}. Command injection attempt detected.`
      ));
    }

    // Validate all args are safe (no shell metacharacters)
    for (const arg of args) {
      if (!isSafeArgument(arg)) {
        return reject(new SecurityError(
          `Unsafe argument detected: ${arg}. Shell metacharacters not allowed.`
        ));
      }
    }

    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      env: options.env,
      windowsHide: options.windowsHide ?? true,
      timeout: options.timeout,
      // CRITICAL: Do NOT use shell: true
      shell: false,
    };

    const child = spawn(command, args, spawnOptions);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });

    child.on('error', (err) => {
      reject(new SecurityError(`Failed to spawn ${command}: ${err.message}`));
    });
  });
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

// Shell metacharacters that enable command injection WHEN a shell is used.
// safeExec uses shell:false (spawn with no shell), so backslash (Windows path
// separator) and glob chars (?, *) are NOT interpreted and are safe to pass.
// We block the chars that would enable injection if the spawn surface ever
// changed, plus newline/carriage-return (which can break out of an arg).
const SHELL_METACHARACTERS = /[`;|&$(){}[\]<>!#\r\n]/;
export const PATH_TRAVERSAL = /\.\.[\\/]/;

/**
 * Check if a string contains shell metacharacters that could enable injection.
 */
export function containsShellMetacharacters(input: string): boolean {
  return SHELL_METACHARACTERS.test(input);
}

/**
 * Validate an executable path is safe.
 */
export function isValidExecutable(command: string): boolean {
  if (!command || typeof command !== 'string') return false;
  if (containsShellMetacharacters(command)) return false;
  // Must be an absolute path or known command
  if (!path.isAbsolute(command) && !/^[a-zA-Z0-9_-]+$/.test(command)) return false;
  return true;
}

/**
 * Validate a command argument is safe.
 */
export function isSafeArgument(arg: string): boolean {
  if (!arg || typeof arg !== 'string') return false;
  return !containsShellMetacharacters(arg);
}

/**
 * Validate a file path to prevent directory traversal attacks.
 * The path must resolve within the allowed base directory.
 */
export function validatePath(inputPath: string, allowedBaseDir: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new SecurityError('Path must be a non-empty string');
  }

  if (containsShellMetacharacters(inputPath)) {
    throw new SecurityError('Path contains shell metacharacters');
  }

  const resolvedPath = path.resolve(allowedBaseDir, inputPath);
  const resolvedBase = path.resolve(allowedBaseDir);

  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new SecurityError(
      `Path traversal attempt: ${inputPath} resolves outside ${allowedBaseDir}`
    );
  }

  return resolvedPath;
}

// ============================================================================
// SECRET SCRUBBING
// ============================================================================

// Patterns that match common secret formats
const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{48,}/g,                          // OpenAI/Anthropic keys
  /AIza[0-9A-Za-z_-]{35}/g,                       // Google API keys
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,                 // GitHub tokens
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*/g,       // JWT tokens
  /Bearer\s+[a-zA-Z0-9_\-\.]+/g,                  // Bearer tokens
  /[a-zA-Z0-9]{20,}\.apps\.googleusercontent\.com/g, // OAuth client IDs
  /GOCSPX-[a-zA-Z0-9_-]+/g,                       // Google client secrets
  /nvapi-[a-zA-Z0-9_-]+/g,                        // NVIDIA API keys
  /[0-9a-f]{32}/g,                                // Generic 32-char hex (API keys)
  /[A-Za-z0-9]{20,}@[A-Za-z0-9]+/g,               // Email-like patterns with long local
];

/**
 * Scrub secrets from text (e.g., logs, error messages).
 * Replaces matched patterns with `[REDACTED]`.
 */
export function scrubSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  let scrubbed = text;
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}

// ============================================================================
// URL VALIDATION (Prevents SSRF)
// ============================================================================

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTS = new Set([  
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

/**
 * Parse and validate a URL to prevent SSRF attacks.
 */
export function validateUrl(url: string): URL {
  if (!url || typeof url !== 'string') {
    throw new SecurityError('URL must be a non-empty string');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SecurityError(`Invalid URL: ${url}`);
  }

  // Validate protocol
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SecurityError(`URL protocol not allowed: ${parsed.protocol}`);
  }

  // Block private/internal hosts
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new SecurityError(`Access to internal host blocked: ${hostname}`);
  }

  // Block private IP ranges
  if (isPrivateIp(hostname)) {
    throw new SecurityError(`Access to private IP blocked: ${hostname}`);
  }

  return parsed;
}

function isPrivateIp(hostname: string): boolean {
  // Check common private IP patterns
  const privatePatterns = [
    /^10\./,                             // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,   // 172.16.0.0/12
    /^192\.168\./,                       // 192.168.0.0/16
    /^169\.254\./,                       // Link-local
  ];
  return privatePatterns.some(p => p.test(hostname));
}

// ============================================================================
// CUSTOM SECURITY ERROR
// ============================================================================

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ============================================================================
// SAFE ENVIRONMENT VARIABLE ACCESS
// ============================================================================

/**
 * Safely read an environment variable. Throws if missing (no silent failures).  
 * Scrub the value from any logged errors to prevent secret exposure.  
 */
export function requireEnv(varName: string): string {
  const value = process.env[varName];
  if (!value) {
    throw new SecurityError(`Missing required environment variable: ${varName}`);
  }
  return value;
}

/**
 * Safely read an optional environment variable. Returns undefined if not set.  
 */
export function getEnv(varName: string): string | undefined {
  return process.env[varName];
}

/**
 * Validate that an environment variable matches an expected pattern.  
 */
export function validateEnv(varName: string, pattern: RegExp): string {
  const value = requireEnv(varName);
  if (!pattern.test(value)) {
    throw new SecurityError(
      `Environment variable ${varName} does not match expected pattern`
    );
  }
  return value;
}
