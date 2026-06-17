/**
 * lib/strike-monitor.js — mandatory copyright safety net
 *
 * Maintains a permanent ledger of struck/claimed source URLs.
 * wasStruck(sourceUrl) → trending-clips.js skips at discovery.
 * recordStrike(sourceUrl, info) → adds permanently to ledger.
 *
 * Phase 3 Task 1. No external APIs needed for V1 — ledger is
 * maintained manually + via upload-daemon outcome hooks.
 *
 * CLI: node lib/strike-monitor.js --check
 *      node lib/strike-monitor.js --record "https://youtube.com/watch?v=abc" --claim "Content ID"
 *      node lib/strike-monitor.js --block "https://youtube.com/watch?v=abc"
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH = path.join(ROOT, 'renders', 'queue', 'strike-ledger.json');

function loadLedger() {
  try {
    if (fs.existsSync(LEDGER_PATH)) return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch (_) {}
  return { strikes: [], blocked: [] };
}

function saveLedger(data) {
  const dir = path.dirname(LEDGER_PATH);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    // For YT — strip query params except v=
    if (/youtu/.test(u.hostname)) {
      const v = u.searchParams.get('v');
      return v ? `https://www.youtube.com/watch?v=${v}` : url.trim().toLowerCase();
    }
    return (u.origin + u.pathname).toLowerCase();
  } catch (_) {
    return String(url).trim().toLowerCase();
  }
}

/**
 * Check if a source URL has ever been struck or manually blocked.
 * @param {string} sourceUrl
 * @returns {boolean}
 */
function wasStruck(sourceUrl) {
  if (!sourceUrl) return false;
  const norm = normalizeUrl(sourceUrl);
  const ledger = loadLedger();
  const inStrikes = (ledger.strikes || []).some((s) => normalizeUrl(s.sourceUrl) === norm);
  const inBlocked = (ledger.blocked || []).some((b) => normalizeUrl(b.sourceUrl) === norm);
  return inStrikes || inBlocked;
}

/**
 * Record a strike/claim event for a source.
 * Permanently prevents re-upload of this source.
 * @param {string} sourceUrl
 * @param {object} [info]  { platform, claimType, detectedAt, note }
 */
function recordStrike(sourceUrl, info = {}) {
  if (!sourceUrl) return;
  const norm = normalizeUrl(sourceUrl);
  const ledger = loadLedger();
  ledger.strikes = ledger.strikes || [];
  // Dedup
  if (ledger.strikes.some((s) => normalizeUrl(s.sourceUrl) === norm)) {
    console.log(`[strike-monitor] already logged: ${sourceUrl}`);
    return;
  }
  ledger.strikes.push({
    sourceUrl,
    normalizedUrl: norm,
    platform: info.platform || 'unknown',
    claimType: info.claimType || 'unknown',
    detectedAt: info.detectedAt || new Date().toISOString(),
    note: info.note || '',
  });
  // Also add to blocked so wasStruck() returns true even if code only checks one list
  blockSource(sourceUrl, { reason: 'auto-blocked-on-strike', ...info }, ledger);
  saveLedger(ledger);
  console.log(`[strike-monitor] STRIKE RECORDED: ${sourceUrl} — ${info.claimType || 'Content ID'} on ${info.platform || 'unknown'}`);
}

/**
 * Permanently block a source from ever being re-uploaded (manual block).
 * @param {string} sourceUrl
 * @param {object} [info]  { reason, note }
 * @param {object} [_ledger]  pass existing ledger to avoid double-write
 */
function blockSource(sourceUrl, info = {}, _ledger) {
  if (!sourceUrl) return;
  const norm = normalizeUrl(sourceUrl);
  const ledger = _ledger || loadLedger();
  ledger.blocked = ledger.blocked || [];
  if (ledger.blocked.some((b) => normalizeUrl(b.sourceUrl) === norm)) return;
  ledger.blocked.push({
    sourceUrl,
    normalizedUrl: norm,
    reason: info.reason || 'manual_block',
    blockedAt: new Date().toISOString(),
    note: info.note || '',
  });
  if (!_ledger) saveLedger(ledger); // only save if we loaded it here
}

