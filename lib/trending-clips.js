/**
 * lib/trending-clips.js — discover viable HD creator videos for clipping
 *
 * For the creator-clip lane (RagnarShortsUltimate + IG):
 *   1. Walk a curated CREATORS list (master-rebuild banned: Triggered Insaan,
 *      all Indian-creator clipping IP, Squid Game / Netflix IP).
 *   2. Probe latest N uploads per creator via yt-dlp --flat-playlist + -F.
 *   3. Filter to ≥1080p, ≥800kbps, ≥8min, with `assessSourceQuality` cleared
 *      after a short probe download (or by format-table inspection only).
 *   4. Return ranked candidates: { videoId, url, creator, durationSec,
 *      height, bitrate, lightingScore? }
 *
 * Caller: lib/daily-fresh-batch.js picks the top N, downloads, cuts moments,
 * runs daily-clip-v8 split-screen.
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const YT_DLP = path.join(ROOT, 'yt-dlp.exe');

// Allowed creators — all explicitly excluded by master-rebuild are filtered out.
// Default channels are western creators with HD uploads + commercial-mitigation precedent.
const DEFAULT_CREATORS = [
  { name: 'MrBeast',        url: 'https://www.youtube.com/@MrBeast/videos',        category: 'challenge' },
  { name: 'IShowSpeed',     url: 'https://www.youtube.com/@IShowSpeed/videos',     category: 'gaming'    },
];

// Hard ban list (case-insensitive substring match against creator name OR title).
const BANNED_PATTERNS = [
  /triggered\s*insaan/i,
  /squid\s*game/i,
  /netflix/i,
  /carryminati/i,
];

// D:\-only constraint: pass --cache-dir explicitly so yt-dlp doesn't fall
// back to %USERPROFILE%\AppData\Local\yt-dlp (C:). Env var YTDLP_CACHE_DIR
// set by env-d-drive-only.js as a belt-and-suspenders.
const YTDLP_CACHE_DIR = process.env.YTDLP_CACHE_DIR || require('path').join(ROOT, '.runtime-cache', 'yt-dlp-cache');

function listPlaylistRecent(creator, n = 12) {
  if (!fs.existsSync(YT_DLP)) return [];
  const r = spawnSync(YT_DLP, [
    '--cache-dir', YTDLP_CACHE_DIR,
    '--flat-playlist',
    '--print', '%(id)s\t%(title)s\t%(duration)s',
    '--playlist-end', String(n),
    creator.url,
  ], { encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) return [];
  const lines = (r.stdout || '').split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const [id, title, durStr] = line.split('\t');
    return { id, title, duration: Number(durStr) || 0, creator: creator.name, category: creator.category, url: `https://www.youtube.com/watch?v=${id}` };
  });
}

function probeHd(videoId) {
  if (!fs.existsSync(YT_DLP)) return null;
  const r = spawnSync(YT_DLP, ['--cache-dir', YTDLP_CACHE_DIR, '-F', `https://www.youtube.com/watch?v=${videoId}`], { encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) return null;
  const lines = (r.stdout || '').split(/\r?\n/);
  const formats = [];
  for (const line of lines) {
    const m = /^([\w-]+)\s+(\w+)\s+(\d+)x(\d+)\s+(\d+)?[\s|]*.*?(\d+)k\s+https/.exec(line.trim());
    if (m) {
      const height = Number(m[4]);
      const bitrateK = Number(m[6]);
      if (height && bitrateK) formats.push({ formatId: m[1], height, bitrateK });
    }
  }
  if (!formats.length) return null;
  // Best-by-height with bitrate tiebreaker.
  formats.sort((a, b) => (b.height - a.height) || (b.bitrateK - a.bitrateK));
  return formats[0];
}

function isBanned(item) {
  const blob = `${item.creator} ${item.title}`;
  return BANNED_PATTERNS.some((re) => re.test(blob));
}

function loadAlreadyClippedUrls() {
  const clipped = new Set();
  const rendersDir = path.join(ROOT, 'renders');
  if (!fs.existsSync(rendersDir)) return clipped;
  try {
    const files = fs.readdirSync(rendersDir).filter(f => f.startsWith('fresh-batch-') && f.endsWith('.json') && !f.includes('upload'));
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(rendersDir, file), 'utf8'));
        if (content && Array.isArray(content.clips)) {
          for (const clip of content.clips) {
            if (clip && clip.ok && clip.spec && clip.spec.sourceUrl) {
              clipped.add(clip.spec.sourceUrl.trim());
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
  return clipped;
}

/**
 * discoverHdClips({ creators, minDurationSec, minHeight, perCreator })
 *   → array of { id, title, url, creator, category, duration, bestFormat }
 */
async function discoverHdClips({
  creators = DEFAULT_CREATORS,
  minDurationSec = 8 * 60,
  minHeight = 1080,
  perCreator = 8,
  maxResults = 12,
} = {}) {
  const alreadyClipped = loadAlreadyClippedUrls();
  const candidates = [];

  for (const creator of creators) {
    const recent = listPlaylistRecent(creator, perCreator);
    for (const item of recent) {
      if (alreadyClipped.has(item.url.trim())) {
        console.log(`  [dedupe] skipping already clipped video: ${item.creator} - ${item.title}`);
        continue;
      }
      if (isBanned(item)) continue;
      if (item.duration && item.duration < minDurationSec) continue;
      const best = probeHd(item.id);
      if (!best || best.height < minHeight) continue;
      candidates.push({ ...item, bestFormat: best });
    }
  }

  // Group candidates by creator
  const byCreator = {};
  for (const item of candidates) {
    if (!byCreator[item.creator]) byCreator[item.creator] = [];
    byCreator[item.creator].push(item);
  }

  // Sort each creator's candidates by height desc to ensure highest quality first
  const creatorNames = Object.keys(byCreator);
  for (const name of creatorNames) {
    byCreator[name].sort((a, b) => b.bestFormat.height - a.bestFormat.height);
  }

  // Round-robin merge them to ensure exact creator balance (alternating creators)
  const merged = [];
  let maxLen = 0;
  for (const name of creatorNames) {
    maxLen = Math.max(maxLen, byCreator[name].length);
  }

  for (let i = 0; i < maxLen; i++) {
    for (const name of creatorNames) {
      if (byCreator[name][i]) {
        merged.push(byCreator[name][i]);
      }
    }
  }

  return merged.slice(0, maxResults);
}

module.exports = { discoverHdClips, DEFAULT_CREATORS, BANNED_PATTERNS };

if (require.main === module) {
  discoverHdClips({ perCreator: 6, maxResults: 12 }).then((arr) => {
    console.log('=== HD CREATOR CLIP CANDIDATES (' + arr.length + ') ===');
    for (const r of arr) {
      console.log(`[${r.bestFormat.height}p, ${r.bestFormat.bitrateK}kbps, ${Math.round(r.duration/60)}min] ${r.creator} — ${r.title}  ${r.url}`);
    }
  }).catch((e) => { console.error(e); process.exit(1); });
}
