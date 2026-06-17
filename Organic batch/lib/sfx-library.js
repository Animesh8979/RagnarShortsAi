/**
 * lib/sfx-library.js — L109 P1
 *
 * Manage a local CC0 sound-effect library. Downloads/caches verified-CC0 SFX
 * from Pixabay (no attribution required, commercial OK) on first use.
 *
 * Each SFX is a small (<200KB) MP3 stored under D:\AI_Tools\sfx\.
 *
 * Categories:
 *   - bass-impact  (Vine Boom)         — on shocking reveal
 *   - whoosh       (transition)        — on every hard cut
 *   - riser        (1-2s build)        — before peak
 *   - ding         (text reveal)       — on caption pop-in
 *   - sad-violin   (failure)           — on awkward moments
 *   - air-horn     (hype/W moment)     — on celebration
 *   - record-scratch (wait-what)       — on freeze frame
 *   - crash        (disaster)          — on broken moments
 *
 * Exports:
 *   - getSfxPath(category)           → path to a cached SFX file, downloading if needed
 *   - listCategories()               → list available SFX names
 *   - buildSfxOverlayChain(opts)     → ffmpeg amix chain that overlays SFX at given times
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();

const ROOT = path.resolve(__dirname, '..');
// SFX live on D:\AI_Tools\sfx\ (NOT under .runtime-cache, since they persist).
const SFX_DIR = path.join('D:\\AI_Tools', 'sfx');
try { fs.mkdirSync(SFX_DIR, { recursive: true }); } catch (_) {}

// L109 — ffmpeg-synthesised SFX fallback when network/CDN URLs fail. Each
// recipe is a self-contained ffmpeg lavfi expression producing the SFX
// shape (no samples needed). Deterministic, offline, $0.
const SFX_SYNTH = {
  'vine-boom':      { dur: 0.8,  filter: 'sine=frequency=70:duration=0.8,volume=4,afade=t=in:st=0:d=0.01,afade=t=out:st=0.3:d=0.5' },
  'whoosh':         { dur: 0.5,  filter: 'anoisesrc=color=brown:duration=0.5,bandpass=f=800:t=h:width=1200,volume=3,afade=t=in:st=0:d=0.05,afade=t=out:st=0.3:d=0.2' },
  'whoosh-2':       { dur: 0.4,  filter: 'anoisesrc=color=pink:duration=0.4,bandpass=f=1200:t=h:width=2000,volume=2.5,afade=t=in:st=0:d=0.05,afade=t=out:st=0.2:d=0.2' },
  'riser':          { dur: 1.5,  filter: 'sine=frequency=200:duration=1.5,asetrate=44100*1.0,aresample=44100,afade=t=in:st=0:d=0.1,afade=t=out:st=1.3:d=0.2,volume=2' },
  'ding':           { dur: 0.3,  filter: 'sine=frequency=1200:duration=0.3,volume=2,afade=t=out:st=0.05:d=0.25' },
  'sad-violin':     { dur: 1.2,  filter: 'sine=frequency=440:duration=1.2,volume=1.5,afade=t=in:st=0:d=0.1,afade=t=out:st=0.8:d=0.4' },
  'air-horn':       { dur: 0.8,  filter: 'sine=frequency=440:duration=0.8,volume=3,afade=t=in:st=0:d=0.02,afade=t=out:st=0.6:d=0.2' },
  'record-scratch': { dur: 0.5,  filter: 'anoisesrc=color=white:duration=0.5,bandpass=f=2000:t=h:width=4000,volume=2,afade=t=in:st=0:d=0.02,afade=t=out:st=0.4:d=0.1' },
  'glass-crash':    { dur: 0.6,  filter: 'anoisesrc=color=white:duration=0.6,highpass=f=2000,volume=4,afade=t=out:st=0.3:d=0.3' },
  'bass-drop':      { dur: 1.0,  filter: 'sine=frequency=55:duration=1.0,volume=5,afade=t=in:st=0:d=0.05,afade=t=out:st=0.7:d=0.3' },
};

/**
 * Synthesise an SFX category using ffmpeg's lavfi audio filters. Output is
 * a small mp3 (typically <50KB) that lives forever on D:\AI_Tools\sfx\.
 * Returns true on success.
 */
function synthSfx(category, outPath) {
  const recipe = SFX_SYNTH[category];
  if (!recipe) return false;
  const r = spawnSync(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', recipe.filter,
    '-c:a', 'libmp3lame', '-b:a', '128k',
    outPath,
  ], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024;
}

