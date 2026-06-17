/**
 * lib/v7-backdrop-gen.js — V7 cinematic backdrop generator
 *
 * Reads a V7 scene spec (with mood + reference + geometry.primary) and
 * generates a single cinematic still backdrop via Pollinations FLUX (free,
 * no signup, 1080×1920). The backdrop becomes the PHOTOGRAPHIC LAYER in
 * V7 compositions — the layer that V5/V6 were missing.
 *
 * V7 brief allows this: "NO Pexels image API" was the constraint; image
 * generation via Pollinations / FLUX / NVIDIA / HF is not banned.
 *
 * Output: saved to public/v7-backdrops/<scriptId>-<beatId>.jpg AND to
 * .runtime-cache/v7-public/v7-backdrops/ so Remotion's --public-dir flag
 * can bundle it.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public', 'v7-backdrops');
const RUNTIME_PUBLIC_DIR = path.join(ROOT, '.runtime-cache', 'v7-public', 'v7-backdrops');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

function buildPrompt(beat) {
  // Translate the spec into a FLUX prompt that produces a cinema-grade
  // photographic still matching the beat's mood + geometry intent.
  const primary = (beat.geometry && beat.geometry.primary) || '';
  const reference = beat.reference || '';
  const mood = beat.mood || '';
  const lighting = beat.lighting || {};
  const keyColor = (lighting.key && lighting.key.color) || '#FFD200';

  // Build a richly-conditioned prompt
  const parts = [
    'cinematic still frame, 35mm lens, shallow depth of field, photorealistic',
    primary,
    `mood: ${mood}`,
    `lighting reference: ${reference}`,
    'rim light, atmospheric haze, motivated lighting, film LUT',
    'subtle vignette, slight chromatic aberration, fine film grain',
    'rule of thirds composition, no text or watermarks',
  ];
  return parts.filter(Boolean).join(', ').slice(0, 600);
}

async function generateBackdrop(opts) {
  const { scriptId, beatId, beat, force } = opts;
  ensureDir(PUBLIC_DIR);
  ensureDir(RUNTIME_PUBLIC_DIR);

  const filename = `${scriptId}-${beatId}.jpg`;
  const publicPath = path.join(PUBLIC_DIR, filename);
  const runtimePath = path.join(RUNTIME_PUBLIC_DIR, filename);

  if (!force && fs.existsSync(publicPath) && fs.statSync(publicPath).size > 10000) {
    return { ok: true, cached: true, publicPath, runtimePath, filename, urlRef: `v7-backdrops/${filename}` };
  }

  const prompt = buildPrompt(beat);
  console.log(`[v7-backdrop] ${scriptId}/${beatId} — generating via HF FLUX.1-schnell`);

  // PRIMARY: HuggingFace router → FLUX.1-schnell (free with HF token,
  // 4-step diffusion, ~3s per image, Apache 2.0 commercial-safe)
  const HF = process.env.HUGGINGFACE_API_KEY;
  let response;
  if (!HF) return { ok: false, reason: 'no_hf_token' };
  try {
    response = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + HF, 'Content-Type': 'application/json', 'Accept': 'image/png' },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { width: 576, height: 1024, num_inference_steps: 4 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    return { ok: false, reason: `hf_fetch_failed: ${err && err.message || err}` };
  }
  if (!response.ok) {
    return { ok: false, reason: `hf_http_${response.status}` };
  }
  const ct = response.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) {
    return { ok: false, reason: `hf_unexpected_content_type: ${ct}` };
  }
  const buf = await response.buffer();
  if (buf.length < 10_000) {
    return { ok: false, reason: 'image_too_small' };
  }
  fs.writeFileSync(publicPath, buf);
  fs.writeFileSync(runtimePath, buf);
  console.log(`[v7-backdrop] ${scriptId}/${beatId} OK — ${buf.length} bytes`);
  return { ok: true, cached: false, publicPath, runtimePath, filename, urlRef: `v7-backdrops/${filename}`, prompt };
}

async function generateAllBackdrops(scriptId, specPath, force = false) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const results = [];
  for (const beat of spec.beats) {
    const r = await generateBackdrop({ scriptId, beatId: beat.beatId, beat, force });
    results.push({ beatId: beat.beatId, ...r });
    // Tiny throttle to be a nice citizen
    await new Promise((r) => setTimeout(r, 250));
  }
  return results;
}

module.exports = { generateBackdrop, generateAllBackdrops, buildPrompt };

if (require.main === module) {
  const scriptId = process.argv[2] || 'A1-pakistan-iran';
  const specPath = path.join(ROOT, '.planning', 'v7-specs', `${scriptId}.json`);
  if (!fs.existsSync(specPath)) { console.error('Spec missing:', specPath); process.exit(2); }
  const force = process.argv.includes('--force');
  generateAllBackdrops(scriptId, specPath, force).then((res) => {
    console.log(JSON.stringify(res.map(r => ({ beat: r.beatId, ok: r.ok, cached: r.cached, file: r.filename, reason: r.reason })), null, 2));
    process.exit(res.every(r => r.ok) ? 0 : 1);
  });
}
