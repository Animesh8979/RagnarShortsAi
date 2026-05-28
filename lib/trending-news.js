/**
 * lib/trending-news.js — fetch + rank trending world-news topics
 *
 * Pulls headlines from 3 free, no-key RSS feeds:
 *   - Reuters World      (https://www.reutersagency.com/feed/?best-topics=international)
 *   - The Hindu world    (https://www.thehindu.com/news/international/feeder/default.rss)
 *   - Al Jazeera English (https://www.aljazeera.com/xml/rss/all.xml)
 *
 * Deduplicates by title similarity, filters to last 36h, ranks by:
 *   - recency (newer = higher)
 *   - signal keywords (war, strike, oil, election, sanctions, deal, etc.)
 *   - cross-source overlap (story appears in ≥2 feeds = trending)
 *
 * Output: array of `{ title, summary, link, sources, score, publishedAt }`.
 * Caller (lib/script-from-trending.js) writes ~80-word scripts.
 *
 * Zero key cost. RSS is open. yt-dlp / wget not needed; node-fetch is enough.
 */
'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fetch = require('node-fetch');

const FEEDS = [
  { name: 'reuters-world', url: 'https://www.reutersagency.com/feed/?best-topics=international&post_type=best', weight: 1.0 },
  { name: 'thehindu-world', url: 'https://www.thehindu.com/news/international/feeder/default.rss', weight: 0.9 },
  { name: 'aljazeera',     url: 'https://www.aljazeera.com/xml/rss/all.xml', weight: 0.9 },
  { name: 'bbc-world',     url: 'http://feeds.bbci.co.uk/news/world/rss.xml', weight: 1.0 },
];

const SIGNAL_KEYWORDS = [
  'war', 'strike', 'missile', 'oil', 'sanction', 'election', 'tariff', 'invasion',
  'attack', 'killed', 'arrested', 'leak', 'breach', 'crisis', 'protest', 'coup',
  'nuclear', 'border', 'alliance', 'deal', 'summit', 'treaty', 'embassy', 'jet',
  'rocket', 'drone', 'sanctions', 'breakthrough', 'collapse', 'banned',
];

const NOISE_KEYWORDS = ['horoscope', 'celebrity', 'sport', 'soccer', 'cricket', 'football'];

function parseRss(xml) {
  // Lightweight RSS/Atom parser — no extra dependency.
  const items = [];
  const itemBlocks = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const block of itemBlocks) {
    const get = (tag) => {
      const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(block);
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
    };
    const title = get('title');
    const summary = get('description') || get('summary');
    const link = (get('link') || (block.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '').trim();
    const pubRaw = get('pubDate') || get('published') || get('updated') || '';
    const publishedAt = Date.parse(pubRaw) || Date.now();
    if (title) items.push({ title, summary, link, publishedAt });
  }
  return items;
}

function normalize(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function topicSig(title) {
  const STOP = new Set(['the','a','an','of','in','on','to','for','with','and','or','but','is','it','this','that','at','by','from','as','was','are','be','will','says','said','new']);
  return new Set(normalize(title).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter += 1;
  return inter / Math.max(a.size, b.size);
}

function signalScore(item) {
  const text = (item.title + ' ' + item.summary).toLowerCase();
  let score = 0;
  for (const kw of SIGNAL_KEYWORDS) if (text.includes(kw)) score += 1;
  for (const kw of NOISE_KEYWORDS) if (text.includes(kw)) score -= 2;
  return score;
}

function recencyScore(item) {
  const ageH = (Date.now() - item.publishedAt) / 3_600_000;
  if (ageH > 36) return 0;
  return Math.max(0, 1 - ageH / 36);
}

async function fetchFeed(feed, timeoutMs = 20_000) {
  try {
    const r = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 trending-news/1.0' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = parseRss(xml);
    return items.map((it) => ({ ...it, source: feed.name, sourceWeight: feed.weight }));
  } catch (_) { return []; }
}

/**
 * fetchTrending() → ranked array of `{ title, summary, link, sources, score, publishedAt }`.
 */
async function fetchTrending({ topN = 8 } = {}) {
  const allItems = (await Promise.all(FEEDS.map((f) => fetchFeed(f)))).flat();
  // Bucket by topic-signature overlap.
  const buckets = []; // { sigs: Set merged, items: [], titles: [] }
  for (const item of allItems) {
    if (!item.title || item.title.length < 12) continue;
    if (recencyScore(item) === 0) continue;
    const sig = topicSig(item.title);
    let merged = false;
    for (const b of buckets) {
      if (jaccard(b.sigs, sig) >= 0.5) {
        b.items.push(item);
        b.titles.push(item.title);
        for (const x of sig) b.sigs.add(x);
        merged = true; break;
      }
    }
    if (!merged) buckets.push({ sigs: sig, items: [item], titles: [item.title] });
  }
  // Rank.
  const ranked = buckets.map((b) => {
    const sources = [...new Set(b.items.map((it) => it.source))];
    // Use the newest item's title as the canonical.
    b.items.sort((x, y) => y.publishedAt - x.publishedAt);
    const top = b.items[0];
    const score =
      recencyScore(top) * 2 +
      signalScore(top) +
      (sources.length - 1) * 1.5 +
      top.sourceWeight;
    return {
      title: top.title,
      summary: top.summary,
      link: top.link,
      sources,
      score: +score.toFixed(2),
      publishedAt: new Date(top.publishedAt).toISOString(),
    };
  })
  .filter((r) => r.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, topN);
  return ranked;
}

module.exports = { fetchTrending };

if (require.main === module) {
  fetchTrending({ topN: 8 }).then((arr) => {
    console.log('=== TRENDING NEWS (' + arr.length + ' topics) ===');
    for (const r of arr) {
      console.log(`[${r.score.toFixed(1)}] ${r.title}  (${r.sources.join('+')}) ${r.link}`);
    }
  }).catch((e) => { console.error(e); process.exit(1); });
}
