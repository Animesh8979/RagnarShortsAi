/**
 * lib/channel-cluster-router.js — Phase 1.4 niche-cluster routing
 *
 * The pipeline has two YouTube channels:
 *   - RagnarShortsAi (channelLabel='RagnarShortsAi', creds: yt-credentials.json)
 *   - RagnarShortsUltimate (channelLabel='RagnarShortsUltimate', creds: yt-credentials-2.json)
 *
 * Default routing today is BY-LANE: organic → RagnarShortsAi, clip →
 * RagnarShortsUltimate. That ignores the empirical fact that some topic
 * clusters perform meaningfully better on one channel than the other.
 *
 * This module computes mean AVD% (or views as proxy) per (channelLabel ×
 * topic-cluster) over the last 14 days. For a new candidate topic, if its
 * cluster has ≥3 prior samples on BOTH channels AND channel A outperforms
 * channel B by ≥30% on that cluster, `pickChannel(topic)` returns A
 * instead of the default.
 *
 * The cluster signature comes from `content-dedupe.js#buildTokenSignature`
 * so we reuse the same clustering as the dedupe gate. No new clustering
 * algorithm.
 *
 * Usage:
 *   const { pickChannel, explain } = require('./channel-cluster-router');
 *   const ch = pickChannel('Iran Hormuz authority claims waters', 'organic');
 *   // ch ∈ { 'RagnarShortsAi','RagnarShortsUltimate' } or null when no clear winner
 *
 *   node lib/channel-cluster-router.js --explain
 *     → prints the (channel × cluster) matrix
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'renders', 'analytics');
const { buildTokenSignature } = require(path.join(ROOT, 'content-dedupe'));

const CHANNEL_LABELS = ['RagnarShortsAi', 'RagnarShortsUltimate'];
const DEFAULT_BY_LANE = { organic: 'RagnarShortsAi', clip: 'RagnarShortsUltimate' };
const MIN_SAMPLES_PER_CELL = 3;
const OUTPERFORM_PCT = 30;   // X must outperform Y by ≥30% to override

// ── Load YT metrics + match each video to a channelLabel ────────────────
function loadYouTubeMetrics({ days = 14 } = {}) {
  if (!fs.existsSync(ANALYTICS_DIR)) return [];
  const cutoff = Date.now() - days * 86_400_000;
  const files = fs.readdirSync(ANALYTICS_DIR)
    .filter((f) => /^youtube-metrics-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => ({ f, t: Date.parse(f.match(/(\d{4}-\d{2}-\d{2})/)[1]) }))
    .filter(({ t }) => t >= cutoff)
    .sort((a, b) => b.t - a.t);
  const seen = new Map();
  for (const { f } of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ANALYTICS_DIR, f), 'utf8'));
      for (const r of j.records || []) {
        if (!r || !r.videoId) continue;
        const ts = Date.parse(r.refreshedAt || r.recordedAt || 0);
        const prior = seen.get(r.videoId);
        if (!prior || ts > prior._ts) seen.set(r.videoId, { ...r, _ts: ts });
      }
    } catch (_) {}
  }
  return [...seen.values()];
}

// Lookup which channel a videoId belongs to. Sources, in priority order:
//   1. performance-ledger-YYYY-MM.jsonl — preferred (post-Phase-1.4 it carries channelLabel)
//   2. renders/fresh-batch-upload-*.json — fallback for runs that pre-date the ledger fix
//   3. renders/{premium,creator}-clips-v2/V8-upload-results-*.json — legacy
function buildVideoIdToChannelMap() {
  const map = new Map();

  // 1. Performance ledger (canonical)
  if (fs.existsSync(ANALYTICS_DIR)) {
    const lfiles = fs.readdirSync(ANALYTICS_DIR).filter((f) => /^performance-ledger-\d{4}-\d{2}\.jsonl$/.test(f));
    for (const f of lfiles) {
      try {
        const lines = fs.readFileSync(path.join(ANALYTICS_DIR, f), 'utf8').split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            const yt = j.platforms && j.platforms.youtube;
            if (yt && yt.mediaId && yt.channelLabel) {
              map.set(String(yt.mediaId), yt.channelLabel);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  if (!fs.existsSync(path.join(ROOT, 'renders'))) return map;
  // 2. Fresh-batch upload logs
  const rendersDir = path.join(ROOT, 'renders');
  const ffiles = fs.readdirSync(rendersDir).filter((f) => /^fresh-batch-upload-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  for (const f of ffiles) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(rendersDir, f), 'utf8'));
      for (const it of j.items || []) {
        if (it.youtube && it.youtube.videoId) {
          // Most fresh-batch items use the default lane→channel mapping; the
          // upload step writes `item.youtube.channelLabel` when known. Best
          // effort: use that, else fall back to default by `kind`.
          const ch = it.youtube.channelLabel || DEFAULT_BY_LANE[it.kind] || 'RagnarShortsAi';
          map.set(String(it.youtube.videoId), ch);
        }
      }
    } catch (_) {}
  }
  // Legacy V8 results
  for (const lane of ['premium-clips-v2', 'creator-clips-v2']) {
    const dir = path.join(ROOT, 'renders', lane);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => /^V8-upload-results-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        for (const res of j.results || []) {
          if (res.youtube && res.youtube.videoId) {
            const ch = res.youtubeChannel || (lane === 'creator-clips-v2' ? 'RagnarShortsUltimate' : 'RagnarShortsAi');
            map.set(String(res.youtube.videoId), ch);
          }
        }
      } catch (_) {}
    }
  }
  return map;
}

// ── Build the (channel × cluster) matrix ─────────────────────────────────
function pickSignal(r) {
  if (typeof r.averageViewPercentage === 'number' && r.averageViewPercentage > 0) return r.averageViewPercentage;
  if (typeof r.averageViewDuration === 'number' && r.averageViewDuration > 0) return r.averageViewDuration;
  return Number(r.viewCount) || 0;
}

function buildMatrix({ days = 14 } = {}) {
  const records = loadYouTubeMetrics({ days });
  const ch4id = buildVideoIdToChannelMap();
  const matrix = {};  // { [cluster]: { [channel]: { count, sum, mean } } }
  for (const r of records) {
    const channel = ch4id.get(String(r.videoId)) || null;
    if (!channel) continue;
    const cluster = buildTokenSignature(r.topic || r.title || '');
    if (!cluster) continue;
    const cell = (matrix[cluster] = matrix[cluster] || {});
    const ent = (cell[channel] = cell[channel] || { count: 0, sum: 0 });
    ent.count += 1;
    ent.sum += pickSignal(r);
  }
  for (const cluster of Object.keys(matrix)) {
    for (const channel of Object.keys(matrix[cluster])) {
      const e = matrix[cluster][channel];
      e.mean = e.count > 0 ? e.sum / e.count : 0;
    }
  }
  return matrix;
}

// ── Pick channel for a candidate topic ────────────────────────────────────
function pickChannel(topic, defaultLane = 'organic', { matrix = null, days = 14, minSamplesPerCell = MIN_SAMPLES_PER_CELL, outperformPct = OUTPERFORM_PCT } = {}) {
  const m = matrix || buildMatrix({ days });
  const candidateCluster = buildTokenSignature(topic || '');
  const fallback = DEFAULT_BY_LANE[defaultLane] || 'RagnarShortsAi';
  if (!candidateCluster) return { channel: fallback, reason: 'no_signature' };

  // Find a cluster in the matrix with the highest tokenSignature overlap.
  // Simple approach: exact-signature match wins; else look for clusters
  // sharing ≥ half of the candidate's tokens.
  const candTokens = new Set(candidateCluster.split(/\s+/).filter(Boolean));
  if (candTokens.size === 0) return { channel: fallback, reason: 'empty_signature' };

  let best = null;
  let bestOverlap = 0;
  for (const cluster of Object.keys(m)) {
    if (cluster === candidateCluster) { best = cluster; bestOverlap = 1; break; }
    const tokens = new Set(cluster.split(/\s+/).filter(Boolean));
    let overlap = 0;
    for (const t of candTokens) if (tokens.has(t)) overlap += 1;
    const ratio = overlap / Math.max(candTokens.size, tokens.size);
    if (ratio > bestOverlap && ratio >= 0.5) {
      best = cluster; bestOverlap = ratio;
    }
  }
  if (!best) return { channel: fallback, reason: 'no_matching_cluster' };

  const cell = m[best];
  const chA = cell.RagnarShortsAi || { count: 0, mean: 0 };
  const chB = cell.RagnarShortsUltimate || { count: 0, mean: 0 };
  if (chA.count < minSamplesPerCell || chB.count < minSamplesPerCell) {
    return { channel: fallback, reason: 'insufficient_samples', clusterMatched: best, chA, chB };
  }

  // Pick the channel whose mean is ≥ outperformPct% higher than the other.
  const ratio = chA.mean / Math.max(1, chB.mean);
  if (ratio >= 1 + outperformPct / 100) {
    return { channel: 'RagnarShortsAi', reason: 'outperforms', overrideFromDefault: fallback !== 'RagnarShortsAi', clusterMatched: best, chA, chB, ratio };
  }
  if (ratio <= 1 - outperformPct / 100) {
    return { channel: 'RagnarShortsUltimate', reason: 'outperforms', overrideFromDefault: fallback !== 'RagnarShortsUltimate', clusterMatched: best, chA, chB, ratio };
  }
  return { channel: fallback, reason: 'within_band', clusterMatched: best, chA, chB, ratio };
}

function explain() {
  const m = buildMatrix({ days: 14 });
  const clusters = Object.keys(m);
  console.log(`\n=== Channel × Cluster matrix (${clusters.length} clusters, 14d) ===\n`);
  const rows = [];
  for (const cluster of clusters) {
    const a = m[cluster].RagnarShortsAi || { count: 0, mean: 0 };
    const b = m[cluster].RagnarShortsUltimate || { count: 0, mean: 0 };
    rows.push({ cluster: cluster.slice(0, 50), aCount: a.count, aMean: a.mean, bCount: b.count, bMean: b.mean });
  }
  rows.sort((x, y) => (y.aMean + y.bMean) - (x.aMean + x.bMean));
  console.log(`${'CLUSTER'.padEnd(52)} | ${'AI(n)'.padStart(6)} ${'AI(μ)'.padStart(8)} | ${'ULT(n)'.padStart(6)} ${'ULT(μ)'.padStart(8)}`);
  console.log('-'.repeat(92));
  for (const r of rows.slice(0, 30)) {
    console.log(`${r.cluster.padEnd(52)} | ${String(r.aCount).padStart(6)} ${r.aMean.toFixed(1).padStart(8)} | ${String(r.bCount).padStart(6)} ${r.bMean.toFixed(1).padStart(8)}`);
  }
}

module.exports = { pickChannel, buildMatrix, explain };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--explain')) {
    explain();
  } else {
    // Single-topic probe: `node lib/channel-cluster-router.js "Iran Hormuz authority" organic`
    const topic = args[0] || 'Iran Hormuz authority claims waters';
    const lane = args[1] || 'organic';
    const r = pickChannel(topic, lane);
    console.log(JSON.stringify({ topic, lane, ...r }, null, 2));
  }
}
