/**
 * lib/cloudflared-tunnel-singleton.js — Phase C
 *
 * Per-Node-process singleton wrapping local-media-server + cloudflared.
 * First call: boots both, returns { url, port }. Subsequent calls reuse.
 * `shutdown()` tears down both. The singleton self-cleans on process exit.
 */
'use strict';

const path = require('path');

const localServer = require('./local-media-server');
const tunnel = require('./cloudflared-tunnel');

let state = null;   // { url, port, server, tunnelHandle, shuttingDown }
let bootPromise = null;

async function ensureRunning() {
  if (state && state.url) return { url: state.url, port: state.port };
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const port = Number(process.env.LOCAL_MEDIA_SERVER_PORT) || 4733;
    const { server } = await localServer.createServer({ port });
    let tunnelHandle = null;
    try {
      tunnelHandle = await tunnel.startTunnel({ port });
    } catch (err) {
      try { server.close(); } catch (_) {}
      throw err;
    }
    state = { url: tunnelHandle.url, port, server, tunnelHandle, shuttingDown: false };

    const cleanup = () => { if (state && !state.shuttingDown) shutdown().catch(() => {}); };
    process.once('exit', cleanup);
    process.once('SIGINT', () => { cleanup(); process.exit(130); });
    process.once('SIGTERM', () => { cleanup(); process.exit(143); });

    return { url: state.url, port: state.port };
  })().catch((err) => { bootPromise = null; throw err; });

  return bootPromise;
}

async function shutdown() {
  if (!state) return;
  state.shuttingDown = true;
  const snap = state;
  state = null;
  bootPromise = null;
  try { if (snap.tunnelHandle && snap.tunnelHandle.close) await snap.tunnelHandle.close(); } catch (_) {}
  try { if (snap.server && snap.server.close) await new Promise((r) => snap.server.close(() => r())); } catch (_) {}
}

module.exports = { ensureRunning, shutdown, _state: () => state };