/**
 * Filter a list of source objects, removing any that have been struck.
 * Each item must have a .url or .sourceUrl field.
 * @param {Array<{url?:string, sourceUrl?:string}>} sources
 * @returns {Array}
 */
function filterStruck(sources) {
  if (!sources || !sources.length) return sources;
  const filtered = sources.filter((s) => {
    const url = s.url || s.sourceUrl || '';
    if (!url) return true;
    if (wasStruck(url)) {
      console.log(`[strike-monitor] SKIP struck source: ${url}`);
      return false;
    }
    return true;
  });
  return filtered;
}

/**
 * Check recent upload queue items for any that may have been claimed.
 * V1: reads the upload queue and flags items with 'claim' in their error field.
 * Full YT Content ID polling requires OAuth — deferred to V2.
 */
function checkRecentUploads() {
  const queuePath = path.join(ROOT, 'renders', 'queue', 'upload-queue.json');
  let queue;
  try {
    queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (_) {
    console.log('[strike-monitor] no upload queue found');
    return { checked: 0, struck: [] };
  }
  const items = queue.items || [];
  const struck = [];
  for (const item of items) {
    const err = String(item.lastError || item.error || '').toLowerCase();
    const isClaim = /copyright|content.id|claim|strike|removed|blocked/i.test(err);
    if (isClaim && item.sourceUrl) {
      recordStrike(item.sourceUrl, {
        platform: item.kind === 'clip' ? 'youtube+instagram' : 'unknown',
        claimType: 'Content ID (auto-detected from queue error)',
        detectedAt: new Date().toISOString(),
        note: err.slice(0, 200),
      });
      struck.push({ id: item.id, sourceUrl: item.sourceUrl, error: err.slice(0, 200) });
    }
  }
  console.log(`[strike-monitor] checked ${items.length} queue items — ${struck.length} claim(s) detected`);
  return { checked: items.length, struck };
}

module.exports = { wasStruck, recordStrike, blockSource, filterStruck, checkRecentUploads, normalizeUrl };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const r = checkRecentUploads();
    const ledger = loadLedger();
    console.log(`\nStrike ledger: ${LEDGER_PATH}`);
    console.log(`Strikes: ${(ledger.strikes || []).length}`);
    console.log(`Blocked: ${(ledger.blocked || []).length}`);
    (ledger.strikes || []).forEach((s) => console.log(`  STRUCK  ${s.detectedAt} ${s.sourceUrl} [${s.claimType}]`));
    (ledger.blocked || []).forEach((b) => console.log(`  BLOCKED ${b.blockedAt} ${b.sourceUrl} [${b.reason}]`));
  } else if (args.includes('--record')) {
    const i = args.indexOf('--record');
    const url = args[i + 1];
    const claim = args.includes('--claim') ? args[args.indexOf('--claim') + 1] : 'Content ID';
    if (!url) { console.error('Usage: --record <url> [--claim "claim type"]'); process.exit(1); }
    recordStrike(url, { claimType: claim, detectedAt: new Date().toISOString() });
    const ledger = loadLedger();
    saveLedger(ledger);
  } else if (args.includes('--block')) {
    const i = args.indexOf('--block');
    const url = args[i + 1];
    if (!url) { console.error('Usage: --block <url>'); process.exit(1); }
    const ledger = loadLedger();
    blockSource(url, { reason: 'manual_block' }, ledger);
    saveLedger(ledger);
    console.log(`[strike-monitor] BLOCKED: ${url}`);
  } else {
    console.log('Usage: node lib/strike-monitor.js --check | --record <url> [--claim <type>] | --block <url>');
  }
}
