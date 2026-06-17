/**
 * lib/comment-harvester.js — Phase 2.1
 *
 * For every video shipped in the last N hours, harvest the highest-
 * engagement comments and persist a ranked list per video. Output feeds
 * `lib/community-script-seed.js` (Phase 2.2) which uses the top question
 * as the next-day content seed.
 *
 * Sources:
 *   - YouTube: `youtube.commentThreads.list({ videoId, order:'relevance' })`
 *     — uses yt-credentials.json or yt-credentials-2.json depending on the
 *       channel the video was published to (read from performance-ledger).
 *   - Instagram: `GET /{media-id}/comments?fields=text,timestamp,like_count,replies&limit=50`
 *     — uses INSTAGRAM_ACCESS_TOKEN (same as ig-metrics).
 *
 * Ranking: `likeCount + 0.5 * replyCount`. Filter out spam by pattern
 * (emoji-only, subscribe-back, generic compliment-only).
 *
 * Persistence: one file per video at
 *   `renders/analytics/comments-{videoId}.json` = { videoId, kind, harvestedAt, top: [{text, author, likes, replies, score, isQuestion}] }
 *
 * Usage:
 *   node lib/comment-harvester.js --window 48h
 *   node lib/comment-harvester.js --video <id> --platform youtube|instagram
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'renders', 'analytics');
const GRAPH_V = 'v24.0';

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

// ── Spam filters ────────────────────────────────────────────────────────
const SPAM_PATTERNS = [
  /^\s*[\p{Emoji}\s\p{P}]+\s*$/u,                                             // emoji / punctuation only
  /^\s*(nice|cool|good|wow|amazing|love it|great|awesome|first|🔥+|❤️+|👍+|👏+)\s*[!.]*\s*$/i,
  /\b(sub\s*4\s*sub|sub2sub|subscribe\s+back|follow\s+for\s+follow|check\s+out\s+my)\b/i,
  /\b(visit|check)\s+(my\s+)?(channel|page|profile)\b/i,
  /\bhttps?:\/\/(?!youtu)/i,                                                  // external links (allow youtube)
  /\b(promo|cheap|sale|earn|crypto|telegram|whatsapp)\b.*\b(dm|message|link)\b/i,
];

function isSpam(text) {
  const s = String(text || '').trim();
  if (!s || s.length < 4) return true;
  return SPAM_PATTERNS.some((re) => re.test(s));
}

function looksLikeQuestion(text) {
  const s = String(text || '').trim();
  if (/[?？]/.test(s)) return true;
  return /^(what|how|why|when|where|who|which|can|could|should|would|will|is|are|does|do|did)\b/i.test(s);
}

// ── YouTube ─────────────────────────────────────────────────────────────
async function harvestYouTube(videoId, channelLabel) {
  const { google } = require('googleapis');
  const credsFile = channelLabel === 'RagnarShortsUltimate' ? 'yt-credentials-2.json' : 'yt-credentials.json';
  const credsPath = path.join(ROOT, credsFile);
  if (!fs.existsSync(credsPath)) return { ok: false, reason: 'missing_creds:' + credsFile };

  let creds;
  try { creds = JSON.parse(fs.readFileSync(credsPath, 'utf8')); }
  catch (e) { return { ok: false, reason: 'bad_creds:' + e.message }; }

  const oauth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  oauth2.setCredentials({ refresh_token: creds.refresh_token });
  const youtube = google.youtube({ version: 'v3', auth: oauth2 });

  try {
    const r = await youtube.commentThreads.list({
      videoId, part: ['snippet', 'replies'], maxResults: 50, order: 'relevance', textFormat: 'plainText',
    });
    const comments = (r.data.items || []).map((it) => {
      const top = it.snippet && it.snippet.topLevelComment && it.snippet.topLevelComment.snippet;
      const text = top && top.textDisplay || '';
      return {
        commentId: it.id,
        text,
        author: top && top.authorDisplayName,
        likes: Number(top && top.likeCount) || 0,
        replies: Number((it.snippet && it.snippet.totalReplyCount) || 0),
      };
    }).filter((c) => !isSpam(c.text));
    return { ok: true, comments };
  } catch (e) {
    return { ok: false, reason: 'youtube_api:' + (e && e.message || e).slice(0, 240) };
  }
}

// ── Instagram ───────────────────────────────────────────────────────────
async function harvestInstagram(mediaId) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: 'no_INSTAGRAM_ACCESS_TOKEN' };
  const url = `https://graph.facebook.com/${GRAPH_V}/${encodeURIComponent(mediaId)}/comments?fields=text,timestamp,username,like_count,replies{text,username,like_count}&limit=50&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return { ok: false, reason: `ig_http_${r.status}:${(await r.text()).slice(0, 180)}` };
    const json = await r.json();
    const comments = (json.data || []).map((c) => ({
      commentId: c.id,
      text: c.text,
      author: c.username,
      likes: Number(c.like_count) || 0,
      replies: Number((c.replies && c.replies.data && c.replies.data.length) || 0),
    })).filter((c) => !isSpam(c.text));
    return { ok: true, comments };
  } catch (e) {
    return { ok: false, reason: 'ig_fetch:' + (e && e.message || e).slice(0, 240) };
  }
}

// ── Source: which videos shipped in the window ──────────────────────────
function loadShippedVideos({ sinceHours = 48 } = {}) {
  const cutoff = Date.now() - sinceHours * 3600_000;
  const out = [];
  // From performance-ledger (preferred — has channelLabel post Phase 1.4)
  if (fs.existsSync(ANALYTICS_DIR)) {
    const files = fs.readdirSync(ANALYTICS_DIR).filter((f) => /^performance-ledger-\d{4}-\d{2}\.jsonl$/.test(f));
    for (const f of files) {
      try {
        const lines = fs.readFileSync(path.join(ANALYTICS_DIR, f), 'utf8').split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            const ts = Date.parse(j.recordedAt || 0);
            if (ts < cutoff) continue;
            const yt = j.platforms && j.platforms.youtube;
            const ig = j.platforms && j.platforms.instagram;
            if (yt && yt.success && yt.mediaId) {
              out.push({ kind: 'youtube', videoId: yt.mediaId, channelLabel: yt.channelLabel, title: j.metadataPreview && j.metadataPreview.title || j.topic, recordedAt: j.recordedAt });
            }
            if (ig && ig.success && ig.mediaId) {
              out.push({ kind: 'instagram', mediaId: ig.mediaId, title: j.metadataPreview && j.metadataPreview.title || j.topic, recordedAt: j.recordedAt });
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
  }
  // From fresh-batch-upload logs (backup — covers pre-1.4 batches)
  if (fs.existsSync(path.join(ROOT, 'renders'))) {
    const rendersDir = path.join(ROOT, 'renders');
    const files = fs.readdirSync(rendersDir).filter((f) => /^fresh-batch-upload-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(rendersDir, f), 'utf8'));
        for (const it of j.items || []) {
          const ts = Date.parse(it.startedAt || 0);
          if (ts < cutoff) continue;
          if (it.youtube && it.youtube.success && it.youtube.videoId) {
            out.push({ kind: 'youtube', videoId: it.youtube.videoId, channelLabel: it.kind === 'clip' ? 'RagnarShortsUltimate' : 'RagnarShortsAi', title: it.title, recordedAt: it.startedAt });
          }
          if (it.instagram && it.instagram.success && it.instagram.mediaId) {
            out.push({ kind: 'instagram', mediaId: it.instagram.mediaId, title: it.title, recordedAt: it.startedAt });
          }
        }
      } catch (_) {}
    }
  }
  // Dedupe by (kind, videoId|mediaId)
  const seen = new Map();
  for (const v of out) {
    const k = `${v.kind}:${v.videoId || v.mediaId}`;
    const prev = seen.get(k);
    if (!prev || Date.parse(v.recordedAt || 0) > Date.parse(prev.recordedAt || 0)) seen.set(k, v);
  }
  return [...seen.values()];
}

// ── Rank + persist ──────────────────────────────────────────────────────
function rankAndTrim(comments, n = 10) {
  return comments
    .map((c) => ({ ...c, score: c.likes + 0.5 * c.replies, isQuestion: looksLikeQuestion(c.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

async function harvestOne(video) {
  if (video.kind === 'youtube') {
    const r = await harvestYouTube(video.videoId, video.channelLabel);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, top: rankAndTrim(r.comments, 10), totalScanned: r.comments.length };
  }
  if (video.kind === 'instagram') {
    const r = await harvestInstagram(video.mediaId);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, top: rankAndTrim(r.comments, 10), totalScanned: r.comments.length };
  }
  return { ok: false, reason: 'unknown_kind' };
}

async function harvestAll({ sinceHours = 48 } = {}) {
  ensureDir(ANALYTICS_DIR);
  const videos = loadShippedVideos({ sinceHours });
  console.log(`[comment-harvester] ${videos.length} videos in last ${sinceHours}h`);
  const summary = { ranAt: new Date().toISOString(), sinceHours, ok: 0, fail: 0, videos: [] };
  for (const v of videos) {
    const r = await harvestOne(v);
    const idKey = v.videoId || v.mediaId;
    if (r.ok) {
      const out = { videoId: idKey, kind: v.kind, channelLabel: v.channelLabel, title: v.title, harvestedAt: new Date().toISOString(), top: r.top, totalScanned: r.totalScanned };
      fs.writeFileSync(path.join(ANALYTICS_DIR, `comments-${idKey}.json`), JSON.stringify(out, null, 2));
      summary.ok += 1;
      summary.videos.push({ id: idKey, kind: v.kind, topComments: r.top.length });
    } else {
      summary.fail += 1;
      summary.videos.push({ id: idKey, kind: v.kind, error: r.reason });
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  fs.writeFileSync(path.join(ANALYTICS_DIR, `comment-harvest-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(summary, null, 2));
  console.log(`[comment-harvester] ok=${summary.ok}  fail=${summary.fail}`);
  return summary;
}

module.exports = { harvestAll, harvestYouTube, harvestInstagram, loadShippedVideos, looksLikeQuestion, isSpam };

if (require.main === module) {
  const args = process.argv.slice(2);
  const wIdx = args.indexOf('--window');
  let sinceHours = 48;
  if (wIdx >= 0 && args[wIdx + 1]) {
    const v = String(args[wIdx + 1]);
    if (v.endsWith('h')) sinceHours = Number(v.slice(0, -1)) || 48;
    else if (v.endsWith('d')) sinceHours = (Number(v.slice(0, -1)) || 2) * 24;
    else sinceHours = Number(v) || 48;
  }
  harvestAll({ sinceHours }).then((s) => {
    process.exit(s.ok > 0 ? 0 : 1);
  }).catch((e) => { console.error('FATAL:', e); process.exit(2); });
}
