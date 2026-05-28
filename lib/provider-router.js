/**
 * lib/provider-router.js — MASTER-REBUILD Phase 1
 *
 * Single source of truth for "which provider should this call go to".
 * Every external API call in the pipeline routes through here so we have:
 *   - One health-aware failover policy
 *   - One audit log of routing decisions (JSONL)
 *   - One place to ban a provider (no per-layer hardcoding)
 *
 * Capability table is the ROUTES constant below. Each capability has a
 * priority-ordered list of provider IDs. route(capability) returns the
 * highest-priority provider that:
 *   - Has its required env keys set
 *   - Is NOT on the global ban list
 *   - Is NOT currently circuit-broken open (via circuit-breaker.js)
 *
 * After every call, the caller reports the outcome:
 *   reportProviderResult(provider, { ok, error, latencyMs })
 * which updates the circuit breaker AND appends a row to the routing log.
 *
 * No layer should hardcode "use NVIDIA FLUX" or "use Pollinations". They
 * call route('hero_image') and trust the table.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cb = require(path.join(__dirname, '..', 'circuit-breaker'));

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'renders', 'analytics');

// ── Capability table (priority order, highest first) ────────────────────
const ROUTES = {
  script_llm:        ['nvidia-nemotron', 'groq-llama-3.3-70b', 'gemini-1.5-flash', 'github-models-gpt4o', 'cerebras', 'together-llama-3.3', 'openrouter-llama'],
  // Phase E: hero_image primary is NVIDIA FLUX → parallax (the live render path).
  hero_image:        ['nvidia-flux.1-dev', 'nvidia-flux.2-klein', 'pollinations-seedream', 'hf-flux-schnell', 'gemini-image'],
  // RealMotion Tier-2: cloud i2v for hero beats. Order chosen for speed:
  //   nvidia-cosmos (fastest, ~40 rpm free) → hf-ltx (best quality) → hf-wan
  //   (1.3B quantized, free queue) → hf-cogvideox (smallest, fastest queue)
  //   → fal-ltx (paid, budget-gated last resort).
  motion_video:      ['nvidia-cosmos', 'hf-ltx-video', 'hf-wan-2.1', 'hf-cogvideox', 'fal-ltx'],
  parallax:          ['local-parallax-generator'],
  tts_english:       ['edge-tts-boundary', 'kokoro-local'],
  tts_hindi:         ['sarvam', 'edge-tts-hindi'],
  captions_organic:  ['edge-tts-boundary'],
  captions_clips:    ['groq-whisper-v3-turbo'],
  stock_video:       ['pexels-video', 'pixabay-video', 'mixkit', 'coverr'],
  trending:          ['rss-reuters', 'rss-hindu', 'rss-aljazeera', 'github-trending', 'hf-trending'],
  fact_check:        ['gemini-1.5-flash', 'groq-llama-3.3-70b', 'nvidia-nemotron'],
  aesthetic_qa:      ['gemini-1.5-flash-vision'],
};

// ── Env-key requirements per provider ───────────────────────────────────
const KEY_REQUIREMENTS = {
  'nvidia-flux.1-dev':         ['NVIDIA_API_KEY'],
  'nvidia-flux.2-klein':       ['NVIDIA_API_KEY'],
  'nvidia-nemotron':           ['NVIDIA_API_KEY'],
  'nvidia-cosmos':             ['NVIDIA_API_KEY'],
  'pollinations-seedream':     [],  // free tier; degraded if no key
  'hf-flux-schnell':           ['HUGGINGFACE_API_KEY'],
  'hf-wan-2.1':                ['HUGGINGFACE_API_KEY'],
  'hf-ltx-video':              ['HUGGINGFACE_API_KEY'],
  'hf-trending':               ['HUGGINGFACE_API_KEY'],
  'gemini-1.5-flash':          ['GEMINI_API_KEY'],
  'gemini-1.5-flash-vision':   ['GEMINI_API_KEY'],
  'gemini-image':              ['GEMINI_API_KEY'],
  'hf-cogvideox':              ['HUGGINGFACE_API_KEY'],
  'groq-llama-3.3-70b':        ['GROQ_API_KEY'],
  'groq-whisper-v3-turbo':     ['GROQ_API_KEY'],
  'github-models-gpt4o':       ['GITHUB_MODELS_TOKEN'],
  'cerebras':                  ['CEREBRAS_API_KEY'],
  'together-llama-3.3':        ['TOGETHER_API_KEY'],
  'openrouter-llama':          ['OPENROUTER_API_KEY'],
  'fal-ltx':                   ['FAL_KEY'],
  'pexels-video':              ['PEXELS_API_KEY'],
  'pixabay-video':             ['PIXABAY_API_KEY'],
  'sarvam':                    ['SARVAM_API_KEY'],
  'edge-tts-boundary':         [],
  'edge-tts-hindi':            [],
  'kokoro-local':              [],
  'local-parallax-generator':  [],
  'rss-reuters':               [],
  'rss-hindu':                 [],
  'rss-aljazeera':             [],
  'mixkit':                    [],
  'coverr':                    [],
  'github-trending':           [],
};

// ── Permanently banned providers (per master-rebuild spec) ──────────────
const BANNED_PROVIDERS = new Set([
  'comfyui-bridge',
  'forge-image-provider',
  'animatediff-api',
  'pexels-image',                         // image API banned; pexels-video OK
  'procedural-3d-text',                   // V5/V6/V7 anti-pattern
  'whisper-organic-captions',             // organics use edge-tts-boundary
]);

function envHas(keys) {
  for (const k of keys) {
    if (!process.env[k]) return false;
  }
  return true;
}

function isProviderUsable(provider) {
  if (BANNED_PROVIDERS.has(provider)) return { ok: false, reason: 'banned' };
  const keys = KEY_REQUIREMENTS[provider];
  if (keys === undefined) return { ok: false, reason: 'unknown_provider' };
  if (keys.length > 0 && !envHas(keys)) return { ok: false, reason: `missing_env: ${keys.join(',')}` };
  if (!cb.canAttempt(provider)) {
    const state = cb.getCircuitState(provider);
    return { ok: false, reason: `circuit_open_until_${new Date(state.blockedUntilMs).toISOString()}` };
  }
  return { ok: true };
}

function ensureLogDir() { try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {} }
function logPath() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return path.join(LOG_DIR, `routing-${ymd}.jsonl`);
}
function appendLog(row) {
  ensureLogDir();
  try {
    fs.appendFileSync(logPath(), JSON.stringify(row) + '\n');
  } catch (_) {}
}

/**
 * Pick the best available provider for a capability.
 *
 * @param {string} capability  one of the ROUTES keys
 * @param {object} [opts]
 * @param {string[]} [opts.exclude]  provider IDs to skip (e.g. one that just failed mid-call)
 * @returns {{ provider: string|null, skipped: Array<{provider:string, reason:string}> }}
 */
