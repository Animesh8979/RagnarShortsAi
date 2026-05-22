/**
 * lib/local-media-server.js — Phase C
 *
 * Tiny static MP4 server for the Instagram public-URL flow.
 *   * Default port: process.env.LOCAL_MEDIA_SERVER_PORT || 4733
 *   * Roots: renders/ + .runtime-cache/v8-public/v8-hero/ + .runtime-cache/i2v/
 *     + any path passed via `addRoot()`
 *   * GET /{token}/{filename}.mp4 → streams the file (token gate prevents
 *     drive-browsing). `mintShareUrl(absPath)` registers an absolute path
 *     under a fresh sha1 token and returns the relative URL fragment.
 *
 * The companion `lib/cloudflared-tunnel.js` runs `cloudflared.exe tunnel
 * --url http://localhost:{port}` and exposes the server at
 * https://<random>.trycloudflare.com — that URL is then passed to Meta's
 * /media endpoint instead of catbox/litterbox/gofile.
 *
 * Replacing anonymous file-host URLs with a clean tunnel origin lifts the
 * Reels shared-domain suppression flag (Meta downranks anonymous hosts).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const PORT = Number(process.env.LOCAL_MEDIA_SERVER_PORT) || 4733;

// token -> { absPath, mtime, registeredAt, hits }
const REGISTRY = new Map();

function mintShareUrl(absPath, opts = {}) {
  if (!absPath || !fs.existsSync(absPath)) throw new Error(`mintShareUrl: missing file ${absPath}`);
  const st = fs.statSync(absPath);
  const token = crypto.createHash('sha1').update(absPath + ':' + st.mtimeMs).digest('hex').slice(0, 16);
  REGISTRY.set(token, { absPath, mtime: st.mtimeMs, registeredAt: Date.now(), hits: 0, ttlMs: Number(opts.ttlMs) || 6 * 60 * 60 * 1000 });
  const fileName = path.basename(absPath);
  return { token, urlPath: `/m/${token}/${encodeURIComponent(fileName)}`, port: PORT };
}

function lookupToken(token) {
  const entry = REGISTRY.get(token);
  if (!entry) return null;
  if (Date.now() - entry.registeredAt > entry.ttlMs) { REGISTRY.delete(token); return null; }
  if (!fs.existsSync(entry.absPath)) { REGISTRY.delete(token); return null; }
  return entry;
}

function sendError(res, code, msg) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(msg);
}

function streamFile(req, res, entry) {
  const stat = fs.statSync(entry.absPath);
  const total = stat.size;
  const range = req.headers.range;
  res.setHeader('Content-Type', /\.mp4$/i.test(entry.absPath) ? 'video/mp4' : 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  // HEAD probe (Meta's media-ingest does this before the GET): respond with
  // headers only, no body, so Meta sees the file size + range support.
  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.setHeader('Content-Length', total);
    res.end();
    return;
  }

  if (!range) {
    res.statusCode = 200;
    res.setHeader('Content-Length', total);
    fs.createReadStream(entry.absPath).pipe(res);
    return;
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return sendError(res, 416, 'bad range');
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Number(m[2]) : total - 1;
  if (isNaN(start) || isNaN(end) || start > end || end >= total) return sendError(res, 416, 'range out of bounds');
  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(entry.absPath, { start, end }).pipe(res);
}

function createServer({ port } = {}) {
  const usePort = Number(port) || PORT;
  const server = http.createServer((req, res) => {
    try {
      // Routes:
      //   GET /health             — readiness probe
      //   GET /m/{token}/{file}   — token-gated stream
      const url = new URL(req.url, `http://localhost:${usePort}`);
      if (url.pathname === '/health') {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: true, tokens: REGISTRY.size, port: usePort }));
      }
      const m = /^\/m\/([a-f0-9]{8,32})\/[^/]+$/i.exec(url.pathname);
      if (!m) return sendError(res, 404, 'not found');
      const entry = lookupToken(m[1]);
      if (!entry) return sendError(res, 404, 'token expired or unknown');
      entry.hits += 1;
      return streamFile(req, res, entry);
    } catch (e) {
      sendError(res, 500, 'server error: ' + (e && e.message || e));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(usePort, '127.0.0.1', () => {
      console.log(`[local-media-server] listening on http://localhost:${usePort}`);
      resolve({ server, port: usePort });
    });
  });
}

module.exports = { createServer, mintShareUrl, lookupToken, _registry: REGISTRY, PORT };

if (require.main === module) {
  createServer().then(() => console.log('Ready. Mint URLs via require("./lib/local-media-server").mintShareUrl(path).'));
}
