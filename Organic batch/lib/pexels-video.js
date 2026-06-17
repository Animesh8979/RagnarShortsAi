'use strict';

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const FFMPEG = (() => { try { return require('ffmpeg-static'); } catch (_) { return 'ffmpeg'; } })();
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'pexels-video');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

/**
 * Search and download a high-quality vertical stock video from Pexels.
 * Normalizes it to 1080x1920 30fps and clips/loops it to durationSec.
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {number} opts.durationSec
 * @returns {Promise<{ok:boolean, path?:string, provider?:string, cached?:boolean, reason?:string}>}
 */
async function getAmbientVideo({ query, durationSec }) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return { ok: false, reason: 'missing_PEXELS_API_KEY' };

  ensureDir(CACHE_DIR);
  const cacheKey = sha1(`${query}|${durationSec}`);
  const outPath = path.join(CACHE_DIR, `${cacheKey}.mp4`);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 200_000) {
    return { ok: true, path: outPath, provider: 'pexels-video', cached: true };
  }

  // Search vertical videos (portrait orientation)
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8&orientation=portrait`;
  console.log(`[pexels] Searching for: "${query}"...`);

  try {
    const resp = await fetch(url, {
      headers: { 'Authorization': apiKey }
    });

    if (!resp.ok) {
      return { ok: false, reason: `pexels_http_error_${resp.status}` };
    }

    const json = await resp.json();
    if (!Array.isArray(json.videos) || json.videos.length === 0) {
      return { ok: false, reason: 'no_videos_found' };
    }

    // Try to find a video file with good quality (like 1080x1920 or vertical)
    let bestLink = null;
    for (const video of json.videos) {
      const portraitFiles = video.video_files.filter(f => f.width < f.height || f.width / f.height < 0.6);
      if (portraitFiles.length > 0) {
        // Sort by width descending to get high resolution but avoid massive 4K
        portraitFiles.sort((a, b) => b.width - a.width);
        bestLink = portraitFiles[0].link;
        break;
      }
    }

    if (!bestLink && json.videos[0] && json.videos[0].video_files[0]) {
      // Fallback to the first video file
      bestLink = json.videos[0].video_files[0].link;
    }

    if (!bestLink) {
      return { ok: false, reason: 'no_video_files' };
    }

    console.log(`[pexels] Downloading video from Pexels...`);
    const dlResp = await fetch(bestLink);
    if (!dlResp.ok) {
      return { ok: false, reason: `download_failed_${dlResp.status}` };
    }

    const rawPath = path.join(CACHE_DIR, `${cacheKey}-raw.mp4`);
    const buf = await dlResp.buffer();
    fs.writeFileSync(rawPath, buf);

    // Normalize resolution to standard 1080x1920 30fps and trim to durationSec
    console.log(`[pexels] Normalizing to 1080x1920 30fps, duration: ${durationSec.toFixed(2)}s...`);
    const normR = spawnSync(FFMPEG, [
      '-y', '-i', rawPath,
      '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
      '-b:v', '6M', '-minrate', '5M', '-maxrate', '7M', '-bufsize', '12M',
      '-an', '-r', '30', '-t', String(durationSec.toFixed(2)),
      outPath
    ], { encoding: 'utf8' });

    try { fs.unlinkSync(rawPath); } catch (_) {}

    if (normR.status !== 0 || !fs.existsSync(outPath) || fs.statSync(outPath).size < 100_000) {
      return { ok: false, reason: 'ffmpeg_normalize_failed', stderr: (normR.stderr || '').slice(-400) };
    }

    return { ok: true, path: outPath, provider: 'pexels-video', cached: false };
  } catch (e) {
    return { ok: false, reason: `pexels_exception: ${e.message}` };
  }
}

module.exports = { getAmbientVideo };
