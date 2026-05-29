/**
 * lib/person-portrait.js
 *
 * When a beat's visualPrompt contains the marker `[PORTRAIT:<canonical name>]`
 * (e.g. `[PORTRAIT:JD Vance]`), resolve the named person to their real
 * Wikimedia Commons portrait and return a path to a downloaded 1080×1920
 * (vertical, centred) JPG ready to drop into the beat slot.
 *
 * Why: when the script says "Vance flew to Doha", the viewer expects to SEE
 * Vance — not a random podium speaker from Pexels stock. Wikipedia + Wikimedia
 * Commons have free, commercial-safe portraits of basically every world
 * leader / major politician / celebrity.
 *
 * Fallback chain inside getPortrait():
 *   1. Wikipedia REST API → page summary's `originalimage` URL (best quality)
 *   2. Wikipedia REST API → `thumbnail` URL
 *   3. Wikimedia Commons search → first portrait result
 *   4. null → caller falls back to FLUX / Pexels
 *
 * Output: { ok, path?, source?, name?, reason? }
 *   path is 1080×1920 vertical JPG (portrait centred, blurred-fill bg, padded).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const { spawnSync } = require('child_process');
const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'person-portraits');
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}

/**
 * Extracts the canonical person name from `[PORTRAIT:<name>]` markers in a prompt.
 * Returns the first match (canonical name as-typed), or null.
 */
function extractPortraitMarker(visualPrompt) {
  const m = String(visualPrompt || '').match(/\[PORTRAIT:([^\]]+)\]/i);
  if (!m) return null;
  return m[1].trim();
}

/**
 * Hits Wikipedia REST API /page/summary to fetch a person's lead image URL.
 * Returns { url, sourceLabel } or null.
 */
async function fetchWikipediaSummary(name) {
  const slug = encodeURIComponent(name.replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'antigravity-pipeline/1.0 (https://github.com/USER/antigravity; contact@example.com)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Prefer originalimage (higher res) → fall to thumbnail
    const imgUrl = (j.originalimage && j.originalimage.source) || (j.thumbnail && j.thumbnail.source) || null;
    if (!imgUrl) return null;
    return { url: imgUrl, sourceLabel: 'wikipedia-summary', pageTitle: j.title };
  } catch (_) {
    return null;
  }
}

/**
 * Wikimedia Commons search for portraits when the Wikipedia page doesn't
 * have a lead image (rare for politicians but happens).
 */
async function fetchCommonsPortrait(name) {
  const q = `${name} portrait`;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srnamespace=6&format=json&srlimit=5`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'antigravity-pipeline/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const first = j.query && j.query.search && j.query.search[0];
    if (!first) return null;
    // first.title is like "File:JD Vance official photo.jpg"
    const fileName = String(first.title || '').replace(/^File:/, '');
    // Use Commons Special:FilePath redirector for a direct binary URL
    const directUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
    return { url: directUrl, sourceLabel: 'wikimedia-commons', pageTitle: fileName };
  } catch (_) {
    return null;
  }
}

/**
 * Download URL to a path; returns true on success.
 */
async function download(url, outPath) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'antigravity-pipeline/1.0' },
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
    });
    if (!r.ok) return false;
    const buf = await r.arrayBuffer();
    fs.writeFileSync(outPath, Buffer.from(buf));
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 4096;
  } catch (_) { return false; }
}

/**
 * Normalize a downloaded portrait to 1080×1920 vertical with blurred-fill
 * background and centred subject. ffmpeg one-shot.
 */
function normalizeToVertical(inputPath, outputPath) {
  // Two-pass video filter chain:
  //   [bg]: scale input to 1080x1920 with stretch + heavy gaussian blur → background fill
  //   [fg]: scale input to fit inside 1080x1920 keeping aspect → foreground
  //   overlay fg centred on bg
  const vf = [
    `[0:v]split=2[bg][fg]`,
    `[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=luma_radius=30:luma_power=2,setsar=1[bgblur]`,
    `[fg]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fgsc]`,
    `[bgblur][fgsc]overlay=(W-w)/2:(H-h)/2,format=yuv420p`,
  ].join(';');
  const r = spawnSync(FFMPEG, [
    '-y', '-i', inputPath,
    '-filter_complex', vf,
    '-frames:v', '1',
    '-q:v', '2',
    outputPath,
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 4096) {
    return false;
  }
  return true;
}

/**
 * Main entry. Resolves a `[PORTRAIT:<name>]` marker (or a raw name) to a
 * vertical 1080×1920 JPG path.
 *
 * @param {object} opts
 * @param {string} opts.name           Canonical name to look up (e.g. "JD Vance").
 * @returns {Promise<{ok:boolean, path?:string, source?:string, name?:string, reason?:string}>}
 */
async function getPortrait(opts = {}) {
  const name = String(opts.name || '').trim();
  if (!name || name.length < 2) return { ok: false, reason: 'no_name' };

  // Cache key: sanitised name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outPath = path.join(CACHE_DIR, `${slug}-1080x1920.jpg`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 4096) {
    return { ok: true, path: outPath, source: 'cache', name };
  }

  // Try Wikipedia summary first.
  let imgRef = await fetchWikipediaSummary(name);
  if (!imgRef) imgRef = await fetchCommonsPortrait(name);
  if (!imgRef) return { ok: false, reason: 'no_portrait_found', name };

  // Download to a temp file using the original extension if recognizable.
  const tmpPath = path.join(CACHE_DIR, `${slug}-raw${path.extname(new URL(imgRef.url).pathname) || '.jpg'}`);
  const dlOk = await download(imgRef.url, tmpPath);
  if (!dlOk) return { ok: false, reason: 'download_failed', source: imgRef.sourceLabel, name };

  // Normalize to 1080x1920 vertical.
  const normOk = normalizeToVertical(tmpPath, outPath);
  if (!normOk) return { ok: false, reason: 'ffmpeg_normalize_failed', name };
  try { fs.unlinkSync(tmpPath); } catch (_) {}

  return { ok: true, path: outPath, source: imgRef.sourceLabel, name, pageTitle: imgRef.pageTitle };
}

module.exports = { extractPortraitMarker, getPortrait };

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const name = process.argv.slice(2).join(' ') || 'JD Vance';
    console.log('Resolving:', name);
    const r = await getPortrait({ name });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  })();
}
