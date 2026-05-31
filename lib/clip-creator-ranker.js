/**
 * lib/clip-creator-ranker.js — L110 T0.1
 *
 * Dynamic, performance-weighted creator ranking for the clip lane (user
 * decision: keep the full creator pool, but pick each day's clips by what is
 * ACTUALLY gaining us views, not a fixed lock).
 *
 * combinedScore(creator) =
 *     performanceWeight * perfScore(creator)      // our live channel analytics
 *   + trendingWeight    * trendingScore(creator)  // freshness / exploration
 *
 * perfScore: from renders/analytics/youtube-metrics-*.json — average of
 *   (normalized viewCount) and (averageViewPercentage) over this creator's
 *   clips. Cold-start creators (no data yet) get coldStartDefaultScore so they
 *   still get exploration. As data accumulates, winners rise, losers fall →
 *   the channel earns a soft identity from real performance.
 *
 * trendingScore: a light exploration term — creators we've clipped LEAST
 * recently get a small boost (so we keep sampling the pool and don't over-fit
 * to one creator), plus an optional velocity bump if the creator shows up in
 * the velocity-watch spike ledger.
 *
 * Output: ordered creator-name array (best first) — consumed by
 * lib/trending-clips.js:discoverHdClips to decide fetch order.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS = path.join(ROOT, 'renders', 'analytics');

function loadConfig() {
  try { return require(path.join(ROOT, 'config', 'channel-niches.json')).clip; }
  catch (_) { return { creatorPool: [], performanceWeight: 0.6, trendingWeight: 0.4, coldStartDefaultScore: 50 }; }
}

function loadAllMetricsRecords(days = 30) {
  const out = [];
  try {
    const cutoff = Date.now() - days * 24 * 3600_000;
    for (const f of fs.readdirSync(ANALYTICS)) {
      if (!/^youtube-metrics-\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(ANALYTICS, f), 'utf8'));
        for (const r of (j.records || [])) {
          const ts = new Date(r.recordedAt || r.refreshedAt || 0).getTime();
          if (ts >= cutoff || !ts) out.push(r);
        }
      } catch (_) {}
    }
  } catch (_) {}
  return out;
}

function creatorMatches(record, creator) {
  const c = creator.toLowerCase().replace(/[^a-z0-9]/g, '');
  const blob = `${record.title || ''} ${record.topic || ''} ${record.batchLabel || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  // also try spaced variant e.g. "ishowspeed" / "kill tony"
  const spaced = creator.toLowerCase();
  const blobSpaced = `${record.title || ''} ${record.topic || ''}`.toLowerCase();
  return blob.includes(c) || blobSpaced.includes(spaced);
}

/**
 * perfScore 0-100 for a creator from our live YT metrics.
 * Blends normalized view-count (vs the pool max) and averageViewPercentage.
 */
function computePerfScores(creators, records, coldDefault) {
  // Build per-creator aggregates.
  const agg = {};
  for (const cr of creators) agg[cr] = { views: [], avp: [], n: 0 };
  for (const r of records) {
    for (const cr of creators) {
      if (creatorMatches(r, cr)) {
        agg[cr].views.push(Number(r.viewCount) || 0);
        if (r.averageViewPercentage != null) agg[cr].avp.push(Number(r.averageViewPercentage) || 0);
        agg[cr].n++;
        break;
      }
    }
  }
  // Pool max view for normalization.
  const allMeanViews = creators.map((cr) => agg[cr].views.length ? agg[cr].views.reduce((a, b) => a + b, 0) / agg[cr].views.length : 0);
  const maxView = Math.max(1, ...allMeanViews);
  const scores = {};
  creators.forEach((cr, i) => {
    if (agg[cr].n === 0) { scores[cr] = { score: coldDefault, n: 0, coldStart: true }; return; }
    const meanViews = allMeanViews[i];
    const viewScore = Math.min(100, (meanViews / maxView) * 100);
    const avpScore = agg[cr].avp.length ? (agg[cr].avp.reduce((a, b) => a + b, 0) / agg[cr].avp.length) : 50; // avp already 0-100
    scores[cr] = { score: Math.round(0.5 * viewScore + 0.5 * avpScore), n: agg[cr].n, meanViews: Math.round(meanViews), avp: Math.round(avpScore) };
  });
  return scores;
}

