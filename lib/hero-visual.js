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
async function heroVisual(input) {
  const { beat, scriptContext, durationSec, beatIndex } = input;
  const prompt = enrichPrompt(beat, scriptContext || {});

  // Pick image provider via router (NVIDIA FLUX first, falls to Pollinations
  // / HF FLUX / etc.)
  const r = await router.withFailover('hero_image', async (provider) => {
    if (provider === 'nvidia-flux.1-dev') {
      const r = await nvidiaFlux.generate({ prompt, targetWidth: 1080, targetHeight: 1920 });
      if (!r.ok) throw new Error(r.reason || 'nvidia_failed');
      return r;
    }
    // Other providers — for now we only have NVIDIA wired here; the router
    // will mark others as missing and fall through (or route to whichever is
    // healthy). Throw to trigger next provider.
    throw new Error('provider_not_wired:' + provider);
  });

  if (!r.ok) {
    return { ok: false, reason: r.reason || 'all_image_providers_failed', attempts: r.attempts };
  }
  const stillResult = r.value;
  const provider = r.provider;

  // Animate the still with a per-beat camera move
  const move = parallax.pickMove(beatIndex || 0);
  const animResult = await parallax.animate({
    imagePath: stillResult.path,
    durationSec,
    move,
    outputPath: input.outputPath,
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
