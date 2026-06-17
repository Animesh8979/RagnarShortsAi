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

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');

const router = require('./provider-router');
const cosmos = require('./providers/nvidia-cosmos');

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'i2v');
function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 20); }
const _usedPlates = new Set(); // L118 — per-process ledger so one batch never repeats a cached Veo plate

// ── HF Inference Provider (router) — shared caller ───────────────────────
// Most i2v models on HF Inference Providers accept:
//   POST https://router.huggingface.co/hf-inference/models/{model}
//   { inputs: <prompt>, parameters: { image: <base64>, num_frames: N } }
// The actual response is binary mp4 OR JSON with a base64 video field;
// the response body's content-type tells us which.
//
// Free tier: ~$0.10/mo of compute credits + Zero-GPU Space queue. We
// time-budget each call to 5 min and fail fast so the router can fall
// through to the next provider.
async function callHfInferenceI2V({ modelId, imagePath, prompt, durationSec, expectedFps = 16, loopMode = null }) {
  if (!process.env.HUGGINGFACE_API_KEY) return { ok: false, reason: 'missing_HUGGINGFACE_API_KEY' };
  if (!imagePath || !fs.existsSync(imagePath)) return { ok: false, reason: 'image_missing' };

  // L108 P4 — first=last frame loop. Only LTX-Video supports `last_image` reliably.
  const loopSuffix = loopMode === 'first_eq_last' ? '|loop=first_eq_last' : '';
  const cacheKey = sha1(`${modelId}|${imagePath}|${prompt}|${durationSec}${loopSuffix}`);
  const outPath = path.join(CACHE_DIR, `${modelId.replace(/[/]/g, '_')}-${cacheKey}.mp4`);
  ensureDir(CACHE_DIR);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 200_000) {
    return { ok: true, path: outPath, provider: modelId, cached: true, loopMode };
  }

  const imageBuf = fs.readFileSync(imagePath);
  const imageBase64 = imageBuf.toString('base64');
  const url = `https://router.huggingface.co/hf-inference/models/${modelId}`;
  const params = {
    image: `data:image/png;base64,${imageBase64}`,
    num_frames: Math.max(16, Math.floor(durationSec * expectedFps)),
    guidance_scale: 3.0,
    num_inference_steps: 20,
  };
  if (loopMode === 'first_eq_last' && /Lightricks\/LTX/i.test(modelId)) {
    // LTX accepts last_image as a second-frame conditioning. Setting it equal
    // to first_image forces the model to interpolate a closed 4s motion arc
    // that loops invisibly — the Kling "first=last frame" trick, free.
    params.last_image = `data:image/png;base64,${imageBase64}`;
  }
  const body = JSON.stringify({ inputs: prompt, parameters: params });

  const t0 = Date.now();
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, video/mp4',
        // The HF Inference router queues Zero-GPU jobs; respect the queue.
        'x-wait-for-model': 'true',
      },
      body,
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
  } catch (e) {
    return { ok: false, reason: `hf_fetch_failed: ${e && e.message || e}`.slice(0, 240) };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, reason: `hf_http_${resp.status}: ${text.slice(0, 200)}` };
  }

  const contentType = String(resp.headers.get('content-type') || '');
  let videoBuf = null;
  if (/video\/mp4/i.test(contentType) || /application\/octet-stream/i.test(contentType)) {
    videoBuf = Buffer.from(await resp.arrayBuffer());
  } else {
    // JSON response — shape varies by model. Try common keys.
    let json;
    try { json = await resp.json(); } catch (_) { return { ok: false, reason: 'hf_bad_json' }; }
    const b64 = json.video_base64 || json.mp4_base64 || (json.artifacts && json.artifacts[0] && (json.artifacts[0].video_base64 || json.artifacts[0].mp4_base64));
    const dlUrl = json.video_url || json.mp4_url || (json.artifacts && json.artifacts[0] && (json.artifacts[0].url || json.artifacts[0].uri));
    if (b64) {
      videoBuf = Buffer.from(b64, 'base64');
    } else if (dlUrl) {
      const dl = await fetch(dlUrl, { signal: AbortSignal.timeout(60_000) });
      if (!dl.ok) return { ok: false, reason: `hf_dl_http_${dl.status}` };
      videoBuf = Buffer.from(await dl.arrayBuffer());
    } else {
      return { ok: false, reason: `hf_unrecognized_json_shape: ${Object.keys(json).join(',').slice(0, 120)}` };
    }
  }

  if (!videoBuf || videoBuf.length < 100_000) {
    return { ok: false, reason: `hf_empty_video: ${videoBuf ? videoBuf.length : 0} bytes` };
  }
  fs.writeFileSync(outPath, videoBuf);
  return { ok: true, path: outPath, provider: modelId, latencyMs: Date.now() - t0, cached: false };
}

/**
 * Generate a hero-beat i2v clip.
 *
 * @param {object} opts
 * @param {string} opts.imagePath       absolute path to FLUX still
 * @param {string} opts.motionPrompt    e.g. "slow aerial dolly forward over the convoy, dust drifting, heat haze"
 * @param {number} opts.durationSec     target clip length (2-6s typical)
 * @returns {{ok:boolean, path?:string, provider?:string, attempts?:Array, reason?:string}}
 */