/**
 * trendingScore 0-100 — exploration term: least-recently-clipped creators get
 * a boost so we keep sampling; optional velocity bump if creator is spiking.
 */
function computeTrendingScores(creators) {
  // Last-clipped recency from fresh-batch manifests.
  const lastClipped = {};
  try {
    const rd = path.join(ROOT, 'renders');
    const files = fs.readdirSync(rd).filter((f) => /^fresh-batch-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(rd, f), 'utf8'));
        const day = f.slice('fresh-batch-'.length, -'.json'.length);
        for (const c of (j.clips || [])) {
          const cr = c.spec && c.spec.sourceCreator;
          if (cr) lastClipped[cr] = day;
        }
      } catch (_) {}
    }
  } catch (_) {}
  // Velocity bump.
  let spikes = '';
  try { spikes = fs.readFileSync(path.join(ANALYTICS, 'topic-velocity.jsonl'), 'utf8').slice(-20000).toLowerCase(); } catch (_) {}

  const scores = {};
  for (const cr of creators) {
    // Never-clipped = max exploration (80). Clipped long ago = higher. Recent = lower.
    let recencyScore = 80;
    if (lastClipped[cr]) {
      const days = Math.max(0, (Date.now() - new Date(lastClipped[cr]).getTime()) / (24 * 3600_000));
      recencyScore = Math.min(80, 20 + days * 12); // ~5 days to recover full exploration
    }
    const velocityBump = spikes.includes(cr.toLowerCase()) ? 20 : 0;
    scores[cr] = Math.min(100, Math.round(recencyScore + velocityBump));
  }
  return scores;
}

/**
 * Rank the creator pool. Returns [{ creator, combined, perf, trending, ... }].
 */
function rankCreators(opts = {}) {
  const cfg = loadConfig();
  const creators = opts.creators || cfg.creatorPool || [];
  if (creators.length === 0) return [];
  const pw = cfg.performanceWeight ?? 0.45;
  const tw = cfg.trendingWeight ?? 0.2;
  const bw = cfg.brainrotWeight ?? 0.35;
  const cold = cfg.coldStartDefaultScore ?? 50;
  const brainrot = cfg.brainrotScores || {};

  const records = loadAllMetricsRecords(opts.windowDays || 30);
  const perf = computePerfScores(creators, records, cold);
  const trend = computeTrendingScores(creators);

  const ranked = creators.map((cr) => {
    const p = perf[cr].score;
    const t = trend[cr];
    // Editorial brain-rot/comedy prior (default 50 if unscored). Favors funny/
    // chaotic creators so the clip channel reads as brain-rot, not dry podcasts.
    const b = brainrot[cr] != null ? Number(brainrot[cr]) : 50;
    return {
      creator: cr,
      combined: Math.round(pw * p + tw * t + bw * b),
      perf: p,
      perfN: perf[cr].n,
      perfColdStart: !!perf[cr].coldStart,
      trending: t,
      brainrot: b,
    };
  }).sort((a, b) => b.combined - a.combined);
  return ranked;
}

/** Convenience: ordered creator-name array (best first). */
function rankedCreatorNames(opts = {}) {
  return rankCreators(opts).map((r) => r.creator);
}

module.exports = { rankCreators, rankedCreatorNames, loadConfig };

if (require.main === module) {
  require('./env-d-drive-only');
  const ranked = rankCreators();
  console.log('=== clip-creator-ranker (best first) ===');
  for (const r of ranked) {
    console.log(`  ${String(r.combined).padStart(3)}  ${r.creator.padEnd(16)} perf=${r.perf}${r.perfColdStart ? '(cold)' : '(' + r.perfN + ' clips)'} trending=${r.trending} brainrot=${r.brainrot}`);
  }
}
