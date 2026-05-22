/**
 * lib/metadata-uniqueness.js — Phase B unique-metadata enforcement
 *
 * Persists every shipped title/description/tags + topic signature to
 * `renders/analytics/uploaded-metadata-ledger.json`. Before any upload,
 * `assertMetadataUnique({ title, description, tags, days })` runs three
 * similarity checks against the last N days of uploads (N = env
 * CONTENT_DEDUPE_DAYS, default 14):
 *
 *   1. Title  — Levenshtein-normalized similarity must be < (1 - MIN)
 *               where MIN = env METADATA_UNIQUENESS_MIN (default 0.4 → must
 *               differ by ≥40%).
 *   2. Description first sentence — same rule.
 *   3. Tag set — Jaccard similarity must be < (1 - MIN).
 *
 * If ANY of the three exceeds the duplicate ceiling, returns
 * `{ ok: false, reason, hit: <ledger row>, score }`. The orchestrator MUST
 * regenerate the metadata via the LLM (route('script_llm')) and retry. The
 * static fallback placeholder cannot be a way out — Phase A already halts
 * on provider exhaustion.
 *
 * Persisted shape per row:
 *   {
 *     ts: ISO timestamp,
 *     videoId: 'F_kvfZJ0sk4',
 *     channel: 'RagnarShortsAi',
 *     platform: 'youtube_shorts' | 'instagram_reels',
 *     title, description, tags: [...],
 *     topicSignature: 'token1 token2 token3' (sorted, deduped)
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, 'renders', 'analytics', 'uploaded-metadata-ledger.json');

function ensureLedger() {
  const dir = path.dirname(LEDGER);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  if (!fs.existsSync(LEDGER)) fs.writeFileSync(LEDGER, JSON.stringify({ entries: [] }, null, 2));
}

function readLedger() {
  ensureLedger();
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    return Array.isArray(raw.entries) ? raw : { entries: [] };
  } catch (_) { return { entries: [] }; }
}

function writeLedger(state) {
  ensureLedger();
  fs.writeFileSync(LEDGER, JSON.stringify(state, null, 2));
}

// ── Similarity ──────────────────────────────────────────────────────────
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function firstSentence(s) {
  const t = norm(s);
  const m = t.match(/[^.!?]{6,}[.!?]?/);
  return (m ? m[0] : t).slice(0, 280);
}

// Damerau-Levenshtein on normalized strings → similarity in [0,1].
function levSim(a, b) {
  const aa = norm(a), bb = norm(b);
  if (!aa && !bb) return 1;
  if (!aa || !bb) return 0;
  const m = aa.length, n = bb.length;
  if (Math.abs(m - n) / Math.max(m, n) > 0.8) return 0; // far enough, skip work
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = aa[i - 1] === bb[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

function jaccard(setA, setB) {
  const a = new Set([...(setA || [])].map((t) => norm(t)).filter(Boolean));
  const b = new Set([...(setB || [])].map((t) => norm(t)).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / Math.max(a.size, b.size);
}

function topicSignature(text) {
  const STOP = new Set(['the','a','an','of','in','on','to','for','with','and','or','but','is','it','this','that','at','by','from','as','was','are','be']);
  return [...new Set(norm(text).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)))].sort().join(' ');
}

// ── Public API ──────────────────────────────────────────────────────────
function recordUploadedMetadata({ videoId, channel, platform, title, description, tags }) {
  const state = readLedger();
  state.entries.push({
    ts: new Date().toISOString(),
    videoId: videoId || null,
    channel: channel || null,
    platform: platform || null,
    title: String(title || ''),
    description: String(description || ''),
    tags: Array.isArray(tags) ? tags.slice(0, 50) : [],
    topicSignature: topicSignature((title || '') + ' ' + (description || '')),
  });
  // Trim to last 200 entries to keep the file small.
  if (state.entries.length > 200) state.entries.splice(0, state.entries.length - 200);
  writeLedger(state);
}

/**
 * Returns { ok, reason, hit, score, checks } — ok=true means cleared to ship.
 * Default uniqueness floor = METADATA_UNIQUENESS_MIN (0.4 → differ by ≥40%).
 */
function assertMetadataUnique({ title, description, tags, days, minUniqueness } = {}) {
  const cutoff = Date.now() - ((Math.max(1, Number(days) || Number(process.env.CONTENT_DEDUPE_DAYS) || 14)) * 86_400_000);
  const min = Number.isFinite(Number(minUniqueness)) ? Number(minUniqueness) : Number(process.env.METADATA_UNIQUENESS_MIN) || 0.4;
  const ceiling = 1 - min; // similarity ≥ ceiling = "too similar"

  const state = readLedger();
  const recent = state.entries.filter((e) => Date.parse(e.ts) >= cutoff);

  for (const row of recent) {
    const tSim = levSim(title, row.title);
    const dSim = levSim(firstSentence(description), firstSentence(row.description));
    const tagSim = jaccard(tags, row.tags);
    const checks = { titleSim: +tSim.toFixed(3), descSim: +dSim.toFixed(3), tagSim: +tagSim.toFixed(3) };
    if (tSim >= ceiling) return { ok: false, reason: 'title_too_similar', hit: row, score: tSim, checks };
    if (dSim >= ceiling) return { ok: false, reason: 'description_too_similar', hit: row, score: dSim, checks };
    if (tagSim >= ceiling) return { ok: false, reason: 'tags_too_similar', hit: row, score: tagSim, checks };
  }
  return { ok: true, recentCount: recent.length, ceiling, min };
}

function _testReset() { writeLedger({ entries: [] }); }

module.exports = { assertMetadataUnique, recordUploadedMetadata, topicSignature, _testReset, _ledgerPath: LEDGER };

if (require.main === module) {
  // Smoke test
  _testReset();
  recordUploadedMetadata({ videoId: 'TEST1', title: 'Pakistan Just Picked Iran', description: 'Pakistan opened six overland routes.', tags: ['pakistan','iran','geopolitics','shorts'] });
  console.log('1st (identical):', assertMetadataUnique({ title: 'Pakistan Just Picked Iran', description: 'Pakistan opened six overland routes.', tags: ['pakistan','iran','geopolitics','shorts'] }));
  console.log('2nd (different):', assertMetadataUnique({ title: 'Saudi Arabia Just Bombed Iraq', description: 'Saudi fighter jets struck militia positions.', tags: ['saudi','iraq','mbs','shorts'] }));
  console.log('3rd (partly similar):', assertMetadataUnique({ title: 'Pakistan Iran Border Choice', description: 'Pakistan reopened six routes through Balochistan.', tags: ['pakistan','iran','quad','news'] }));
  _testReset();
}
