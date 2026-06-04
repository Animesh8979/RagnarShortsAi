/**
 * lib/preflight.js — L116 A3: pre-flight provider health gate.
 *
 * A ~5s parallel reachability probe of the providers a batch depends on, run BEFORE
 * committing to a render so we don't discover an outage 6 beats in. Returns
 * {ok, healthy[], degraded[], down[], detail} and appends to
 * renders/analytics/preflight-{date}.jsonl. $0, fast, fail-soft.
 *
 * Classification:
 *   - CRITICAL (must be up to start at all): at least one script-LLM (gemini|groq)
 *     AND youtube-reachable (for uploads). If a critical group is fully down → ok:false
 *     (caller should hand to the resilient watcher to wait-for-stable instead of burning a render).
 *   - DEGRADED-OK (render can proceed degraded): image-gen (nvidia/pollinations) down →
 *     graceful degradation handles it (procedural/no-hero scenes still ship).
 *
 * Reachability != "working" (a host can answer yet the API 500) — but it's a fast,
 * cheap signal that catches the dominant failure (full network/DNS outage). The
 * circuit-breaker + graceful-degradation handle reachable-but-failing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');

const TARGETS = [
  { id: 'gemini', group: 'script_llm', url: 'https://generativelanguage.googleapis.com', critical: true },
  { id: 'groq', group: 'script_llm', url: 'https://api.groq.com', critical: true },
  { id: 'nvidia-flux', group: 'image_gen', url: 'https://integrate.api.nvidia.com', critical: false },
  { id: 'pollinations', group: 'image_gen', url: 'https://image.pollinations.ai', critical: false },
  { id: 'youtube', group: 'upload', url: 'https://www.youtube.com', critical: true },
  { id: 'ig-host', group: 'upload', url: 'https://graph.facebook.com', critical: false },
];

async function probe(url, timeoutMs = 6000) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    return r && Number(r.status) > 0; // any HTTP response (even 4xx) = reachable
  } catch (_) { return false; }
}

/**
 * @returns {Promise<{ok, healthy:string[], degraded:string[], down:string[], detail:object, groups:object}>}
 */
async function preflight(opts = {}) {
  const targets = opts.targets || TARGETS;
  const results = await Promise.all(targets.map(async (t) => ({ ...t, up: await probe(t.url, opts.timeoutMs) })));

  const healthy = results.filter((r) => r.up).map((r) => r.id);
  const down = results.filter((r) => !r.up).map((r) => r.id);

  // group-level health
  const groups = {};
  for (const r of results) {
    groups[r.group] = groups[r.group] || { up: 0, total: 0 };
    groups[r.group].total++;
    if (r.up) groups[r.group].up++;
  }

  // CRITICAL groups must have ≥1 provider up.
  const scriptOk = (groups.script_llm && groups.script_llm.up > 0);
  const uploadOk = (groups.upload && groups.upload.up > 0);
  const imageOk = (groups.image_gen && groups.image_gen.up > 0);
  const ok = scriptOk && uploadOk;

  // degraded = a non-fatal group is impaired (image-gen) but the render can proceed.
  const degraded = [];
  if (!imageOk) degraded.push('image_gen');
  if (groups.upload && groups.upload.up < groups.upload.total) degraded.push('upload-partial');

  const out = {
    ok, healthy, degraded, down, groups,
    detail: { scriptOk, uploadOk, imageOk },
    advice: ok ? (imageOk ? 'proceed' : 'proceed-degraded (image-gen down → graceful degradation)') : 'wait (critical providers down → hand to resilient watcher)',
  };

  try {
    const dir = path.join(ROOT, 'renders', 'analytics');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'preflight-' + new Date().toISOString().slice(0, 10) + '.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), ...out }) + '\n');
  } catch (_) {}

  return out;
}

module.exports = { preflight, probe, TARGETS };

if (require.main === module) {
  require('./env-d-drive-only');
  const t0 = Date.now();
  preflight().then((r) => {
    console.log('preflight (' + ((Date.now() - t0) / 1000).toFixed(1) + 's): ok=' + r.ok + '  advice=' + r.advice);
    console.log('  healthy:', r.healthy.join(', ') || '(none)');
    console.log('  down:   ', r.down.join(', ') || '(none)');
    process.exit(r.ok ? 0 : 1);
  });
}
