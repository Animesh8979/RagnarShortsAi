/**
 * lib/clip-source-fetcher.js — MASTER-REBUILD Phase 4
 *
 * Downloads a candidate creator-clip source at HD (≥720p, prefer ≥1080p),
 * gates it through assessSourceQuality(), and exposes a candidate-ranking
 * function that prefers well-lit 1080p/4K sources over dim handheld.
 *
 * Wires into the daily-auto clipping path. Replaces the previous yt-dlp
 * default that pulled 360p single-file mp4 (format 18) which made the
 * jet-clip A-roll dark + soft + low-bitrate.
 *
 * Usage from the clip orchestrator:
 *   const { downloadHd, rankCandidates } = require('./lib/clip-source-fetcher');
 *   const best = await rankCandidates(candidates);   // picks the brightest, highest-quality source
 *   const dl = await downloadHd(best.url, cacheDir); // ≥720p mp4 with merged audio
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ss = require('./split-screen');

const ROOT = path.resolve(__dirname, '..');
const YT_DLP = (() => {
  const root = path.join(ROOT, 'yt-dlp.exe');
  if (fs.existsSync(root)) return root;
  return 'yt-dlp';
})();

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

/**
 * yt-dlp HD format selector (MASTER-REBUILD Fix 1):
 *   - PREFER ≥1080p mp4 + best audio, merged
 *   - FALL BACK to ≥720p
 *   - REJECT anything below 720p (returns ok:false)
 *
 * @param {string} url    full YouTube URL
 * @param {string} outDir
 * @param {object} [opts]
 * @param {string} [opts.basename]  output filename without ext (default videoId)
 * @returns {Promise<{ok:boolean, path?:string, height?:number, reason?:string}>}
 */
async function downloadHd(url, outDir, opts = {}) {
  ensureDir(outDir);
  const videoId = extractVideoId(url) || 'unknown';
  const base = opts.basename || videoId;
  const outPath = path.join(outDir, `${base}.mp4`);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1_000_000) {
    // Probe to confirm it's actually HD; if not, re-download
    const probe = ss.probeSource(outPath);
    if (probe && probe.height >= 720) {
      return { ok: true, path: outPath, height: probe.height, cached: true };
    }
    // Force re-download of low-res cached file
    try { fs.unlinkSync(outPath); } catch (_) {}
  }

  // HD format selector — master-rebuild Fix 1
  const formatSpec = 'bestvideo[height>=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height>=720]+bestaudio/best[height>=720]';
  // D:\-only constraint: pass --cache-dir so yt-dlp stays off C:\.
  const ytdlpCache = process.env.YTDLP_CACHE_DIR || require('path').join(__dirname, '..', '.runtime-cache', 'yt-dlp-cache');
  const args = [
    '--cache-dir', ytdlpCache,
    '-f', formatSpec,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--no-progress',
    '-o', outPath,
    url,
  ];

  const r = spawnSync(YT_DLP, args, { encoding: 'utf8', timeout: 600_000 });
  if (r.status !== 0 || !fs.existsSync(outPath)) {
    return { ok: false, reason: 'yt-dlp_failed', stderr: r.stderr ? r.stderr.slice(-600) : '', stdout: r.stdout ? r.stdout.slice(-300) : '' };
  }
  const probe = ss.probeSource(outPath);
  if (!probe) return { ok: false, reason: 'probe_failed_after_download' };
  if (probe.height < 720) {
    // The format selector should have rejected this, but as a defense in depth:
    try { fs.unlinkSync(outPath); } catch (_) {}
    return { ok: false, reason: `below_720p_after_download_${probe.height}p` };
  }
  return { ok: true, path: outPath, height: probe.height, width: probe.width, durationSec: probe.durationSec, bitrate: probe.bitrate };
}

function extractVideoId(url) {
  const m = String(url || '').match(/(?:v=|\/shorts\/|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/**
 * Rank candidate clip sources (master-rebuild Fix 6):
 *   1. Download each candidate at HD via downloadHd()
 *   2. Run assessSourceQuality() to filter low-res / too-dark / too-short
 *   3. Score remaining by lightingScore — prefer 90-180 YAVG (well-exposed)
 *   4. Sort and return the candidates passing the gate, best first
 *
 * @param {Array<{url:string, creator?:string}>} candidates
 * @param {string} cacheDir
 * @returns {Promise<{passed:Array, rejected:Array}>}
 */
async function rankCandidates(candidates, cacheDir) {
  const passed = [];
  const rejected = [];
  for (const c of (candidates || [])) {
    const dl = await downloadHd(c.url, cacheDir);
    if (!dl.ok) { rejected.push({ ...c, ok: false, stage: 'download', reason: dl.reason }); continue; }
    const q = ss.assessSourceQuality(dl.path);
    if (!q.ok) { rejected.push({ ...c, ok: false, stage: 'quality_gate', reason: q.reason, probe: q.probe }); continue; }
    passed.push({ ...c, ok: true, sourcePath: dl.path, probe: q.probe, yavg: q.yavg, lightingScore: q.lightingScore });
  }
  // Rank by lightingScore desc, then bitrate desc
  passed.sort((a, b) => (b.lightingScore - a.lightingScore) || (b.probe.bitrate - a.probe.bitrate));
  return { passed, rejected };
}

module.exports = { downloadHd, rankCandidates, extractVideoId };

if (require.main === module) {
  const url = process.argv[2];
  if (!url) { console.error('Usage: node lib/clip-source-fetcher.js <youtube-url>'); process.exit(2); }
  const cacheDir = path.join(ROOT, 'renders', 'creator-clips', 'source-cache');
  downloadHd(url, cacheDir).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
