/**
 * lib/reddit-clips.js — L109 P2
 *
 * Fetch viral video posts from high-yield subreddits as clip candidates.
 * Reddit v.redd.it videos are user-uploaded → fair-use generally clean.
 *
 * Sources (per Agent 2 research, ranked by clip-yield + brand-safety):
 *   r/nextfuckinglevel      — skill clips, mostly SFW
 *   r/Damnthatsinteresting  — educational, perfect for explainer overlays
 *   r/BeAmazed              — skill/talent
 *   r/HumansBeingBros       — wholesome
 *   r/MadeMeSmile           — wholesome
 *   r/InterestingAsFuck     — mixed
 *   r/blackmagicfuckery     — optical illusions
 *   r/oddlysatisfying       — loop-friendly
 *   r/AnimalsBeingDerps     — pet content (guaranteed engagement)
 *
 * Fetch via reddit.com/r/X/top.json?t=day (no auth, 60 req/min anon).
 *
 * Exports:
 *   - discoverRedditClips(opts) → array of { id, title, url, sourceSubreddit, videoUrl, score, comments, isVideo }
 */

'use strict';

const fetch = require('node-fetch');

const HIGH_YIELD_SUBS = [
  { name: 'nextfuckinglevel',     brandSafety: 'high', category: 'skill' },
  { name: 'Damnthatsinteresting', brandSafety: 'high', category: 'educational' },
  { name: 'BeAmazed',             brandSafety: 'high', category: 'skill' },
  { name: 'HumansBeingBros',      brandSafety: 'high', category: 'wholesome' },
  { name: 'MadeMeSmile',          brandSafety: 'high', category: 'wholesome' },
  { name: 'blackmagicfuckery',    brandSafety: 'high', category: 'illusion' },
  { name: 'oddlysatisfying',      brandSafety: 'high', category: 'satisfying' },
  { name: 'AnimalsBeingDerps',    brandSafety: 'high', category: 'pets' },
  { name: 'InterestingAsFuck',    brandSafety: 'med',  category: 'misc' },
  { name: 'Unexpected',           brandSafety: 'med',  category: 'viral' },
];

const BANNED_KEYWORDS = [
  /\b(nazi|hitler|isis|gore|graphic|nsfw|porn|nude)\b/i,
  /\b(suicide|kill\s*your)/i,
];

function isBannedPost(post) {
  const blob = `${post.title || ''} ${post.subreddit || ''}`;
  return BANNED_KEYWORDS.some((re) => re.test(blob));
}

async function fetchSubredditTop(subName, timeWindow = 'day', limit = 25) {
  const url = `https://www.reddit.com/r/${subName}/top.json?t=${timeWindow}&limit=${limit}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'antigravity-pipeline/1.0 (clip-discovery)' },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const posts = (j.data && j.data.children || []).map((c) => c.data);
    return posts;
  } catch (_) { return []; }
}

/**
 * Filter posts to: video-only, high engagement, brand-safe, with duration ≥ 8s.
 * Returns canonical clip-candidate shape compatible with trending-clips.js consumers.
 */
function postsToClipCandidates(posts, subMeta) {
  const out = [];
  for (const p of posts) {
    if (!p.is_video) continue;
    if (p.over_18) continue;
    if (isBannedPost(p)) continue;
    const media = p.media && p.media.reddit_video;
    if (!media || !media.fallback_url) continue;
    const dur = Number(media.duration || 0);
    if (dur < 8 || dur > 480) continue; // 8s–8min
    if ((p.score || 0) < 100) continue; // engagement floor
    out.push({
      id: p.id,
      title: p.title,
      url: 'https://www.reddit.com' + p.permalink,
      videoUrl: media.fallback_url,        // direct v.redd.it MP4
      hlsUrl: media.hls_url,
      height: media.height,
      width: media.width,
      durationSec: dur,
      score: p.score,
      comments: p.num_comments || 0,
      sourceSubreddit: subMeta.name,
      brandSafety: subMeta.brandSafety,
      category: subMeta.category,
      createdUtc: p.created_utc,
    });
  }
  return out;
}

/**
 * Discover top viral Reddit video posts across high-yield subs.
 *
 * @param {object} opts
 * @param {Array<string>} [opts.subreddits]  override which subs to scan
 * @param {string} [opts.timeWindow='day']   'hour' | 'day' | 'week'
 * @param {number} [opts.perSub=15]
 * @param {number} [opts.maxResults=20]
 * @returns {Promise<Array>}
 */
async function discoverRedditClips(opts = {}) {
  const subs = (opts.subreddits && opts.subreddits.length)
    ? HIGH_YIELD_SUBS.filter((s) => opts.subreddits.includes(s.name))
    : HIGH_YIELD_SUBS;
  const timeWindow = opts.timeWindow || 'day';
  const perSub = opts.perSub || 15;
  const maxResults = opts.maxResults || 20;

  const candidates = [];
  for (const sub of subs) {
    const posts = await fetchSubredditTop(sub.name, timeWindow, perSub);
    const cands = postsToClipCandidates(posts, sub);
    candidates.push(...cands);
    // Be polite to reddit's free tier
    await new Promise((res) => setTimeout(res, 500));
  }

  // Sort by score + comments weight
  candidates.sort((a, b) => (b.score + 2 * b.comments) - (a.score + 2 * a.comments));

  // Dedupe across subs (rare but possible)
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    unique.push(c);
    if (unique.length >= maxResults) break;
  }

  return unique;
}

module.exports = { discoverRedditClips, HIGH_YIELD_SUBS };

if (require.main === module) {
  require('./env-d-drive-only');
  discoverRedditClips({ timeWindow: 'day', perSub: 10, maxResults: 10 }).then((clips) => {
    console.log(`discovered ${clips.length} Reddit clip candidates`);
    for (const c of clips) console.log(`  [${c.sourceSubreddit}] ${c.score} pts ${c.durationSec}s — ${c.title.slice(0, 70)}`);
    if (clips.length) {
      console.log('\nsample full record:');
      console.log(JSON.stringify(clips[0], null, 2));
    }
  });
}
