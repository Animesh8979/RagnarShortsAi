/**
 * lib/cost-ledger.js — Phase 6.4
 *
 * Cost telemetry CI gate. Every external API call SHOULD write a row to
 * `renders/analytics/cost-ledger-{date}.jsonl` with `cost: 0`. The CI
 * step at the end of `daily-batch.yml` calls `--verify` here; the gate
 * fails the workflow if any row shows cost > 0.
 *
 * This is the belt-and-suspenders enforcement of the "$0 recurring, no
 * card" hard constraint. The router-level circuit breaker stops a
 * provider from being called when its env key is missing, but doesn't
 * watch the per-call cost; this ledger does.
 *
 * Row schema:
 *   { ts, provider, endpoint, cost, currency: 'USD', detail?, requestId? }
 *
 * Wire into callers by importing and calling `record()` after each API
 * round-trip. Most of our paid surfaces (FAL, in-experimental cloud GPU)
 * already check `FAL_DAILY_BUDGET_CENTS` before firing — they'll record
 * a `cost: <cents/100>` row that the gate catches.
 *
 * The 'free' providers (NVIDIA NIM, HF Inference, Groq free tier, Gemini
 * 1.5-flash free tier, Edge TTS, etc) all record `cost: 0`. If any of
 * those silently transition to a paid tier in the future, the gate will
 * flag the run loudly.
 *
 * Usage:
 *   const cost = require('./cost-ledger');
 *   cost.record({ provider: 'groq', endpoint: 'chat.completions', cost: 0 });
 *   ...
 *   node lib/cost-ledger.js --verify   # CI gate; exits 1 if cost > 0
 *   node lib/cost-ledger.js --summary  # print daily totals
 */

'use strict';

require('./env-d-drive-only');

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'renders', 'analytics');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function todayDate() { return new Date().toISOString().slice(0, 10); }
function ledgerPath(date) { return path.join(ANALYTICS_DIR, `cost-ledger-${date || todayDate()}.jsonl`); }

/**
 * record({provider, endpoint, cost, currency, detail, requestId})
 *
 * `cost` is in MAJOR units (USD dollars). Use 0 for free-tier calls.
 * For paid surfaces, divide cents by 100 here so the ledger normalizes.
 */
function record(row) {
  ensureDir(ANALYTICS_DIR);
  const enriched = {
    ts: row.ts || new Date().toISOString(),
    provider: String(row.provider || 'unknown'),
    endpoint: String(row.endpoint || ''),
    cost: typeof row.cost === 'number' ? row.cost : 0,
    currency: row.currency || 'USD',
    detail: row.detail || undefined,
    requestId: row.requestId || undefined,
  };
  try { fs.appendFileSync(ledgerPath(), JSON.stringify(enriched) + '\n'); } catch (_) {}
  return enriched;
}

/**
 * verify({ days, throwOnNonZero }) — read all ledger files in window,
 * return summary + any non-zero rows.
 *
 * @returns { ok: boolean, totalRows, totalCost, byProvider, nonZeroRows }
 *
 * Exits with code 1 when called from CLI with --verify and totalCost > 0.
 */
function verify({ days = 1, throwOnNonZero = false } = {}) {
  const cutoff = Date.now() - days * 86_400_000;
  if (!fs.existsSync(ANALYTICS_DIR)) return { ok: true, totalRows: 0, totalCost: 0, byProvider: {}, nonZeroRows: [] };
  const files = fs.readdirSync(ANALYTICS_DIR)
    .filter((f) => /^cost-ledger-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));

  let totalRows = 0;
  let totalCost = 0;
  const byProvider = {};
  const nonZeroRows = [];

  for (const f of files) {
    try {
      const lines = fs.readFileSync(path.join(ANALYTICS_DIR, f), 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const j = JSON.parse(line);
          const ts = Date.parse(j.ts || 0);
          if (Number.isFinite(ts) && ts < cutoff) continue;
          totalRows += 1;
          const c = Number(j.cost) || 0;
          totalCost += c;
          const p = j.provider || 'unknown';
          byProvider[p] = (byProvider[p] || 0) + c;
          if (c > 0) nonZeroRows.push(j);
        } catch (_) {}
      }
    } catch (_) {}
  }

  const ok = nonZeroRows.length === 0;
  if (!ok && throwOnNonZero) {
    throw new Error(`cost-ledger gate FAILED: ${nonZeroRows.length} non-zero rows totaling $${totalCost.toFixed(4)}`);
  }
  return { ok, totalRows, totalCost: +totalCost.toFixed(4), byProvider, nonZeroRows };
}

function summarize({ days = 7 } = {}) {
  const r = verify({ days });
  console.log(`=== cost-ledger summary (${days}d window) ===`);
  console.log(`rows: ${r.totalRows}  total: $${r.totalCost.toFixed(4)}`);
  for (const [p, c] of Object.entries(r.byProvider).sort((a, b) => b[1] - a[1])) {
    const flag = c > 0 ? '  ✗' : '  ✓';
    console.log(`${flag} ${p}: $${c.toFixed(4)}`);
  }
  if (r.nonZeroRows.length > 0) {
    console.log('\nNON-ZERO ROWS:');
    for (const row of r.nonZeroRows.slice(0, 10)) console.log(JSON.stringify(row));
  }
  return r;
}

module.exports = { record, verify, summarize, ledgerPath };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--verify')) {
    const daysIdx = args.indexOf('--days');
    const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 1 : 1;
    const r = verify({ days });
    if (!r.ok) {
      console.error(`COST GATE FAILED: ${r.nonZeroRows.length} non-zero rows in last ${days}d; total $${r.totalCost.toFixed(4)}`);
      for (const row of r.nonZeroRows.slice(0, 20)) console.error(JSON.stringify(row));
      process.exit(1);
    }
    console.log(`cost-ledger PASS: ${r.totalRows} rows, $0 spent in last ${days}d`);
    process.exit(0);
  }
  if (args.includes('--summary')) {
    const daysIdx = args.indexOf('--days');
    summarize({ days: daysIdx >= 0 ? Number(args[daysIdx + 1]) || 7 : 7 });
    return;
  }
  // Default: write one zero-cost test row + summary.
  record({ provider: 'self-test', endpoint: 'cost-ledger', cost: 0 });
  summarize({ days: 1 });
}
