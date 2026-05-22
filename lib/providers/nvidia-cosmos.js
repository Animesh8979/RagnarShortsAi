/**
 * lib/providers/nvidia-cosmos.js — RealMotion Tier-2 i2v
 *
 * NVIDIA Cosmos image-to-video via NIM. Free tier, ~40 rpm. Takes a FLUX
 * still + a motion prompt, returns 3-4s of real content motion (trucks
 * actually moving, dust drifting, sun shifting position).
 *
 * Endpoint: POST https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-video2world
 *   body: { image: "data:image/png;base64,...", prompt: "...", duration_seconds: 4 }
 *   auth: Authorization: Bearer ${NVIDIA_API_KEY}
 *   response: { artifacts: [{ video_base64, finishReason }] } OR { mp4_url }
 *
 * Cache: .runtime-cache/i2v/cosmos-<sha1>.mp4
 *
 * Per spec: route through provider-router capability 'motion_video'. Caller
 * doesn't call us directly — they go through `withFailover('motion_video', ...)`.
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'i2v');
const ENDPOINT = process.env.NVIDIA_COSMOS_ENDPOINT
  || 'https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-video2world';
const TIMEOUT_MS = 5 * 60 * 1000;

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 20); }

async function generate({ imagePath, prompt, durationSec }) {
  if (!process.env.NVIDIA_API_KEY) return { ok: false, reason: 'missing_NVIDIA_API_KEY' };
  if (!imagePath || !fs.existsSync(imagePath)) return { ok: false, reason: 'image_missing' };
  const dur = Math.max(2, Math.min(6, Number(durationSec) || 4));

  ensureDir(CACHE_DIR);
  const key = sha1(`${imagePath}|${prompt}|${dur}|cosmos`);
  const outPath = path.join(CACHE_DIR, `cosmos-${key}.mp4`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 200_000) {
    return { ok: true, path: outPath, provider: 'nvidia-cosmos', cached: true };
  }

  const imageBuf = fs.readFileSync(imagePath);
  const dataUri = `data:image/png;base64,${imageBuf.toString('base64')}`;
  const body = {
    image: dataUri,
    prompt: String(prompt || 'slow cinematic camera move; subtle realistic motion; no distortion'),
    duration_seconds: dur,
    seed: Math.floor(Math.random() * 0x7fffffff),
  };

  const t0 = Date.now();
  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: `fetch_failed: ${e && e.message || e}`.slice(0, 240), provider: 'nvidia-cosmos' };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, reason: `http_${resp.status}: ${text.slice(0, 160)}`, provider: 'nvidia-cosmos' };
  }
  let json;
  try { json = await resp.json(); }
  catch (e) { return { ok: false, reason: 'invalid_json', provider: 'nvidia-cosmos' }; }

  // Two response shapes are common across NIM video endpoints:
  //   { artifacts: [{ video_base64, finishReason }] }
  //   { mp4_url } or { video_url }
  let videoBuf = null;
  if (Array.isArray(json.artifacts) && json.artifacts[0]) {
    const a = json.artifacts[0];
    if (a.video_base64) videoBuf = Buffer.from(a.video_base64, 'base64');
    else if (a.mp4_base64) videoBuf = Buffer.from(a.mp4_base64, 'base64');
  } else if (json.mp4_url || json.video_url) {
    const url = json.mp4_url || json.video_url;
    const dl = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!dl.ok) return { ok: false, reason: `download_http_${dl.status}`, provider: 'nvidia-cosmos' };
    videoBuf = Buffer.from(await dl.arrayBuffer());
  }
  if (!videoBuf || videoBuf.length < 100_000) {
    return { ok: false, reason: 'empty_video_response', provider: 'nvidia-cosmos' };
  }
  fs.writeFileSync(outPath, videoBuf);
  return { ok: true, path: outPath, provider: 'nvidia-cosmos', latencyMs: Date.now() - t0, cached: false };
}

module.exports = { generate };

if (require.main === module) {
  const img = process.argv[2];
  const prompt = process.argv[3] || 'slow cinematic dolly forward; subtle realistic motion';
  const dur = Number(process.argv[4]) || 4;
  if (!img) { console.error('Usage: node lib/providers/nvidia-cosmos.js <image.png> [prompt] [durationSec]'); process.exit(2); }
  generate({ imagePath: path.resolve(img), prompt, durationSec: dur }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
