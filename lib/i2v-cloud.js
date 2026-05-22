/**
 * lib/i2v-cloud.js — RealMotion Tier-2 cloud i2v
 *
 * For hero beats (beat 0 + climax beat per video) generate REAL content
 * motion on the provider's GPU. GTX 1650 4GB can't run local i2v models;
 * cloud is the only path. Routes through `provider-router` capability
 * `motion_video` so failures auto-fail-over:
 *
 *   nvidia-cosmos  →  hf-ltx-video  →  hf-wan-2.1  →  fal-ltx
 *
 * If ALL providers are queued/rate-limited/down, returns `{ ok: false }`
 * and the caller falls back to RealMotion Tier-1 (depth-parallax). Never
 * returns a static photo — the static-photo path is the BAD outcome the
 * suppression-recovery brief explicitly rejects.
 *
 * Cache: `.runtime-cache/i2v/{provider}-{sha1}.mp4`
 */
'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const router = require('./provider-router');
const cosmos = require('./providers/nvidia-cosmos');

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'i2v');
function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

/**
 * Generate a hero-beat i2v clip.
 *
 * @param {object} opts
 * @param {string} opts.imagePath       absolute path to FLUX still
 * @param {string} opts.motionPrompt    e.g. "slow aerial dolly forward over the convoy, dust drifting, heat haze"
 * @param {number} opts.durationSec     target clip length (2-6s typical)
 * @returns {{ok:boolean, path?:string, provider?:string, attempts?:Array, reason?:string}}
 */
async function generateHeroBeat({ imagePath, motionPrompt, durationSec }) {
  ensureDir(CACHE_DIR);

  const result = await router.withFailover('motion_video', async (provider) => {
    if (provider === 'nvidia-cosmos') {
      const r = await cosmos.generate({ imagePath, prompt: motionPrompt, durationSec });
      if (!r.ok) throw new Error(r.reason || 'cosmos_failed');
      return r;
    }
    if (provider === 'hf-ltx-video') {
      // HF Inference Endpoints for Lightricks/LTX-Video. Free Zero-GPU queue.
      // Stub: full impl requires the HF endpoint URL + multipart upload.
      // Left as a "not wired" branch so the router fails it over cleanly.
      throw new Error('provider_not_wired:hf-ltx-video — wire HF Inference endpoint to enable');
    }
    if (provider === 'hf-wan-2.1') {
      throw new Error('provider_not_wired:hf-wan-2.1 — wire HF Inference endpoint to enable');
    }
    if (provider === 'fal-ltx') {
      throw new Error('provider_not_wired:fal-ltx — wire FAL_KEY + budget check to enable');
    }
    throw new Error('unknown_provider:' + provider);
  });

  if (result.ok) {
    return {
      ok: true,
      path: result.value.path,
      provider: result.provider,
      attempts: result.attempts,
      cached: !!result.value.cached,
    };
  }
  return { ok: false, attempts: result.attempts, reason: result.reason || 'all_motion_video_providers_failed' };
}

/**
 * Decide whether a given beat should use Tier-2 (cloud i2v) or Tier-1
 * (strong depth-parallax). Per spec: beat 0 (hook) + climax beat get Tier-2.
 *
 * @param {number} beatIndex
 * @param {number} totalBeats
 * @returns {boolean}
 */
function shouldUseHeroI2v(beatIndex, totalBeats) {
  if (process.env.REALMOTION_I2V_ALL_BEATS === '1') return true;
  if (process.env.REALMOTION_I2V_DISABLED === '1') return false;
  if (totalBeats <= 1) return true;
  if (beatIndex === 0) return true;                          // hook
  if (beatIndex === Math.max(1, totalBeats - 2)) return true; // climax (second-to-last)
  return false;
}

module.exports = { generateHeroBeat, shouldUseHeroI2v };

if (require.main === module) {
  const img = process.argv[2];
  const prompt = process.argv[3] || 'slow cinematic dolly forward; subtle realistic motion';
  const dur = Number(process.argv[4]) || 4;
  if (!img) { console.error('Usage: node lib/i2v-cloud.js <image.png> [prompt] [durationSec]'); process.exit(2); }
  generateHeroBeat({ imagePath: path.resolve(img), motionPrompt: prompt, durationSec: dur }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
