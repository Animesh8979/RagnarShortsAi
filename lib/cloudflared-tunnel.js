/**
 * lib/cloudflared-tunnel.js — Phase C
 *
 * Boot a Cloudflare quick tunnel (no card, no account) from the local
 * media server. Returns { url, child, close() }. The `url` looks like
 *   https://random-words-abc123.trycloudflare.com
 * and is what Meta receives as `video_url` instead of catbox/litterbox.
 *
 * Lifecycle: caller is responsible for `await close()` when done — leaks
 * a cloudflared.exe child otherwise.
 *
 * Resilience: the quick-tunnel binary occasionally fails to bind in the
 * first 5s. Retries up to QUICK_TUNNEL_RETRIES times (default 3) with
 * exponential backoff, then surfaces the last error.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CFD_BIN = path.join(ROOT, 'cloudflared.exe');
const QUICK_URL_RE = /https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function startTunnelOnce({ port, logPath }) {
  if (!fs.existsSync(CFD_BIN)) return Promise.reject(new Error(`cloudflared.exe missing at ${CFD_BIN}`));
  // D:\-only constraint: pin cloudflared's per-run log file to a D:\ path
  // so it never writes to %USERPROFILE%\.cloudflared\ or %TEMP%.
  const cfdLogDir = process.env.CLOUDFLARED_CONFIG_DIR || path.join(ROOT, '.runtime-cache', 'cloudflared');
  try { fs.mkdirSync(cfdLogDir, { recursive: true }); } catch (_) {}
  const cfdLogFile = path.join(cfdLogDir, `tunnel-${Date.now()}.log`);
  const args = ['tunnel', '--no-autoupdate', '--logfile', cfdLogFile, '--url', `http://localhost:${port}`];
  return new Promise((resolve, reject) => {
    const child = spawn(CFD_BIN, args, { cwd: ROOT, windowsHide: true });
    const buf = [];
    const onChunk = (b) => {
      const s = b.toString('utf8');
      buf.push(s);
      if (logPath) { try { fs.appendFileSync(logPath, s); } catch (_) {} }
      const m = s.match(QUICK_URL_RE);
      if (m) {
        cleanup();
        resolve({ url: m[0], child });
      }
    };
    const onExitEarly = (code) => {
      cleanup();
      reject(new Error(`cloudflared exited before yielding a URL (code ${code}). Last output: ${buf.join('').slice(-400)}`));
    };
    const onError = (err) => { cleanup(); reject(err); };
    function cleanup() {
      child.stdout.off('data', onChunk);
      child.stderr.off('data', onChunk);
      child.off('exit', onExitEarly);
      child.off('error', onError);
    }
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.once('exit', onExitEarly);
    child.once('error', onError);
    setTimeout(() => { cleanup(); try { child.kill('SIGTERM'); } catch (_) {} reject(new Error('quick tunnel timed out before URL appeared')); }, 30_000);
  });
}

async function startTunnel({ port, retries, retryDelayMs, logPath } = {}) {
  const maxRetries = Number.isFinite(Number(retries)) ? Number(retries) : Number(process.env.QUICK_TUNNEL_RETRIES) || 3;
  const baseDelay = Number(retryDelayMs) || 2000;
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await startTunnelOnce({ port, logPath });
      const close = () => new Promise((resolve) => {
        if (!result.child || result.child.killed) return resolve();
        result.child.once('exit', () => resolve());
        try { result.child.kill('SIGTERM'); } catch (_) {}
        setTimeout(() => { try { result.child.kill('SIGKILL'); } catch (_) {} resolve(); }, 4000);
      });
      console.log(`[cloudflared-tunnel] ready at ${result.url} (attempt ${attempt})`);
      return { url: result.url, child: result.child, close };
    } catch (err) {
      lastError = err;
      console.log(`[cloudflared-tunnel] attempt ${attempt}/${maxRetries} failed: ${err.message.slice(0, 160)}`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, baseDelay * attempt));
    }
  }
  throw lastError || new Error('cloudflared-tunnel: exhausted retries');
}

module.exports = { startTunnel };

if (require.main === module) {
  (async () => {
    const port = Number(process.argv[2] || process.env.LOCAL_MEDIA_SERVER_PORT) || 4733;
    const { url, close } = await startTunnel({ port });
    console.log('Tunnel URL:', url);
    process.on('SIGINT', async () => { await close(); process.exit(0); });
  })().catch((e) => { console.error(e); process.exit(1); });
}
