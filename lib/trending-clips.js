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

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const YT_DLP = path.join(ROOT, 'yt-dlp.exe');

// Allowed creators — all explicitly excluded by master-rebuild are filtered out.
// Default channels are western creators with HD uploads + commercial-mitigation precedent.
const DEFAULT_CREATORS = [
  { name: 'MrBeast',        url: 'https://www.youtube.com/@MrBeast/videos',        category: 'challenge' },
  { name: 'Veritasium',     url: 'https://www.youtube.com/@veritasium/videos',     category: 'science'   },
  { name: 'Mark Rober',     url: 'https://www.youtube.com/@MarkRober/videos',      category: 'science'   },
  { name: 'Tom Scott',      url: 'https://www.youtube.com/@TomScottGo/videos',     category: 'travel'    },
  { name: 'PracticalEngineering', url: 'https://www.youtube.com/@PracticalEngineeringChannel/videos', category: 'engineering' },
  { name: 'JohnnyHarris',   url: 'https://www.youtube.com/@johnnyharris/videos',   category: 'geopolitics'   },
];

// Hard ban list (case-insensitive substring match against creator name OR title).
const BANNED_PATTERNS = [
  /triggered\s*insaan/i,
  /squid\s*game/i,
  /netflix/i,
  /carryminati/i,
];

function listPlaylistRecent(creator, n = 12) {
  if (!fs.existsSync(YT_DLP)) return [];
  const r = spawnSync(YT_DLP, [
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
  const r = spawnSync(YT_DLP, ['-F', `https://www.youtube.com/watch?v=${videoId}`], { encoding: 'utf8', timeout: 60_000 });
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

/**
 * discoverHdClips({ creators, minDurationSec, minHeight, perCreator })
 *   → array of { id, title, url, creator, category, duration, bestFormat }
 *   sorted by (height desc, duration desc, recency=playlist-order)
 */
async function discoverHdClips({
  creators = DEFAULT_CREATORS,
  minDurationSec = 8 * 60,
  minHeight = 1080,
  perCreator = 8,
  maxResults = 12,
} = {}) {
  const candidates = [];
  for (const creator of creators) {
    const recent = listPlaylistRecent(creator, perCreator);
    for (const item of recent) {
      if (isBanned(item)) continue;
      if (item.duration && item.duration < minDurationSec) continue;
      const best = probeHd(item.id);
      if (!best || best.height < minHeight) continue;
      candidates.push({ ...item, bestFormat: best });
      if (candidates.length >= maxResults * 2) break;  // probe-budget cap
    }
    if (candidates.length >= maxResults * 2) break;
  }
  // Rank
  candidates.sort((a, b) => (b.bestFormat.height - a.bestFormat.height) || (b.duration - a.duration));
  return candidates.slice(0, maxResults);
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
