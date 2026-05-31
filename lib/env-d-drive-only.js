/**
 * lib/env-d-drive-only.js — hard guarantee that every spawned process
 * writes its caches and temp files to D:\, NEVER C:\.
 *
 * User constraint (L99/L107 hard rule):
 *   "$0 recurring cost. D drive only for all project artifacts. No
 *    writes to C: except the Claude Code memory dir (harness-mandated)."
 *
 * This module is `require()`'d at the very top of every long-running
 * entry-point in the pipeline. Two reasons:
 *
 * 1. **dotenv override.** `require('dotenv').config()` does NOT override
 *    process.env values that already exist. On Windows, TEMP and TMP are
 *    pre-set by the shell (often to `C:\Users\<u>\AppData\Local\Temp`),
 *    so the `.env` file's `TEMP=D:\...` is silently ignored. We force
 *    `dotenv.config({ override: true })` to make the .env win.
 *
 * 2. **Tool-specific cache dirs.** Even with TEMP fixed, external CLI
 *    binaries have their own per-tool cache locations:
 *      - cloudflared.exe defaults to `%USERPROFILE%\.cloudflared\`
 *      - yt-dlp.exe defaults to `%USERPROFILE%\AppData\Local\yt-dlp\`
 *      - gh CLI auth/config at `%USERPROFILE%\.config\gh\`
 *      - HuggingFace `transformers` at `%USERPROFILE%\.cache\huggingface\`
 *      - PyTorch model cache at `%USERPROFILE%\.cache\torch\`
 *      - npm cache at `%APPDATA%\npm-cache\`
 *    We set the corresponding env vars (CLOUDFLARED_CONFIG_DIR,
 *    YTDLP_CACHE_DIR / --cache-dir flag wired in callers, GH_CONFIG_DIR,
 *    HF_HOME, TORCH_HOME, NPM_CONFIG_CACHE) to D:\ paths.
 *
 * Side effect on require: creates the D:\ subdirectories if missing.
 *
 * Verifying: after require, `process.env.TEMP` must start with 'D:\' OR
 * '/d/' (git-bash mount). If it doesn't, we throw — better to crash
 * loudly than to silently start polluting C:\.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Step 1: dotenv override. quiet:true silences dotenv v17's promotional "tip:"
// ad spam (it rotates ads for the author's dotenvx/vestauth projects — printed
// strings only, no network calls, verified benign — but they cluttered logs and
// looked like injection). DOTENV_CONFIG_QUIET belt-and-suspenders for child procs.
process.env.DOTENV_CONFIG_QUIET = 'true';
try { require('dotenv').config({ override: true, quiet: true }); } catch (_) {}

// Step 1b: Gemini model default. gemini-1.5-flash was RETIRED by Google → every
// fallback LLM call 404'd, so when Groq hit a 429 the organic lane had no working
// fallback and produced 0 scripts. Verified live: gemini-2.5-flash → 200,
// gemini-1.5-flash → 404. Default the model to 2.5-flash everywhere that reads
// these env vars (script-from-trending, prompt-evolution, platform-fanout,
// hook-optimizer, aesthetic-qa). Override via env if a newer model ships.
process.env.GEMINI_SCRIPT_PRIMARY_MODEL = process.env.GEMINI_SCRIPT_PRIMARY_MODEL || 'gemini-2.5-flash';
process.env.AESTHETIC_QA_MODEL = process.env.AESTHETIC_QA_MODEL || 'gemini-2.5-flash';

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_CACHE = path.join(ROOT, '.runtime-cache');

// Step 2: define the D:\ targets
const D_PATHS = {
  TEMP:                       path.join(RUNTIME_CACHE, 'tmp'),
  TMP:                        path.join(RUNTIME_CACHE, 'tmp'),
  TMPDIR:                     path.join(RUNTIME_CACHE, 'tmp'),
  HF_HOME:                    path.join(RUNTIME_CACHE, 'hf-home'),
  HUGGINGFACE_HUB_CACHE:      path.join(RUNTIME_CACHE, 'hf-home', 'hub'),
  TRANSFORMERS_CACHE:         path.join(RUNTIME_CACHE, 'hf-home', 'transformers'),
  TORCH_HOME:                 path.join(RUNTIME_CACHE, 'torch-cache'),
  NPM_CONFIG_CACHE:           path.join(RUNTIME_CACHE, 'npm-cache'),
  YTDLP_CACHE_DIR:            path.join(RUNTIME_CACHE, 'yt-dlp-cache'),
  // Cloudflared honors TUNNEL_ORIGIN_CERT + CLOUDFLARED_CONFIG_DIR (newer builds)
  CLOUDFLARED_CONFIG_DIR:     path.join(RUNTIME_CACHE, 'cloudflared'),
  // gh CLI honors GH_CONFIG_DIR + GH_DATA_DIR (gh ≥ 2.40)
  GH_CONFIG_DIR:              path.join(RUNTIME_CACHE, 'gh-config'),
  // Remotion-bundled chrome-headless-shell uses TMPDIR for its user-data-dir
  // so the TMP/TEMP set above already covers it.
};

// Step 3: create dirs + apply env
for (const [k, v] of Object.entries(D_PATHS)) {
  try { fs.mkdirSync(v, { recursive: true }); } catch (_) {}
  process.env[k] = v;
}

// Step 4: verify D:\ routing. Crash if anything still points to C:\.
function isOnDDrive(p) {
  if (!p) return false;
  const s = String(p).replace(/\//g, '\\');
  return /^D:\\/i.test(s) || /^[\\/]d[\\/]/i.test(p);
}

const checked = ['TEMP', 'TMP', 'HF_HOME', 'NPM_CONFIG_CACHE'];
for (const k of checked) {
  if (!isOnDDrive(process.env[k])) {
    throw new Error(`[env-d-drive-only] ${k}=${process.env[k]} is NOT on D:\\ — refusing to start. Set it in .env to a D:\\... path.`);
  }
}

// Step 5: helper for spawn callers to inject the env into child processes.
// Most spawn() calls inherit process.env automatically, but some callers
// pass { env: { ... } } explicitly and accidentally strip our vars. Export
// a helper that merges our D-drive vars into a caller's env object.
function injectIntoEnv(envObj = {}) {
  const merged = { ...envObj };
  for (const [k, v] of Object.entries(D_PATHS)) {
    if (!merged[k]) merged[k] = v;
  }
  return merged;
}

// Step 6: helpful debug log (only when DEBUG_DDRIVE=1, to keep batch logs clean)
if (process.env.DEBUG_DDRIVE === '1') {
  console.log('[env-d-drive-only] TEMP=' + process.env.TEMP);
  console.log('[env-d-drive-only] HF_HOME=' + process.env.HF_HOME);
  console.log('[env-d-drive-only] YTDLP_CACHE_DIR=' + process.env.YTDLP_CACHE_DIR);
}

module.exports = { D_PATHS, injectIntoEnv, isOnDDrive };

if (require.main === module) {
  console.log('=== D-drive env routing ===');
  for (const [k, v] of Object.entries(D_PATHS)) {
    const ok = isOnDDrive(v);
    console.log(`${ok ? '✓' : '✗'} ${k}=${v}`);
  }
}
