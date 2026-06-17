/**
 * lib/topic-velocity.js — Phase 3.1
 *
 * Append-only ledger of topic-mention samples at
 * `renders/analytics/topic-velocity.jsonl`. Each row is a single (source,
 * topic, ts) observation with a counted `mentions` field. The detector
 * groups by signature (deterministic token-set hash) across a sliding
 * window and finds topics whose hourly mention count doubled across
 * ≥3 sources.
 *
 * Ledger row schema:
 *   { ts, source, topic, signature, mentions, score?, link?, postedAt? }
 *
 * The companion sampler (`lib/velocity-watch.js`) writes the rows every
 * 10 min from GH Actions cron. This file is the read/detect side.
 *
 * Usage:
 *   node lib/topic-velocity.js --sample <source> <topic> <mentions> [link]
 *   node lib/topic-velocity.js --detect
 *   node lib/topic-velocity.js --tail 20
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'renders', 'analytics');
const LEDGER = path.join(ANALYTICS_DIR, 'topic-velocity.jsonl');
// Triggers (what priority-watcher reads) go in renders/triggers/.
const TRIGGERS_DIR = path.join(ROOT, 'renders', 'triggers');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

// Same tokenSignature shape as content-dedupe.js — reusing the existing
// clustering primitive so any two callers cluster the same topics together.
const { buildTokenSignature } = require(path.join(ROOT, 'content-dedupe'));

function recordRow(row) {
  ensureDir(ANALYTICS_DIR);
  const enriched = {
    ts: row.ts || new Date().toISOString(),
    source: String(row.source || 'unknown'),
    topic: String(row.topic || '').slice(0, 240),
    signature: row.signature || buildTokenSignature(row.topic || ''),
    mentions: Math.max(1, Number(row.mentions) || 1),
    score: typeof row.score === 'number' ? row.score : undefined,
    link: row.link || undefined,
    postedAt: row.postedAt || undefined,
  };
  fs.appendFileSync(LEDGER, JSON.stringify(enriched) + '\n');
  return enriched;
}

function recordSamples(rows) {
  for (const r of rows || []) recordRow(r);
  return rows.length;
}

function readRecent(windowMin = 60 * 24) {
  if (!fs.existsSync(LEDGER)) return [];
  const cutoff = Date.now() - windowMin * 60_000;
  const lines = fs.readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      const ts = Date.parse(j.ts || 0);
      if (Number.isFinite(ts) && ts >= cutoff) out.push({ ...j, _ts: ts });
    } catch (_) {}
  }
  return out;
}

/**
 * detectSpikes({ windowMin, priorWindowMin, minSources, multiplier })
 *   - windowMin: most recent N minutes (default 60)
 *   - priorWindowMin: prior comparison window (default 60, i.e. 60-120 min ago)
 *   - minSources: minimum distinct sources to count (default 3)
 *   - multiplier: current/prior mentions must be >= multiplier (default 2.0)
 *   - minCurrent: minimum mentions in current window (default 4)
 *
 * Returns array of:
 *   { signature, currentMentions, priorMentions, ratio, sources:[...], topTopic, recentRows }
 */
function detectSpikes({ windowMin = 60, priorWindowMin = 60, minSources = 3, multiplier = 2.0, minCurrent = 4 } = {}) {
  const allRecent = readRecent(windowMin + priorWindowMin);
  const now = Date.now();
  const splitTs = now - windowMin * 60_000;

  const cur = new Map();   // signature → { mentions, sources:Set, topics:Map<topic,count>, rows:[] }
  const pri = new Map();
  for (const r of allRecent) {
    const target = r._ts >= splitTs ? cur : pri;
    const entry = target.get(r.signature) || { mentions: 0, sources: new Set(), topics: new Map(), rows: [] };
    entry.mentions += r.mentions || 1;
    entry.sources.add(r.source);
    entry.topics.set(r.topic, (entry.topics.get(r.topic) || 0) + 1);
    entry.rows.push(r);
    target.set(r.signature, entry);
  }

  const spikes = [];
  for (const [sig, e] of cur) {
    if (e.sources.size < minSources) continue;
    if (e.mentions < minCurrent) continue;
    const prev = pri.get(sig) || { mentions: 0 };
    const denom = Math.max(1, prev.mentions);
    const ratio = e.mentions / denom;
    if (ratio < multiplier) continue;
    // Pick the most common topic phrasing in the current window.
    const topTopic = [...e.topics.entries()].sort((a, b) => b[1] - a[1])[0][0];
    spikes.push({
      signature: sig,
      topTopic,
      currentMentions: e.mentions,
      priorMentions: prev.mentions,
      ratio: +ratio.toFixed(2),
      sources: [...e.sources],
      recentRows: e.rows.slice(-5),
    });
  }
  // Highest ratio first
  spikes.sort((a, b) => b.ratio - a.ratio || b.currentMentions - a.currentMentions);
  return spikes;
}

/**
 * Emit a trigger file for the priority watcher to consume.
 */
function emitTrigger(spike) {
  ensureDir(TRIGGERS_DIR);
  const id = `${Date.now()}-${spike.signature.replace(/\s+/g, '_').slice(0, 32)}`;
  const file = path.join(TRIGGERS_DIR, `priority-trigger-${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ id, createdAt: new Date().toISOString(), spike, status: 'pending' }, null, 2));
  return file;
}

module.exports = { recordRow, recordSamples, readRecent, detectSpikes, emitTrigger };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--sample')) {
    const i = args.indexOf('--sample');
    const source = args[i + 1] || 'manual';
    const topic = args[i + 2] || 'test topic';
    const mentions = Number(args[i + 3]) || 1;
    const link = args[i + 4] || undefined;
    console.log(recordRow({ source, topic, mentions, link }));
  } else if (args.includes('--detect')) {
    const spikes = detectSpikes({});
    console.log(JSON.stringify(spikes, null, 2));
    if (args.includes('--emit') && spikes.length > 0) {
      console.log('Emitting trigger for:', spikes[0].topTopic);
      console.log(emitTrigger(spikes[0]));
    }
  } else if (args.includes('--tail')) {
    const i = args.indexOf('--tail');
    const n = Number(args[i + 1]) || 20;
    const rows = readRecent(60 * 24 * 7).slice(-n);
    for (const r of rows) console.log(JSON.stringify(r));
  } else {
    console.log('Usage: node lib/topic-velocity.js [--sample <src> <topic> <mentions> [link] | --detect [--emit] | --tail N]');
  }
}
