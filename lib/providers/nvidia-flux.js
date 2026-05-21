/**
 * lib/providers/nvidia-flux.js — NVIDIA NIM FLUX.1-dev image provider
 *
 * Endpoint: https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev
 * Auth:     Authorization: Bearer $NVIDIA_API_KEY
 * Output:   1 PNG (base64) per call. Resolution: must be one of NIM's allowed
 *           sizes (768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344).
 *           We pick 832×1344 for ~9:16 portrait and upscale to 1080×1920 via
 *           ffmpeg if the caller needs it.
 *
 * Why this is the primary hero_image provider:
 *   - 30-step FLUX.1-dev produces editorial-photography quality
 *   - Free on NIM tier as of 2026-05-21 (no per-image cost reported)
 *   - Photorealistic motivated lighting + atmospheric haze + shallow DoF
 *     out of the box from a well-crafted prompt
 *
 * Cache: .runtime-cache/nvidia-flux/<sha1(prompt+size+seed)>.png
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'nvidia-flux');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const TIMEOUT_MS = 180_000;

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

// Allowed widths/heights per NVIDIA NIM
const ALLOWED_DIMS = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];
function nearestAllowed(n) {
  let best = ALLOWED_DIMS[0], bd = Math.abs(n - best);
  for (const v of ALLOWED_DIMS) {
    const d = Math.abs(n - v);
    if (d < bd) { best = v; bd = d; }
  }
  return best;
}

/**
 * Generate one image via NVIDIA NIM FLUX.1-dev.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {number} [opts.targetWidth=1080]   final desired width (we render at nearest allowed + upscale)
 * @param {number} [opts.targetHeight=1920]
 * @param {number} [opts.steps=30]
 * @param {number} [opts.cfgScale=3.5]
 * @param {number} [opts.seed]
 * @returns {Promise<{ok:boolean, path?:string, width?:number, height?:number, seed?:number, reason?:string}>}
 */
async function generate(opts) {
  const prompt = String(opts.prompt || '').trim();
  if (!prompt) return { ok: false, reason: 'empty_prompt' };
  const NV = process.env.NVIDIA_API_KEY;
  if (!NV) return { ok: false, reason: 'no_nvidia_api_key' };

  const targetW = opts.targetWidth || 1080;
  const targetH = opts.targetHeight || 1920;
  // NIM accepts a fixed set; pick closest aspect-preserving size.
  const ratio = targetW / targetH;
  let w = nearestAllowed(targetW);
  let h = nearestAllowed(targetH);
  // 1344 max — keep aspect
  if (ratio < 1) {
    h = 1344;
    w = nearestAllowed(Math.round(1344 * ratio));
  } else {
    w = 1344;
    h = nearestAllowed(Math.round(1344 / ratio));
  }
  const steps = Number(opts.steps || 30);
  const cfgScale = Number(opts.cfgScale || 3.5);
  const seed = Number.isFinite(opts.seed) ? Number(opts.seed) : Math.floor(Math.random() * 1e9);

  const key = sha1(`${prompt}|${w}x${h}|${steps}|${cfgScale}|${seed}`);
  ensureDir(CACHE_DIR);
  const rawPath = path.join(CACHE_DIR, `${key}-raw.png`);
  const finalPath = path.join(CACHE_DIR, `${key}-${targetW}x${targetH}.png`);

  if (fs.existsSync(finalPath) && fs.statSync(finalPath).size > 20_000) {
    return { ok: true, path: finalPath, width: targetW, height: targetH, seed, cached: true };
  }

  let response;
  try {
    response = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + NV, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ prompt, width: w, height: h, seed, steps, cfg_scale: cfgScale }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, reason: `fetch_failed: ${err && err.message || err}` };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, reason: `nvidia_http_${response.status}: ${body.slice(0, 200)}` };
  }
  let j;
  try { j = await response.json(); } catch (_) { return { ok: false, reason: 'response_not_json' }; }
  const b64 = j && j.artifacts && j.artifacts[0] && j.artifacts[0].base64;
  if (!b64) return { ok: false, reason: 'no_b64_in_response' };
  fs.writeFileSync(rawPath, Buffer.from(b64, 'base64'));

  // Upscale to target if needed
  if (w !== targetW || h !== targetH) {
    const r = spawnSync(FFMPEG, [
      '-y', '-i', rawPath,
      '-vf', `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1`,
      finalPath,
    ], { encoding: 'utf8' });
    if (r.status !== 0 || !fs.existsSync(finalPath)) {
      return { ok: false, reason: 'ffmpeg_upscale_failed' };
    }
  } else {
    fs.copyFileSync(rawPath, finalPath);
  }

  return { ok: true, path: finalPath, width: targetW, height: targetH, seed, cached: false };
}

module.exports = { generate };

if (require.main === module) {
  const prompt = process.argv.slice(2).join(' ') || 'aerial photograph of Tehran skyline at golden hour, atmospheric haze, editorial photojournalism, 35mm lens, vertical composition';
  generate({ prompt }).then((r) => {
    console.log(JSON.stringify({ ok: r.ok, path: r.path, width: r.width, height: r.height, reason: r.reason || null }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