function route(capability, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const candidates = ROUTES[capability];
  if (!candidates) {
    const row = { ts: new Date().toISOString(), capability, decision: 'no_route', skipped: [] };
    appendLog(row);
    return { provider: null, skipped: [] };
  }
  const skipped = [];
  for (const p of candidates) {
    if (exclude.has(p)) { skipped.push({ provider: p, reason: 'excluded' }); continue; }
    const u = isProviderUsable(p);
    if (u.ok) {
      const row = { ts: new Date().toISOString(), capability, decision: 'pick', provider: p, skipped };
      appendLog(row);
      return { provider: p, skipped };
    }
    skipped.push({ provider: p, reason: u.reason });
  }
  const row = { ts: new Date().toISOString(), capability, decision: 'exhausted', skipped };
  appendLog(row);
  return { provider: null, skipped };
}

/**
 * Report the outcome of a provider call. Updates the circuit breaker AND
 * logs the result row.
 */
function reportProviderResult(provider, { ok, error, latencyMs, capability } = {}) {
  if (!provider) return;
  if (ok) {
    cb.recordCircuitSuccess(provider);
  } else {
    cb.recordCircuitFailure(provider, error || 'unknown', { threshold: 3, cooldownMs: 10 * 60 * 1000 });
  }
  appendLog({
    ts: new Date().toISOString(),
    capability: capability || null,
    decision: 'result',
    provider,
    ok: !!ok,
    error: ok ? null : String(error && error.message || error || '').slice(0, 240),
    latencyMs: typeof latencyMs === 'number' ? Math.round(latencyMs) : null,
  });
}

/**
 * Run an async function with router-managed failover.
 * Caller provides:
 *   capability: string
 *   tryProvider(provider): async function returning the call result
 *
 * Router picks the first available provider, calls tryProvider, on
 * exception adds it to exclude and routes again, until success or
 * exhaustion. Reports each outcome to the circuit breaker + log.
 */
async function withFailover(capability, tryProvider, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const maxAttempts = Math.max(1, Number(opts.maxAttempts) || 5);
  const attempts = [];
  for (let i = 0; i < maxAttempts; i++) {
    const r = route(capability, { exclude: [...exclude] });
    if (!r.provider) {
      return { ok: false, provider: null, attempts, reason: 'no_provider_available', skipped: r.skipped };
    }
    const t0 = Date.now();
    try {
      const value = await tryProvider(r.provider);
      const latency = Date.now() - t0;
      reportProviderResult(r.provider, { ok: true, latencyMs: latency, capability });
      attempts.push({ provider: r.provider, ok: true, latencyMs: latency });
      return { ok: true, provider: r.provider, value, attempts };
    } catch (err) {
      const latency = Date.now() - t0;
      reportProviderResult(r.provider, { ok: false, error: err, latencyMs: latency, capability });
      attempts.push({ provider: r.provider, ok: false, error: String(err && err.message || err).slice(0, 160), latencyMs: latency });
      exclude.add(r.provider);
    }
  }
  return { ok: false, provider: null, attempts, reason: 'all_attempts_failed' };
}

module.exports = {
  ROUTES,
  KEY_REQUIREMENTS,
  BANNED_PROVIDERS,
  route,
  reportProviderResult,
  withFailover,
  isProviderUsable,
};

if (require.main === module) {
  const cap = process.argv[2] || 'hero_image';
  const r = route(cap);
  console.log(JSON.stringify({ capability: cap, picked: r.provider, skipped: r.skipped }, null, 2));
}
