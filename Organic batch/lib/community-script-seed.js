/**
 * lib/community-script-seed.js — Phase 2.2
 *
 * Read every `renders/analytics/comments-{videoId}.json` file produced
 * by `lib/comment-harvester.js`. Pick the single highest-engagement
 * comment that:
 *   - looks like a question (isQuestion: true)
 *   - has likes >= 1
 *   - is unique vs prior 14 days of community seeds (no repeat)
 *
 * Returns a topic object compatible with `scriptFromTopic({ ... })`:
 *   {
 *     title: 'Subscribers asked: "[verbatim question]"',
 *     summary: '<parent video context + comment author>',
 *     link: '<parent video URL>',
 *     sources: ['community-comment'],
 *     publishedAt: <comment harvest ISO>,
 *     score: <comment likes + 0.5*replies>,
 *     community: { commentId, parentVideoId, parentKind, parentTitle, author, originalText }
 *   }
 *
 * Returns null if no qualifying comment found. Callers must handle null
 * and fall back to the regular trending lane.
 *
 * Tracking dedup: `renders/analytics/community-seed-ledger.json` records
 * every comment we've turned into a script so we don't generate the same
 * follow-up twice.
 *
 * Usage:
 *   node lib/community-script-seed.js --dry-run
 *   node lib/community-script-seed.js --refresh    # also re-runs comment-harvester
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'renders', 'analytics');
const LEDGER_PATH = path.join(ANALYTICS_DIR, 'community-seed-ledger.json');

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return { entries: [] };
  try { const j = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); return j && Array.isArray(j.entries) ? j : { entries: [] }; }
  catch (_) { return { entries: [] }; }
}

function appendLedger(entry) {
  ensureDir(ANALYTICS_DIR);
  const state = loadLedger();
  state.entries.push(entry);
  if (state.entries.length > 500) state.entries.splice(0, state.entries.length - 500);
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(state, null, 2));
}

function alreadyUsed(commentId, days = 14) {
  const state = loadLedger();
  const cutoff = Date.now() - days * 86_400_000;
  return state.entries.some((e) => e.commentId === commentId && Date.parse(e.usedAt || 0) >= cutoff);
}

function loadAllComments() {
  if (!fs.existsSync(ANALYTICS_DIR)) return [];
  const files = fs.readdirSync(ANALYTICS_DIR)
    .filter((f) => /^comments-[a-zA-Z0-9_-]+\.json$/.test(f) && !f.includes('harvest'));
  const out = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ANALYTICS_DIR, f), 'utf8'));
      for (const c of j.top || []) {
        out.push({
          ...c,
          parentVideoId: j.videoId,
          parentKind: j.kind,
          parentTitle: j.title,
          parentChannelLabel: j.channelLabel,
          harvestedAt: j.harvestedAt,
        });
      }
    } catch (_) {}
  }
  return out;
}

/**
 * pickSeed({ minLikes, dedupDays }) → topic object or null.
 */
function pickSeed({ minLikes = 1, dedupDays = 14 } = {}) {
  const all = loadAllComments();
  const candidates = all
    .filter((c) => c.isQuestion)
    .filter((c) => c.likes >= minLikes)
    .filter((c) => !alreadyUsed(c.commentId, dedupDays))
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;
  const top = candidates[0];
  const parentLink = top.parentKind === 'youtube'
    ? `https://www.youtube.com/shorts/${top.parentVideoId}`
    : `https://www.instagram.com/p/${top.parentVideoId}/`;
  return {
    title: `Subscribers asked: "${top.text.slice(0, 100)}"`,
    summary: `Top question from our community on the recent video "${top.parentTitle}" — asked by @${top.author}. Original comment: "${top.text}". Build a script that DIRECTLY answers this question, opening with "You asked: '...' — here's the answer."`,
    link: parentLink,
    sources: ['community-comment'],
    publishedAt: top.harvestedAt || new Date().toISOString(),
    score: top.score,
    community: {
      commentId: top.commentId,
      parentVideoId: top.parentVideoId,
      parentKind: top.parentKind,
      parentTitle: top.parentTitle,
      parentChannelLabel: top.parentChannelLabel,
      author: top.author,
      originalText: top.text,
    },
  };
}

/**
 * Mark a seed as used. Called by daily-fresh-batch.js after the
 * community-seeded script renders + uploads successfully.
 */
function markUsed(seed, { videoUrl } = {}) {
  if (!seed || !seed.community || !seed.community.commentId) return;
  appendLedger({
    commentId: seed.community.commentId,
    parentVideoId: seed.community.parentVideoId,
    questionText: seed.community.originalText,
    parentKind: seed.community.parentKind,
    parentTitle: seed.community.parentTitle,
    usedAt: new Date().toISOString(),
    publishedAs: videoUrl || null,
  });
}

module.exports = { pickSeed, markUsed, loadAllComments, alreadyUsed, loadLedger };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--refresh')) {
    const harvester = require('./comment-harvester');
    harvester.harvestAll({ sinceHours: 48 }).then(() => {
      const s = pickSeed();
      console.log(s ? JSON.stringify(s, null, 2) : '(no qualifying question comments found)');
    });
  } else {
    const s = pickSeed();
    console.log(s ? JSON.stringify(s, null, 2) : '(no qualifying question comments found; run --refresh to re-harvest)');
  }
}