async function generateHeroBeat({ imagePath, motionPrompt, durationSec, loopMode = null }) {
  ensureDir(CACHE_DIR);

  const result = await router.withFailover('motion_video', async (provider) => {
    if (provider === 'google-veo-flow') {
      // L116 B2 — Veo 3.1 via the user's Flow session (8s cinematic plate, the 95 lever).
      // Self-gates on GOOGLE_FLOW_SESSION + monthly budget; no-ops cleanly → the router
      // cascades to NVIDIA-Cosmos/HF. Only reached on hero beats (shouldUseHeroI2v gate).
      //
      // Driver selection (warm-coalescing-island Phase 1B): GOOGLE_FLOW_DRIVER=harness
      // routes through the self-healing browser-use/browser-harness — survives Flow
      // UI changes. Default 'playwright' keeps the existing path.
      const driverName = process.env.GOOGLE_FLOW_DRIVER === 'harness' ? './providers/veo-harness-driver' : './providers/google-veo-browser';
      const r = await require(driverName).generate({ imagePath, prompt: motionPrompt, durationSec: Math.min(8, durationSec || 8), kind: 'video' });
      if (!r.ok) throw new Error(r.reason || 'google-veo-flow_failed');
      return r;
    }
    if (provider === 'nvidia-cosmos') {
      // Cosmos doesn't support first=last; only honor loopMode through HF LTX below.
      const r = await cosmos.generate({ imagePath, prompt: motionPrompt, durationSec });
      if (!r.ok) throw new Error(r.reason || 'cosmos_failed');
      return r;
    }
    if (provider === 'hf-ltx-video') {
      const r = await callHfInferenceI2V({ modelId: 'Lightricks/LTX-Video', imagePath, prompt: motionPrompt, durationSec, expectedFps: 25, loopMode });
      if (!r.ok) throw new Error(r.reason || 'hf-ltx-video_failed');
      return r;
    }
    if (provider === 'hf-wan-2.1') {
      // Wan 2.1 — quantized 1.3B variant fits the free-tier queue speed.
      const r = await callHfInferenceI2V({ modelId: 'Wan-AI/Wan2.1-T2V-1.3B', imagePath, prompt: motionPrompt, durationSec, expectedFps: 16 });
      if (!r.ok) throw new Error(r.reason || 'hf-wan-2.1_failed');
      return r;
    }
    if (provider === 'hf-cogvideox') {
      // CogVideoX-2B — smallest, fastest free-tier video model.
      const r = await callHfInferenceI2V({ modelId: 'THUDM/CogVideoX-2b', imagePath, prompt: motionPrompt, durationSec, expectedFps: 8 });
      if (!r.ok) throw new Error(r.reason || 'hf-cogvideox_failed');
      return r;
    }
    if (provider === 'fal-ltx') {
      // FAL is paid-tier; we keep it as the last resort behind a budget gate.
      // The router only picks it when FAL_KEY is set AND the daily-budget
      // env var has remaining cents. For now, never wired here — let it fail
      // through to Tier-1 parallax which is free.
      throw new Error('fal-ltx_paid_skipped (set FAL_DAILY_BUDGET_CENTS to enable)');
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
  // L117 — "use the good frames": if live motion gen hiccupped but cached Veo plates
  // (already-paid, user-confirmed-good clips) exist, reuse one as the hero plate instead
  // of dropping to a flat FLUX still. Root-cause fix for "Veo generated but never composited"
  // — the 19 cached clips finally get used. Pick by prompt-hash so beats vary.
  try {
    if (process.env.GOOGLE_FLOW_SESSION === '1') {
      const veoDir = path.join(__dirname, '..', '.runtime-cache', 'veo');
      const clips = fs.existsSync(veoDir)
        ? fs.readdirSync(veoDir).filter((f) => f.endsWith('.mp4'))
            .map((f) => path.join(veoDir, f))
            .map((p) => { try { const s = fs.statSync(p); return { p, size: s.size, mtime: s.mtimeMs }; } catch (_) { return null; } })
            .filter((c) => c && c.size > 100000)         // size gate = drop empty/corrupt downloads
            .sort((a, b) => b.mtime - a.mtime)           // most-recent first = TODAY's good clips
        : [];
      // Prefer TODAY's clips (last 12h, the user-confirmed-good ones); only fall back to
      // older cache if nothing fresh exists. (Per user: "today's veo clips are good".)
      const fresh = clips.filter((c) => Date.now() - c.mtime < 12 * 3600 * 1000);
      const pool = (fresh.length ? fresh : clips).map((c) => c.p);
      if (pool.length) {
        // L118 — spread picks: hash the prompt (not its length — lengths collide and put
        // the SAME plate on hook + climax, proven on the 06-05 render) and skip plates
        // already used this process so one video never repeats a plate.
        let idx = parseInt(sha1(String(motionPrompt || '')).slice(0, 8), 16) % pool.length;
        for (let t = 0; t < pool.length && _usedPlates.has(pool[idx]); t++) idx = (idx + 1) % pool.length;
        const pick = pool[idx];
        _usedPlates.add(pick);
        try { console.log('   ♻ reusing cached Veo plate: ' + path.basename(pick)); } catch (_) {}
        return { ok: true, path: pick, provider: 'google-veo-flow-cached', cached: true, reusedPlate: true };
      }
    }
  } catch (_) {}
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
  if (process.env.REALMOTION_I2V_DISABLED === '1') return false;
  return true; // 100% video coverage mandate (Phase 3 100x Strategy)
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
