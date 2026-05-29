/**
 * lib/hero-visual.js — MASTER-REBUILD Phase 2C
 *
 * The single function the organic composition calls per beat:
 *
 *   const result = await heroVisual({ beat, scriptContext, durationSec, beatIndex });
 *   // result.path is a ~Nseconds 1080×1920 motion clip ready to drop in
 *
 * Internally:
 *   1. Router picks a hero_image provider (nvidia-flux.1-dev first)
 *   2. Provider generates a photorealistic still from the beat's enriched prompt
 *   3. Parallax-generator animates the still with a per-beat-varied camera move
 *
 * REPLACES the V5/V6/V7 procedural-3D-text path entirely. This is the
 * "FLUX-parallax" pattern from the master-rebuild spec.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const router = require('./provider-router');
const parallax = require('./parallax-generator');

const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const ROOT = path.resolve(__dirname, '..');

const nvidiaFlux = require('./providers/nvidia-flux');

// ── Prompt enrichment per beat ──────────────────────────────────────────
// Take the beat's voiceover + visual_prompt + scriptContext and write a
// cinematic editorial-photography prompt suitable for FLUX.1-dev.

const STYLE_TAIL = ', editorial photojournalism, shot on 35mm, shallow depth of field, dramatic side lighting, atmospheric haze, vertical 9:16 composition, no text, no watermarks, no people facing camera';

function enrichPrompt(beat, scriptContext) {
  const visualPrompt = String((beat && beat.visual_prompt) || (beat && beat.visualPrompt) || '').trim();
  const vo = String((beat && (beat.voiceover || beat.vo)) || '').trim();

  // Heuristic: if the visual_prompt mentions specific entities/places, use it
  // as the spine. Otherwise derive a scene from the voiceover.
  let base = '';
  if (visualPrompt.length > 16) {
    base = visualPrompt
      .replace(/Frame\s*\d+:.*?\.\s*/gi, '')  // strip frame-by-frame directives
      .replace(/Pexels.*$/i, '')
      .replace(/Pollinations.*$/i, '')
      .replace(/HF Wan.*$/i, '')
      .replace(/animation/gi, '')
      .replace(/text overlay.*$/i, '')
      .split(/\.\s*/)[0]
      .slice(0, 220);
  } else {
    // Build from voiceover: extract first 1-2 noun phrases
    base = vo.split(/[.!?]/)[0].trim().slice(0, 160);
  }

  // Lower-case the body so FLUX doesn't render literal text
  base = base.replace(/\b[A-Z]{2,}\b/g, (m) => m.toLowerCase());

  // Geopolitics scenes get atmospheric / aerial bias
  const isGeopol = /geopolitics|war|border|crossing|oil|trade|alliance|strike|missile|military/i.test(vo + ' ' + visualPrompt);
  const prefix = isGeopol ? 'cinematic aerial photograph of ' : 'cinematic photograph of ';

  return (prefix + base + STYLE_TAIL).slice(0, 500);
}

/**
 * @param {object} input
 * @param {object} input.beat                 from the script JSON (has voiceover + visual_prompt OR vo + visualPrompt)
 * @param {object} input.scriptContext        full script object (for topic context)
 * @param {number} input.durationSec
 * @param {number} input.beatIndex            for camera-move variation
 * @param {string} [input.outputPath]
 * @returns {Promise<{ok:boolean, path?:string, prompt?:string, provider?:string, move?:string, durationSec?:number, reason?:string}>}
 */
