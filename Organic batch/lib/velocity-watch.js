/**
 * lib/velocity-watch.js — Phase 3.2
 *
 * Poll 5 trending sources, record per-topic mention counts into the
 * topic-velocity ledger, then run the spike detector and emit a trigger
 * file when a topic doubles across ≥3 sources in 1h.
 *
 * Designed to run every 10 minutes from a GH Actions self-hosted runner
 * (`.github/workflows/velocity-watch.yml`). Designed to be safe to call
 * back-to-back: each row is timestamped and dedupe'd by signature in the
 * detector, not on insert. No state between calls.
 *
 * Sources sampled (all free, no card):
 *   1. Reddit `/r/{worldnews,news,technology,futurology}/new.json?limit=50` — count posts per signature
 *   2. HackerNews top-50 score velocity (current_score vs prior_score in ledger)
 *   3. Google News RSS — `lib/trending-news.js` exports the parser already
 *   4. Google Trends RSS — already fetched by `trend-finder.js`
 *   5. Wikipedia trending edits — recentchanges API
 *
 * Usage:
 *   node lib/velocity-watch.js --once       # one tick + write + detect
 *   node lib/velocity-watch.js --once --emit # also emit trigger on spike
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');
const { recordSamples, detectSpikes, emitTrigger } = require('./topic-velocity');
const { buildTokenSignature } = require(path.join(ROOT, 'content-dedupe'));

const UA = 'Mozilla/5.0 (velocity-watch/1.0) NodeFetch';
const TIMEOUT_MS = 25_000;

// ── Reddit /new across 4 subs ───────────────────────────────────────────
const REDDIT_SUBS = ['worldnews', 'news', 'technology', 'futurology'];
async function sampleReddit() {
  const out = [];
  for (const sub of REDDIT_SUBS) {
    try {
      const r = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=50`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const posts = (j.data && j.data.children) || [];
      // Count posts per signature; emit one row per (sub, signature).
      const sigCounts = new Map();
      for (const p of posts) {
        const d = p.data || {};
        if (d.stickied || d.over_18) continue;
        const sig = buildTokenSignature(d.title || '');
        if (!sig) continue;
        const ent = sigCounts.get(sig) || { topic: d.title, mentions: 0, score: 0, link: `https://reddit.com${d.permalink}`, postedAt: new Date(d.created_utc * 1000).toISOString() };
        ent.mentions += 1;
        ent.score += Number(d.score) || 0;
        sigCounts.set(sig, ent);
      }
      for (const [sig, ent] of sigCounts) {
        out.push({ source: `reddit:${sub}`, signature: sig, topic: ent.topic, mentions: ent.mentions, score: ent.score, link: ent.link, postedAt: ent.postedAt });
      }
    } catch (_) {}
    await sleep(200);
  }
  return out;
}

// ── HackerNews top-50, score velocity vs prior ledger ────────────────────
async function sampleHackerNews() {
  const out = [];
  try {
    const ids = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then((r) => r.json());
    const top = (ids || []).slice(0, 50);
    for (const id of top) {
      try {
        const it = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());
        if (!it || !it.title) continue;
        const sig = buildTokenSignature(it.title);
        if (!sig) continue;
        out.push({
          source: 'hackernews',
          signature: sig,
          topic: it.title,
          // HN: a single post but we weight by score so a 600-pt post counts as 6 mentions.
          mentions: Math.max(1, Math.floor(Number(it.score || 1) / 100)),
          score: Number(it.score) || 0,
          link: it.url || `https://news.ycombinator.com/item?id=${id}`,
          postedAt: it.time ? new Date(it.time * 1000).toISOString() : undefined,
        });
        await sleep(60);
      } catch (_) {}
    }
  } catch (_) {}
  return out;
}

// ── Google News RSS via lib/trending-news.js ────────────────────────────
async function sampleGoogleNews() {
  try {
    const { fetchTrending } = require('./trending-news');
    const topics = await fetchTrending({ topN: 30 });
    return topics.map((t) => ({
      source: 'google-news',
      signature: buildTokenSignature(t.title),
      topic: t.title,
      mentions: t.sources.length,
      score: t.score,
      link: t.link,
      postedAt: t.publishedAt,
    })).filter((r) => r.signature);
  } catch (_) { return []; }
}

// ── Google Trends RSS (US/IN/GB) ────────────────────────────────────────
async function sampleGoogleTrends() {
  const geos = ['US', 'IN', 'GB'];
  const out = [];
  for (const geo of geos) {
    try {
      const r = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) continue;
      const xml = await r.text();
      const titles = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1).map((m) => m[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim()).filter(Boolean);
      for (const t of titles.slice(0, 25)) {
        const sig = buildTokenSignature(t);
        if (!sig) continue;
        out.push({ source: `google-trends:${geo}`, signature: sig, topic: t, mentions: 2 /* trends row = ~2 mentions weight */, score: 0 });
      }
    } catch (_) {}
    await sleep(200);
  }
  return out;
}

