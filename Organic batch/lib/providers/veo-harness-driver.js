/**
 * lib/providers/veo-harness-driver.js
 *
 * Veo Flow driver backed by browser-use/browser-harness — the self-healing LLM
 * browser agent. Survives Flow UI redesigns: when the prompt textarea or
 * Create button moves, the agent re-finds it instead of erroring on a stale
 * Playwright selector (the trap that bit google-veo-browser.js multiple times).
 *
 * Activated by env GOOGLE_FLOW_DRIVER=harness. Default remains "playwright"
 * (google-veo-browser.js) so this is purely additive — turn on when the
 * Playwright path breaks and the immediate fix is worth more than the cold-start
 * cost of the harness.
 *
 * Public API:
 *   generate({ prompt, imagePath, durationSec, kind })
 *     → { ok, path?, provider, cached?, reason?, budgetLeft? }
 *
 * Architecture:
 *   - Spawns `browser-harness` (installed via `uv tool install -e .` from
 *     external/browser-harness/) as a subprocess
 *   - Driven by the free Gemini key (already in .env) at ≤15 req/min
 *   - Saves the result MP4 to .runtime-cache/veo/{sha1}.mp4 (same cache layout
 *     as google-veo-browser.js, so the rest of the pipeline doesn't care which
 *     driver produced it)
 *   - Increments the same monthly budget ledger
 *
 * State of this driver: scaffolded, not yet end-to-end tested. Phase 1B of the
 * warm-coalescing-island plan. The Playwright driver remains the default until
 * this is verified.
 */
'use strict';

require('../env-d-drive-only');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'veo');
const HARNESS_BIN = process.env.BROWSER_HARNESS_BIN || resolveHarnessBin();
const MONTHLY_CAP = Number(process.env.VEO_MONTHLY_CAP || 95);

function resolveHarnessBin() {
  // uv tool install drops the binary in %USERPROFILE%\.local\bin on Windows.
  const candidates = [
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.local', 'bin', 'browser-harness.exe') : null,
    process.env.HOME ? path.join(process.env.HOME, '.local', 'bin', 'browser-harness') : null,
    'browser-harness', // PATH lookup as final fallback
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (c === 'browser-harness' || fs.existsSync(c)) return c; } catch (_) {}
  }
  return 'browser-harness';
}

function ensure(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

// ── Budget ledger (shared with google-veo-browser.js) ────────────────────
function budgetFile() {
  return path.join(ROOT, 'renders', 'analytics', 'veo-budget-' + new Date().toISOString().slice(0, 7) + '.json');
}
function getBudget() {
  try { return JSON.parse(fs.readFileSync(budgetFile(), 'utf8')); } catch (_) { return { used: 0, cap: MONTHLY_CAP }; }
}
function spendBudget(n = 1) {
  ensure(path.dirname(budgetFile()));
  const b = getBudget();
  b.used = (b.used || 0) + n;
  b.cap = MONTHLY_CAP;
  b.updatedAt = new Date().toISOString();
  try { fs.writeFileSync(budgetFile(), JSON.stringify(b, null, 2)); } catch (_) {}
  return b;
}
function budgetLeft() {
  const b = getBudget();
  return Math.max(0, (b.cap || MONTHLY_CAP) - (b.used || 0));
}

/**
 * Build the task spec sent to browser-harness. Keep it explicit and goal-oriented;
 * the LLM agent re-derives selectors per run, so brittle CSS specifics belong
 * in the goal text rather than as constraints.
 */
function buildHarnessTask({ prompt, imagePath, durationSec, kind, outputPath }) {
  const lines = [
    'GOAL: Generate a ' + (kind === 'image' ? 'photorealistic image' : `${durationSec || 8}-second photorealistic video clip`) + ' on labs.google/flow and download it to a local path.',
    '',
    'Steps the agent should accomplish (use whatever current UI exists, even if buttons or selectors changed):',
    '1. Navigate to https://labs.google/fx/tools/flow/. If a New project landing screen is shown, click the New project button to open the editor.',
    '2. Find the prompt input (a contenteditable div with role=textbox, OR a textarea). Type the following prompt EXACTLY:',
    '   ' + JSON.stringify(prompt),
    imagePath && fs.existsSync(imagePath) ? '3. Attach the reference image at ' + imagePath + ' if there is a visible image-upload button or input[type="file"].' : null,
    '4. Click the primary submit/Create/Generate button. Wait for the generated ' + (kind === 'image' ? 'image' : 'video') + ' to appear in the output area (usually 60–240 seconds).',
    '5. Once a new ' + (kind === 'image' ? 'img' : 'video') + ' element with a fresh src URL is rendered, download the asset to ' + outputPath + ' using `fetch` inside the page context and writing the bytes to disk via the harness file helper.',
    '6. Report SUCCESS with the absolute output path. If the page shows an error message, report FAILURE with the visible error text.',
  ].filter(Boolean).join('\n');
  return lines;
}

/**
 * @param {object} o
 *   prompt:     string
 *   imagePath?: string (optional reference still for i2v)
 *   durationSec?: number (default 8)
 *   kind?: 'video' | 'image'  (default 'video')
 */
async function generate(o = {}) {
  const kind = o.kind === 'image' ? 'image' : 'video';
  const provider = kind === 'image' ? 'google-imagen-flow' : 'google-veo-flow';
  const prompt = String(o.prompt || '').trim();
  if (!prompt) return { ok: false, provider, reason: 'no_prompt' };

  ensure(CACHE_DIR);
  const ext = kind === 'image' ? 'png' : 'mp4';
  const cachePath = path.join(CACHE_DIR, provider + '-' + sha1(prompt + '|' + (o.imagePath || '') + '|' + (o.durationSec || 8)) + '.' + ext);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000) {
    return { ok: true, path: cachePath, provider, cached: true };
  }

  if (budgetLeft() <= 0) {
    return { ok: false, provider, reason: 'veo_budget_exhausted', budgetLeft: 0 };
  }

  const task = buildHarnessTask({
    prompt,
    imagePath: o.imagePath,
    durationSec: o.durationSec || 8,
    kind,
    outputPath: cachePath,
  });

  const timeoutMs = Number(process.env.FLOW_HARNESS_TIMEOUT_MS || 600_000);

  return await new Promise((resolve) => {
    const t0 = Date.now();
    const proc = spawn(HARNESS_BIN, ['--task', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BROWSER_HARNESS_MODEL: process.env.BROWSER_HARNESS_MODEL || 'gemini-1.5-flash',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGTERM'); } catch (_) {}
    }, timeoutMs);

    proc.stdin.write(task);
    proc.stdin.end();
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, provider, reason: 'harness_spawn_failed: ' + (err && err.message || err) });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return resolve({ ok: false, provider, reason: 'harness_timeout (' + timeoutMs + 'ms)' });
      }
      if (code !== 0) {
        return resolve({ ok: false, provider, reason: 'harness_exit_' + code + ': ' + stderr.slice(0, 240) });
      }
      // Success requires the file to actually exist + be non-trivial
      if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000) {
        const b = spendBudget(1);
        return resolve({ ok: true, path: cachePath, provider, cached: false, budgetLeft: Math.max(0, b.cap - b.used), latencyMs: Date.now() - t0 });
      }
      return resolve({ ok: false, provider, reason: 'harness_no_output_file: ' + stdout.slice(-240) });
    });
  });
}

module.exports = { generate, budgetLeft, getBudget, MONTHLY_CAP };

if (require.main === module) {
  const prompt = process.argv[2] || 'cinematic test stadium 9:16';
  generate({ prompt, kind: 'video', durationSec: 8 }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