// Curated CC0 SFX sources. All from Pixabay (CC0, commercial-OK, no attribution).
// URLs are direct CDN endpoints (Pixabay's static MP3 host).
const SFX_CATALOG = {
  'vine-boom':       { url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_1a534b62f3.mp3',  size: '40KB',  desc: 'bass impact, deep boom' },
  'whoosh':          { url: 'https://cdn.pixabay.com/audio/2022/03/24/audio_3b9b32eb88.mp3',  size: '20KB',  desc: 'fast transition swoosh' },
  'whoosh-2':        { url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_15a1bb1d0c.mp3',  size: '25KB',  desc: 'alternative whoosh' },
  'riser':           { url: 'https://cdn.pixabay.com/audio/2022/10/13/audio_2c4ff10a3a.mp3',  size: '60KB',  desc: '1.5s pitch-rising tension' },
  'ding':            { url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_271215c47b.mp3',  size: '15KB',  desc: 'soft bell ding for text reveal' },
  'sad-violin':      { url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_d1c95e0c30.mp3',  size: '50KB',  desc: 'Cone violin, sad failure beat' },
  'air-horn':        { url: 'https://cdn.pixabay.com/audio/2022/12/02/audio_2a8e8d9b03.mp3',  size: '40KB',  desc: 'hype celebration horn' },
  'record-scratch':  { url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_3e91d27ed9.mp3',  size: '20KB',  desc: 'freeze-frame scratch' },
  'glass-crash':     { url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_8c1f5fa2e0.mp3',  size: '35KB',  desc: 'broken-glass impact' },
  'bass-drop':       { url: 'https://cdn.pixabay.com/audio/2023/04/01/audio_6f3a5d4f99.mp3',  size: '50KB',  desc: 'EDM bass drop' },
};

/**
 * Returns the local path to a category's SFX file, downloading it on first use.
 * Falls back to null if download fails (caller should treat as "skip overlay").
 */
async function getSfxPath(category) {
  const meta = SFX_CATALOG[category];
  if (!meta && !SFX_SYNTH[category]) return null;
  const filePath = path.join(SFX_DIR, `${category}.mp3`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1024) {
    return filePath;
  }
  // L109 — try CDN download first if URL configured. Falls back to local
  // ffmpeg synthesis if download fails. SFX synth is deterministic + offline.
  if (meta && meta.url) {
    try {
      const r = await fetch(meta.url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'antigravity-pipeline/1.0' } });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 1024) {
          fs.writeFileSync(filePath, buf);
          return filePath;
        }
      }
    } catch (_) { /* network failed — fall through to synth */ }
  }
  // Fallback: ffmpeg synthesis
  if (SFX_SYNTH[category]) {
    const ok = synthSfx(category, filePath);
    if (ok) return filePath;
  }
  return null;
}

function listCategories() {
  return Object.keys(SFX_CATALOG);
}

/**
 * Build a ffmpeg amix filter chain that overlays SFX at the given timestamps
 * on top of an existing audio stream.
 *
 * @param {object} opts
 * @param {string} opts.mainAudioLabel   e.g. '0:a' (the source audio)
 * @param {string} opts.outLabel         e.g. 'aout'
 * @param {Array<{t:number, category:string, gainDb:number}>} opts.overlays
 *   each overlay places category's SFX at time t, attenuated by gainDb (typically -3 to -9)
 * @param {Array<string>} opts.sfxPaths  parallel to overlays, the resolved file paths
 *                                       (caller must getSfxPath() each first)
 * @returns {{filter:string, inputArgs:Array<string>, outLabel:string}}
 */
function buildSfxOverlayChain(opts) {
  const mainAudioLabel = String((opts && opts.mainAudioLabel) || '0:a').replace(/[\[\]]/g, '');
  const outLabel = String((opts && opts.outLabel) || 'aout').replace(/[\[\]]/g, '');
  const overlays = Array.isArray(opts.overlays) ? opts.overlays : [];
  const sfxPaths = Array.isArray(opts.sfxPaths) ? opts.sfxPaths : [];

  if (overlays.length === 0 || sfxPaths.length === 0) {
    return { filter: `[${mainAudioLabel}]anull[${outLabel}]`, inputArgs: [], outLabel };
  }

  const inputArgs = [];
  const sfxStreams = [];
  let inputIdx = 1; // 0 is the main audio
  for (let i = 0; i < overlays.length; i++) {
    if (!sfxPaths[i]) continue;
    const ov = overlays[i];
    const tMs = Math.max(0, Math.round((ov.t || 0) * 1000));
    const gainDb = Number(ov.gainDb ?? -6);
    inputArgs.push('-i', sfxPaths[i]);
    sfxStreams.push({ inputIdx, tMs, gainDb });
    inputIdx++;
  }

  if (sfxStreams.length === 0) {
    return { filter: `[${mainAudioLabel}]anull[${outLabel}]`, inputArgs: [], outLabel };
  }

  // For each SFX: adelay to the target time, volume to gainDb, then amix all + main.
  const filterParts = [];
  const mixLabels = [`${mainAudioLabel}`];
  for (let i = 0; i < sfxStreams.length; i++) {
    const s = sfxStreams[i];
    const inLabel = `${s.inputIdx}:a`;
    const outIntLabel = `s${i}`;
    filterParts.push(`[${inLabel}]adelay=${s.tMs}|${s.tMs},volume=${s.gainDb}dB[${outIntLabel}]`);
    mixLabels.push(outIntLabel);
  }
  filterParts.push(`${mixLabels.map((l) => `[${l}]`).join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0,volume=1.0[${outLabel}]`);

  return { filter: filterParts.join(';'), inputArgs, outLabel };
}

/**
 * Resolve a list of overlays to (overlay + sfxPath) pairs, downloading missing SFX.
 */
async function resolveOverlays(overlays) {
  const resolved = [];
  const sfxPaths = [];
  for (const ov of overlays) {
    const p = await getSfxPath(ov.category);
    resolved.push(ov);
    sfxPaths.push(p);
  }
  return { overlays: resolved, sfxPaths };
}

module.exports = { getSfxPath, listCategories, buildSfxOverlayChain, resolveOverlays, SFX_CATALOG, SFX_DIR };

if (require.main === module) {
  require('./env-d-drive-only');
  (async () => {
    const cat = process.argv[2] || 'vine-boom';
    console.log('SFX_DIR:', SFX_DIR);
    console.log('categories:', listCategories());
    const p = await getSfxPath(cat);
    console.log(`${cat} →`, p);
    if (p) console.log('size:', fs.statSync(p).size, 'bytes');
  })();
}