// ── Wikipedia recentchanges (NEW source per plan) ───────────────────────
async function sampleWikipedia() {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|user|timestamp&rcshow=!minor&rclimit=100&rctype=edit&format=json';
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return [];
    const j = await r.json();
    const recents = (j.query && j.query.recentchanges) || [];
    // Count edits per article title
    const counts = new Map();
    for (const rc of recents) {
      if (!rc.title) continue;
      const c = counts.get(rc.title) || 0;
      counts.set(rc.title, c + 1);
    }
    const out = [];
    for (const [title, count] of counts) {
      // Filter out user/talk/file/template namespaces
      if (/^(User|User talk|Talk|Wikipedia|File|Template|Category|Help):/i.test(title)) continue;
      if (count < 2) continue;   // Only articles edited ≥2 times in the window are interesting
      const sig = buildTokenSignature(title);
      if (!sig) continue;
      out.push({
        source: 'wikipedia',
        signature: sig,
        topic: title,
        mentions: count,
        score: count,
        link: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      });
    }
    return out;
  } catch (_) { return []; }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function tick({ emit = false } = {}) {
  const t0 = Date.now();
  const [reddit, hn, news, trends, wiki] = await Promise.all([
    sampleReddit().catch(() => []),
    sampleHackerNews().catch(() => []),
    sampleGoogleNews().catch(() => []),
    sampleGoogleTrends().catch(() => []),
    sampleWikipedia().catch(() => []),
  ]);
  const all = [...reddit, ...hn, ...news, ...trends, ...wiki];
  const wrote = recordSamples(all);
  console.log(`[velocity-watch] sampled in ${(Date.now()-t0)/1000}s: reddit=${reddit.length} hn=${hn.length} news=${news.length} trends=${trends.length} wiki=${wiki.length} (wrote=${wrote})`);

  const spikes = detectSpikes({});
  console.log(`[velocity-watch] detected ${spikes.length} spike(s)`);
  for (const s of spikes.slice(0, 5)) {
    console.log(`  [${s.ratio.toFixed(2)}x] ${s.topTopic.slice(0, 80)}  sources=${s.sources.length}`);
  }

  if (emit && spikes.length > 0) {
    const triggerFile = emitTrigger(spikes[0]);
    console.log(`[velocity-watch] emitted trigger → ${triggerFile}`);
    return { ok: true, sampledRows: wrote, spikes, trigger: triggerFile };
  }
  return { ok: true, sampledRows: wrote, spikes };
}

module.exports = { tick, sampleReddit, sampleHackerNews, sampleGoogleNews, sampleGoogleTrends, sampleWikipedia };

if (require.main === module) {
  const args = process.argv.slice(2);
  const emit = args.includes('--emit');
  if (args.includes('--once') || args.length === 0) {
    tick({ emit }).then((r) => {
      process.exit(r.ok ? 0 : 1);
    }).catch((e) => { console.error('FATAL:', e); process.exit(2); });
  }
}