function upscaleStillImage(inputPath, outputPath, targetW = 1080, targetH = 1920) {
  const r = spawnSync(FFMPEG, [
    '-y', '-i', inputPath,
    '-vf', `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1`,
    outputPath,
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(outputPath)) {
    throw new Error('ffmpeg_upscale_failed_for_fallback');
  }
  return outputPath;
}

/**
 * @param {object} input
 * @param {object} input.beat                 from the script JSON (has voiceover + visual_prompt OR vo + visualPrompt)
 * @param {object} input.scriptContext        full script object (for topic context)
 * @param {number} input.durationSec
 * @param {number} input.beatIndex            for camera-move variation
 * @param {string} [input.outputPath]
 * @returns {Promise<{ok:boolean, path?:string, prompt?:string, provider?:string, move?:string, durationSec?:number, reason?:string}>}
 */
async function heroVisual(input) {
  const { beat, scriptContext, durationSec, beatIndex } = input;
  const prompt = enrichPrompt(beat, scriptContext || {});

  // L107+ humanization fix — if the beat's visualPrompt has [PORTRAIT:<name>]
  // marker, fetch the real person's portrait from Wikimedia BEFORE going
  // through FLUX→Pexels chain. This is what makes a "Vance flew to Doha"
  // beat actually show Vance, not a random Pexels-stock podium speaker.
  try {
    const portraitMod = require('./person-portrait');
    const rawVisual = String((beat && (beat.visualPrompt || beat.visual_prompt)) || '');
    const markerName = portraitMod.extractPortraitMarker(rawVisual);
    if (markerName) {
      console.log(`   📸 portrait marker found: [PORTRAIT:${markerName}] — fetching from Wikimedia`);
      const pr = await portraitMod.getPortrait({ name: markerName });
      if (pr.ok) {
        console.log(`   ✓ portrait resolved (${pr.source}) → ${path.basename(pr.path)}`);
        // Build a stillResult-shaped value so the rest of heroVisual treats
        // it identically to a FLUX render. The portrait is already 1080×1920
        // and centred, so no upscale step needed.
        const stillResult = { ok: true, path: pr.path };
        const provider = 'wikimedia-portrait';
        // Reuse the Tier-2 i2v + Tier-1.5 Pexels + Tier-1 parallax cascade
        // below by constructing the same r.value/r.provider shape inline.
        // Skip the provider router entirely.
        return await applyMotionCascade({ stillResult, provider, prompt, beat, scriptContext, durationSec, beatIndex, outputPath: input.outputPath });
      }
      console.log(`   ⚠  portrait lookup failed (${pr.reason}) — falling through to FLUX/Pexels`);
    }
  } catch (e) {
    console.log(`   ⚠  person-portrait module unavailable: ${(e && e.message || e).slice(0, 120)}`);
  }

  // Pick image provider via router (NVIDIA FLUX first, falls to Pollinations
  // / HF FLUX / etc.)
  const r = await router.withFailover('hero_image', async (provider) => {
    if (provider === 'nvidia-flux.1-dev' || provider === 'nvidia-flux.2-klein') {
      const r = await nvidiaFlux.generate({ prompt, targetWidth: 1080, targetHeight: 1920 });
      if (!r.ok) throw new Error(r.reason || 'nvidia_failed');
      return r;
    }

    // Fallback providers from image-providers.js
    const imageProviders = require('../image-providers');
    let providerFn = null;
    let providerLabel = '';

    if (provider === 'pollinations-seedream') {
      providerFn = imageProviders.IMAGE_PROVIDERS.find(p => p.label === 'Pollinations Open Image')?.fn;
      providerLabel = 'Pollinations Open Image';
    } else if (provider === 'hf-flux-schnell') {
      providerFn = imageProviders.IMAGE_PROVIDERS.find(p => p.label === 'HF FLUX.1-schnell')?.fn;
      providerLabel = 'HF FLUX.1-schnell';
    } else if (provider === 'gemini-image') {
      providerFn = imageProviders.IMAGE_PROVIDERS.find(p => p.label === 'Gemini Flash Image')?.fn;
      providerLabel = 'Gemini Flash Image';
    }

    if (providerFn) {
      const res = await providerFn(prompt, beatIndex || 0, { visualIntent: 'hero_frame' });
      if (!res || !res.src) {
        throw new Error(`${providerLabel} returned empty asset`);
      }
      const absoluteSrc = path.join(ROOT, 'public', res.src);
      if (!fs.existsSync(absoluteSrc)) {
        throw new Error(`${providerLabel} file does not exist at ${absoluteSrc}`);
      }
      
      const cacheDir = path.join(ROOT, '.runtime-cache', 'nvidia-flux');
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
      const outputFilename = path.basename(absoluteSrc, path.extname(absoluteSrc)) + '-1080x1920.png';
      const upscaledPath = path.join(cacheDir, outputFilename);

      upscaleStillImage(absoluteSrc, upscaledPath, 1080, 1920);
      return { ok: true, path: upscaledPath };
    }

    throw new Error('provider_not_wired:' + provider);
  });

  if (!r.ok) {
    return { ok: false, reason: r.reason || 'all_image_providers_failed', attempts: r.attempts };
  }
  const stillResult = r.value;
  const provider = r.provider;
  return await applyMotionCascade({ stillResult, provider, prompt, beat, scriptContext, durationSec, beatIndex, outputPath: input.outputPath });
}

/**
 * Motion cascade applied to a still image, regardless of how the still was sourced
 * (FLUX, Wikimedia portrait, etc.).
 *
 * Order: Tier-2 cloud i2v (hook + climax only) → Tier-1.5 Pexels stock → Tier-1 parallax.
 *
 * IMPORTANT for portrait stills: Pexels stock fallback is SKIPPED, because for
 * a named-person beat we want the actual portrait animated (parallax), not a
 * generic stock video that would replace the portrait. Pexels is only useful
 * when the still itself is generic.
 */
async function applyMotionCascade({ stillResult, provider, prompt, beat, scriptContext, durationSec, beatIndex, outputPath }) {
  const isPortrait = provider === 'wikimedia-portrait';

  // RealMotion Tier-2 — hero beats (beat 0 + climax) get cloud i2v.
  const totalBeats = Number((scriptContext && scriptContext.totalBeats) || (beat && beat.totalBeats) || 0) || 1;
  try {
    const i2v = require('./i2v-cloud');
    if (i2v.shouldUseHeroI2v(beatIndex || 0, totalBeats)) {
      const motionPrompt = (function () {
        const vo = String((beat && (beat.voiceover || beat.vo)) || '').slice(0, 160);
        return `slow cinematic motion matching: ${vo}; subtle realistic camera move; preserve composition; no distortion`;
      })();
      const r2 = await i2v.generateHeroBeat({ imagePath: stillResult.path, motionPrompt, durationSec });
      if (r2.ok) {
        return {
          ok: true,
          path: r2.path,
          stillPath: stillResult.path,
          prompt,
          provider,
          motionProvider: r2.provider,
          tier: 'tier-2-cloud-i2v',
          durationSec,
        };
      }
      try { console.log(`   ⚠  i2v failed (${(r2.reason || '').slice(0, 80)}) — falling to ${isPortrait ? 'Tier-1 parallax (portrait-protect)' : 'Pexels stock video fallback'}`); } catch (_) {}
    }
  } catch (_) { /* i2v-cloud module not wired; fall through */ }

  // RealMotion Tier-1.5 — Pexels stock fallback.
  // SKIP for portrait stills — replacing a real Vance/Trump portrait with a
  // generic stock video defeats the whole point of fetching the portrait.
  if (!isPortrait) {
    try {
      const pexelsVideo = require('./pexels-video');
      const searchQuery = (beat.visual_prompt || beat.visualPrompt || beat.voiceover || beat.vo || 'world news')
        .replace(/\[PORTRAIT:[^\]]+\]/gi, '')
        .split(/[.,]/)[0]
        .replace(/Pexels.*$/i, '')
        .replace(/cinematic|wide shot|photo-realistic|editorial/gi, '')
        .trim();

      console.log(`   🎥  attempting Pexels stock video fallback for query: "${searchQuery}"`);
      const pexResult = await pexelsVideo.getAmbientVideo({ query: searchQuery, durationSec });
      if (pexResult.ok) {
        return {
          ok: true,
          path: pexResult.path,
          stillPath: stillResult.path,
          prompt,
          provider: 'pexels-video',
          tier: 'tier-1.5-pexels-stock',
          durationSec,
        };
      }
      console.log(`   ⚠  Pexels stock video fallback failed: ${pexResult.reason} — falling back to Ken Burns 2.5D parallax slideshow`);
    } catch (e) {
      console.log(`   ⚠️  Pexels fallback exception: ${e.message} — falling back to Ken Burns 2.5D parallax slideshow`);
    }
  }

  // RealMotion Tier-1 — strong depth-parallax camera move on the still.
  const move = parallax.pickMove(beatIndex || 0);
  const animResult = await parallax.animate({
    imagePath: stillResult.path,
    durationSec,
    move,
    outputPath,
  });
  if (!animResult.ok) {
    return { ok: false, reason: 'parallax_failed: ' + animResult.reason };
  }

  return {
    ok: true,
    path: animResult.path,
    stillPath: stillResult.path,
    prompt,
    provider,
    move,
    tier: isPortrait ? 'tier-1-parallax-portrait' : 'tier-1-parallax',
    durationSec,
  };
}

module.exports = { heroVisual, enrichPrompt };

if (require.main === module) {
  // Smoke test: A1 hook beat
  const beat = {
    voiceover: 'Pakistan just made the choice that breaks the Quad.',
    visual_prompt: 'Wide cinematic shot of Pakistan-Iran border crossing at dusk, military trucks queuing, slow pan.',
  };
  heroVisual({ beat, scriptContext: { topic: 'pakistan-picked-iran' }, durationSec: 2.5, beatIndex: 0 }).then((r) => {
    console.log(JSON.stringify({ ok: r.ok, provider: r.provider, move: r.move, path: r.path, prompt: r.prompt, reason: r.reason || null }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
