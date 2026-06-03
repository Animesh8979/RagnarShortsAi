/**
 * tools/auto-recover-2026-06-03.js — autonomous batch completion across a FLAPPING network.
 *
 * The ISP connection is intermittently dropping (YouTube/Groq/NVIDIA all fetch-fail in
 * windows). This watcher waits until the connection is STABLE (3 consecutive OK probes),
 * then runs the full batch with auto-upload (gap 0 = no idle sleep that gets nap-killed).
 * Idempotent uploader skips the already-live B1; dedupe avoids repeat clip sources.
 * Retries the whole batch up to 3× if a mid-run drop kills it. $0, D:\ only.
 */
'use strict';
require('../lib/env-d-drive-only');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG = path.join(ROOT, 'renders', 'auto-recover-2026-06-03.log');
function log(m) { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch (_) {} }

async function probe(url, headers) {
  try { const r = await fetch(url, { headers: headers || {}, signal: AbortSignal.timeout(12000) }); return r.status > 0; }
  catch (_) { return false; }
}
async function netStable() {
  // require BOTH an upload target (YouTube) and a provider (Groq) to be reachable
  const yt = await probe('https://www.googleapis.com/youtube/v3/');
  const gq = await probe('https://api.groq.com/openai/v1/models', { Authorization: 'Bearer ' + process.env.GROQ_API_KEY });
  return yt && gq;
}

function runBatch() {
  return new Promise((resolve) => {
    log('network stable → launching ORGANIC-ONLY recovery (clips already live; organic 2, auto-upload, gap 0)');
    const child = spawn(process.execPath, ['lib/daily-fresh-batch.js', '--organic', '2', '--clips', '0', '--auto-upload', '--upload-gap-min', '0'], {
      cwd: ROOT,
      env: { ...process.env, ORGANIC_STORY: '1', L110_WHISPER_LOCAL: '1', L110_MOMENT_SELECTOR: '1', CLIP_HUMOR_TARGETING: '1', RENDER_QA_MIN: '60' },
      stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
    });
    child.on('exit', (code) => { log('batch exited code=' + code); resolve(code); });
    child.on('error', (e) => { log('batch spawn error: ' + e.message); resolve(1); });
  });
}

// keep the machine awake for the WHOLE recovery (root-cause fix for the nap-death
// that killed the 45-min idle upload wait). Killed on exit.
let awake = null;
try { awake = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-File', path.join(ROOT, 'tools', 'keep-awake-exec.ps1')], { stdio: 'ignore' }); log('keep-awake on (no power-nap during recovery)'); } catch (e) { log('keep-awake failed: ' + e.message); }
function finish(code) { try { if (awake) awake.kill(); } catch (_) {} process.exit(code); }

(async () => {
  log('=== auto-recover started; waiting for a STABLE connection ===');
  let stable = 0, waitedSec = 0;
  const MAX_WAIT = 3 * 3600; // 3h
  while (stable < 3 && waitedSec < MAX_WAIT) {
    const ok = await netStable();
    stable = ok ? stable + 1 : 0;
    log(`probe: ${ok ? 'OK' : 'down'}  (stable streak ${stable}/3)`);
    if (stable < 3) { await new Promise((r) => setTimeout(r, 30000)); waitedSec += 30; }
  }
  if (stable < 3) { log('connection never stabilized within 3h — giving up. Re-run when online: node tools/auto-recover-2026-06-03.js'); finish(1); }

  for (let attempt = 1; attempt <= 3; attempt++) {
    log(`batch attempt ${attempt}/3`);
    const code = await runBatch();
    if (code === 0) { log('=== auto-recover COMPLETE (batch exited 0) ==='); finish(0); }
    // if it died mid-run (likely a net drop), wait for net to come back then retry
    log('attempt failed; waiting for connection to re-stabilize before retry…');
    let s = 0, w = 0;
    while (s < 3 && w < 1800) { const ok = await netStable(); s = ok ? s + 1 : 0; if (s < 3) { await new Promise((r) => setTimeout(r, 30000)); w += 30; } }
  }
  log('=== auto-recover exhausted 3 attempts — manual check needed ===');
  finish(1);
})();
