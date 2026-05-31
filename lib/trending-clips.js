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
// L109 P2 — expanded from 2 → 9 creators per 2026-Q1 growth-manager research.
// Tagged with clip-friendliness: chill = no claim history; med = some claims; risk = recent strikes.
const DEFAULT_CREATORS = [
  { name: 'MrBeast',         url: 'https://www.youtube.com/@MrBeast/videos',         category: 'challenge', clipRisk: 'med'   },
  { name: 'IShowSpeed',      url: 'https://www.youtube.com/@IShowSpeed/videos',      category: 'gaming',    clipRisk: 'med'   },
  { name: 'KillTony',        url: 'https://www.youtube.com/@KillTony/videos',        category: 'podcast',   clipRisk: 'chill' },
  { name: 'TheoVon',         url: 'https://www.youtube.com/@TheoVon/videos',         category: 'podcast',   clipRisk: 'chill' },
  { name: 'callherdaddy',    url: 'https://www.youtube.com/@callherdaddy/videos',    category: 'podcast',   clipRisk: 'chill' },
  { name: 'ClubShayShay',    url: 'https://www.youtube.com/@ClubShayShay/videos',    category: 'podcast',   clipRisk: 'chill' },
  { name: 'MoistCr1TiKaL',   url: 'https://www.youtube.com/@MoistCr1TiKaL/videos',   category: 'reaction',  clipRisk: 'chill' },
  { name: 'KaiCenat',        url: 'https://www.youtube.com/@KaiCenat/videos',        category: 'streamer',  clipRisk: 'chill' },
  { name: 'PBDPodcast',      url: 'https://www.youtube.com/@PBDPodcast/videos',      category: 'podcast',   clipRisk: 'chill' },
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
  // UPGRADE (user: "clips are not the trending ones"): rank a creator's RECENT
  // uploads by VIEW COUNT and clip their actual hit, not just the newest upload.
  // --flat-playlist returns view_count=NA for channel grids, so we full-extract a
  // small recent pool (gets real views, ~2-3s/video) and sort by views. Falls
  // back to fast flat-playlist (newest order) if full extract yields nothing, so
  // discovery never breaks. Tunable: CLIP_TRENDING_POOL.
  const pool = Math.max(3, Number(process.env.CLIP_TRENDING_POOL || 6));
  let items = [];
  try {
    const r = spawnSync(YT_DLP, [
      '--cache-dir', YTDLP_CACHE_DIR, '--no-warnings',
      '--print', '%(id)s\t%(title)s\t%(duration)s\t%(view_count)s',
      '--playlist-end', String(pool),
      creator.url,
    ], { encoding: 'utf8', timeout: 120_000 });
    if (r.status === 0) {
      items = (r.stdout || '').split(/\r?\n/).filter(Boolean).map((line) => {
        const [id, title, durStr, viewStr] = line.split('\t');
        const views = Number(viewStr);
        return { id, title, duration: Number(durStr) || 0, creator: creator.name, category: creator.category, url: `https://www.youtube.com/watch?v=${id}`, viewCount: Number.isFinite(views) ? views : 0 };
      });
    }
  } catch (_) {}
  if (items.length && items.some((it) => it.viewCount > 0)) {
    // Most-viewed-recent first = the trending pick. Keep all so dedup/quality
    // gates can fall through to next-best if the top is unusable.
    items.sort((a, b) => b.viewCount - a.viewCount);
    return items;
  }
  // Fallback: fast flat-playlist, newest-first (no view signal available).
  const fr = spawnSync(YT_DLP, [
    '--cache-dir', YTDLP_CACHE_DIR, '--flat-playlist',
    '--print', '%(id)s\t%(title)s\t%(duration)s',
    '--playlist-end', String(n), creator.url,
  ], { encoding: 'utf8', timeout: 60_000 });
  if (fr.status !== 0) return items;
  return (fr.stdout || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, title, durStr] = line.split('\t');
    return { id, title, duration: Number(durStr) || 0, creator: creator.name, category: creator.category, url: `https://www.youtube.com/watch?v=${id}`, viewCount: 0 };
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
 * discoverHdClips({ creators, minDurationSec, minHeight, perCreator, horrorPriority })
 *   → array of { id, title, url, creator, category, duration, bestFormat, isHorror, mode }
 *
 * L107+ horror-aware:
 *   - Each candidate is tagged with isHorror (via lib/horror-detector.js title regex).
 *   - Each candidate's `mode` is 'full_frame_horror' for IShowSpeed horror VODs,
 *     otherwise 'split_screen' (legacy). lib/daily-clip-v8.js reads this to pick
 *     the right ffmpeg branch in split-screen.js.
 *   - When `horrorPriority` is true, IShowSpeed horror candidates are sorted
 *     first AND the curated list from horror-detector.js is seeded into the
 *     candidate pool (catches videos older than perCreator).
 */
async function discoverHdClips({
  creators = DEFAULT_CREATORS,
  minDurationSec = 8 * 60,
  minHeight = 1080,
  perCreator = 8,
  maxResults = 12,
  horrorPriority = true,
} = {}) {
  const { isHorror, getCuratedHorrorVODs } = require('./horror-detector');
  const alreadyClipped = loadAlreadyClippedUrls();
  const candidates = [];

  // L110 T0.1 — reorder creators by the performance-weighted ranker so the
  // day's clips come from creators ACTUALLY gaining us views (× freshness
  // exploration). Self-converges on winners. Disable via SKIP_CREATOR_RANK=1.
  if (process.env.SKIP_CREATOR_RANK !== '1') {
    try {
      const { rankedCreatorNames } = require('./clip-creator-ranker');
      const order = rankedCreatorNames();
      if (order.length) {
        const rank = (name) => { const i = order.indexOf(name); return i < 0 ? 999 : i; };
        creators = creators.slice().sort((a, b) => rank(a.name) - rank(b.name));
        console.log(`[creator-rank] order: ${creators.map((c) => c.name).slice(0, 5).join(' > ')}...`);
      }
    } catch (e) {
      console.log(`[creator-rank] skipped: ${(e && e.message || e).slice(0, 100)}`);
    }
  }

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
      const horror = isHorror(item.title);
      candidates.push({
        ...item,
        bestFormat: best,
        isHorror: horror,
        mode: horror ? 'full_frame_horror' : 'split_screen',
      });
    }
  }

  // L107+ horror priority: seed curated IShowSpeed horror VODs that may be
  // older than the `perCreator` recent window. These are known-good clips
  // with verified hot moments.
  if (horrorPriority) {
    const seeded = getCuratedHorrorVODs('IShowSpeed');
    for (const v of seeded) {
      if (alreadyClipped.has(v.sourceUrl.trim())) continue;
      if (candidates.some((c) => c.id === v.videoId)) continue;
      const best = probeHd(v.videoId);
      if (!best || best.height < minHeight) continue;
      candidates.push({
        id: v.videoId,
        title: v.title,
        url: v.sourceUrl,
        creator: 'IShowSpeed',
        category: 'gaming-horror',
        duration: v.durationMin * 60,
        bestFormat: best,
        isHorror: true,
        mode: 'full_frame_horror',
        hotMoments: v.hotMoments,
        seededFromCurated: true,
      });
      console.log(`  [horror-seed] ${v.videoId} → ${v.title}`);
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
